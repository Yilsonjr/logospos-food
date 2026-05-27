import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type PeriodoReporte = 'hoy' | 'semana' | 'mes' | 'personalizado';

export interface FiltroFecha {
  desde: string; // ISO date string
  hasta: string; // ISO date string (inclusive, end of day)
}

export interface ResumenVentas {
  totalVentas: number;
  totalOrdenes: number;
  ticketPromedio: number;
  totalPropinas: number;
  totalItbis: number;
  totalDescuentos: number;
}

export interface VentaPorDia {
  fecha: string;     // 'YYYY-MM-DD'
  label: string;     // 'Lun 18', 'Mar 19', etc.
  total: number;
  ordenes: number;
}

export interface TopPlato {
  menu_item_id: string;
  nombre: string;
  cantidad: number;
  total: number;
}

export interface PagoPorMetodo {
  forma_pago: string;
  monto: number;
  porcentaje: number;
  ordenes: number;
}

export interface MargenPlato {
  menu_item_id: string;
  nombre: string;
  precio_venta: number;
  costo_receta: number;
  margen: number;
  margen_pct: number;
  sin_receta: boolean;
  /** Origen del costo: receta de inventario, costo_estimado, o sin datos */
  fuente_costo: 'receta' | 'estimado' | 'sin_datos';
}

export interface ResumenInventario {
  total_items: number;
  valor_total_stock: number;
  items_bajo_stock: number;
  items_sin_stock: number;
  top_consumidos: { nombre: string; consumido: number; unidad: string }[];
}

export interface GananciaDetalle {
  menu_item_id: string;
  nombre: string;
  cantidadVendida: number;
  ingresoTotal: number;
  costoUnitario: number;
  costoTotal: number;
  ganancia: number;
  margenPct: number;
  fuente_costo: 'receta' | 'estimado' | 'sin_datos';
}

export interface GananciasResumen {
  totalVentas: number;
  costoEstimado: number;
  gananciaEstimada: number;
  margenGlobal: number;     // %
  platosConCosto: number;
  platosSinCosto: number;
  ingresosNoCosteados: number; // ventas de platos sin costo asignado
  detalleGanancias: GananciaDetalle[];
}

@Injectable({ providedIn: 'root' })
export class RestaurantReportsService {

  constructor(private supabase: SupabaseService) {}

  private get negocioId(): string {
    return localStorage.getItem('logos_negocio_id') || '';
  }

  // ============================================================
  // FILTROS DE FECHA
  // ============================================================

  filtroParaPeriodo(periodo: PeriodoReporte, custom?: { desde: string; hasta: string }): FiltroFecha {
    const ahora = new Date();
    const hoy = ahora.toISOString().split('T')[0];

    if (periodo === 'hoy') {
      return { desde: `${hoy}T00:00:00`, hasta: `${hoy}T23:59:59` };
    }
    if (periodo === 'semana') {
      const lunes = new Date(ahora);
      lunes.setDate(ahora.getDate() - ((ahora.getDay() + 6) % 7));
      const desde = lunes.toISOString().split('T')[0];
      return { desde: `${desde}T00:00:00`, hasta: `${hoy}T23:59:59` };
    }
    if (periodo === 'mes') {
      const desde = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-01`;
      return { desde: `${desde}T00:00:00`, hasta: `${hoy}T23:59:59` };
    }
    // personalizado
    return {
      desde: `${custom!.desde}T00:00:00`,
      hasta: `${custom!.hasta}T23:59:59`
    };
  }

  // ============================================================
  // RESUMEN GENERAL DE VENTAS
  // ============================================================

  async cargarResumenVentas(filtro: FiltroFecha): Promise<ResumenVentas> {
    const { data, error } = await this.supabase.client
      .from('restaurant_orders')
      .select('subtotal, impuesto, descuento, total, propina')
      .eq('negocio_id', this.negocioId)
      .eq('estado', 'cerrada')
      .gte('hora_cierre', filtro.desde)
      .lte('hora_cierre', filtro.hasta);

    if (error) throw error;
    const ordenes = data || [];

    return {
      totalVentas:     ordenes.reduce((s, o) => s + (o.total || 0), 0),
      totalOrdenes:    ordenes.length,
      ticketPromedio:  ordenes.length ? ordenes.reduce((s, o) => s + (o.total || 0), 0) / ordenes.length : 0,
      totalPropinas:   ordenes.reduce((s, o) => s + (o.propina || 0), 0),
      totalItbis:      ordenes.reduce((s, o) => s + (o.impuesto || 0), 0),
      totalDescuentos: ordenes.reduce((s, o) => s + (o.descuento || 0), 0),
    };
  }

  // ============================================================
  // VENTAS AGRUPADAS POR DÍA (para el gráfico de barras)
  // ============================================================

  async cargarVentasPorDia(filtro: FiltroFecha): Promise<VentaPorDia[]> {
    const { data, error } = await this.supabase.client
      .from('restaurant_orders')
      .select('total, hora_cierre')
      .eq('negocio_id', this.negocioId)
      .eq('estado', 'cerrada')
      .gte('hora_cierre', filtro.desde)
      .lte('hora_cierre', filtro.hasta)
      .order('hora_cierre', { ascending: true });

    if (error) throw error;

    const mapa: Record<string, { total: number; ordenes: number }> = {};
    for (const o of data || []) {
      const fecha = (o.hora_cierre as string).split('T')[0];
      if (!mapa[fecha]) mapa[fecha] = { total: 0, ordenes: 0 };
      mapa[fecha].total   += o.total || 0;
      mapa[fecha].ordenes += 1;
    }

    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return Object.entries(mapa).map(([fecha, v]) => {
      const d = new Date(fecha + 'T12:00:00');
      return {
        fecha,
        label: `${dias[d.getDay()]} ${d.getDate()}`,
        total: v.total,
        ordenes: v.ordenes
      };
    });
  }

  // ============================================================
  // TOP PLATOS VENDIDOS
  // ============================================================

  async cargarTopPlatos(filtro: FiltroFecha, limite = 10): Promise<TopPlato[]> {
    // Órdenes cerradas en el período
    const { data: ordenes } = await this.supabase.client
      .from('restaurant_orders')
      .select('id')
      .eq('negocio_id', this.negocioId)
      .eq('estado', 'cerrada')
      .gte('hora_cierre', filtro.desde)
      .lte('hora_cierre', filtro.hasta);

    if (!ordenes?.length) return [];
    const orderIds = ordenes.map(o => o.id);

    const { data: items, error } = await this.supabase.client
      .from('restaurant_order_items')
      .select('menu_item_id, cantidad, subtotal, menu_item:menu_items(nombre)')
      .in('order_id', orderIds)
      .neq('estado', 'cancelado');

    if (error) throw error;

    const mapa: Record<string, TopPlato> = {};
    for (const item of items || []) {
      if (!mapa[item.menu_item_id]) {
        mapa[item.menu_item_id] = {
          menu_item_id: item.menu_item_id,
          nombre: (item.menu_item as any)?.nombre || 'Desconocido',
          cantidad: 0,
          total: 0
        };
      }
      mapa[item.menu_item_id].cantidad += item.cantidad;
      mapa[item.menu_item_id].total    += item.subtotal || 0;
    }

    return Object.values(mapa)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, limite);
  }

  // ============================================================
  // VENTAS POR MÉTODO DE PAGO
  // ============================================================

  async cargarPagosPorMetodo(filtro: FiltroFecha): Promise<PagoPorMetodo[]> {
    const { data, error } = await this.supabase.client
      .from('restaurant_order_payments')
      .select('forma_pago, monto')
      .eq('negocio_id', this.negocioId)
      .eq('pagado', true)
      .gte('created_at', filtro.desde)
      .lte('created_at', filtro.hasta);

    if (error) throw error;

    const mapa: Record<string, { monto: number; ordenes: number }> = {};
    for (const p of data || []) {
      if (!mapa[p.forma_pago]) mapa[p.forma_pago] = { monto: 0, ordenes: 0 };
      mapa[p.forma_pago].monto   += p.monto || 0;
      mapa[p.forma_pago].ordenes += 1;
    }

    const total = Object.values(mapa).reduce((s, v) => s + v.monto, 0);

    return Object.entries(mapa).map(([forma_pago, v]) => ({
      forma_pago,
      monto: v.monto,
      ordenes: v.ordenes,
      porcentaje: total > 0 ? Math.round((v.monto / total) * 100) : 0
    })).sort((a, b) => b.monto - a.monto);
  }

  // ============================================================
  // RENTABILIDAD / MARGEN POR PLATO
  // ============================================================

  async cargarMargenesPorPlato(): Promise<MargenPlato[]> {
    // Traer todos los items de menú activos (incluye costo_estimado)
    const { data: items } = await this.supabase.client
      .from('menu_items')
      .select('id, nombre, precio, costo_estimado')
      .eq('negocio_id', this.negocioId)
      .eq('activo', true)
      .eq('disponible', true);

    if (!items?.length) return [];

    // Traer todas las recetas con costo de insumo
    const { data: recetas } = await this.supabase.client
      .from('menu_item_recipes')
      .select(`
        menu_item_id,
        cantidad_requerida,
        inventario:inventory_item_id (costo_unitario)
      `)
      .in('menu_item_id', items.map(i => i.id));

    // Calcular costo por receta
    const costosPorReceta: Record<string, number> = {};
    for (const r of recetas || []) {
      const costo = ((r.inventario as any)?.costo_unitario || 0) * (r.cantidad_requerida || 0);
      costosPorReceta[r.menu_item_id] = (costosPorReceta[r.menu_item_id] || 0) + costo;
    }

    return items.map(item => {
      const precio = item.precio || 0;
      const tieneReceta    = item.id in costosPorReceta;
      const tieneCostoEst  = item.costo_estimado != null && item.costo_estimado > 0;

      let costoReal: number;
      let fuente: 'receta' | 'estimado' | 'sin_datos';

      if (tieneReceta) {
        costoReal = costosPorReceta[item.id];
        fuente = 'receta';
      } else if (tieneCostoEst) {
        costoReal = item.costo_estimado!;
        fuente = 'estimado';
      } else {
        costoReal = 0;
        fuente = 'sin_datos';
      }

      const sinDatos = fuente === 'sin_datos';
      return {
        menu_item_id:         item.id,
        nombre:               item.nombre,
        precio_venta:         precio,
        costo_receta:         costoReal,
        margen:               precio - costoReal,
        margen_pct:           precio > 0 && !sinDatos ? Math.round(((precio - costoReal) / precio) * 100) : 0,
        sin_receta:           !tieneReceta,
        fuente_costo:         fuente
      };
    }).sort((a, b) => b.margen_pct - a.margen_pct);
  }

  // ============================================================
  // RESUMEN DE INVENTARIO
  // ============================================================

  async cargarResumenInventario(): Promise<ResumenInventario> {
    const { data: items } = await this.supabase.client
      .from('restaurant_inventory')
      .select('nombre, cantidad_actual, cantidad_minima, costo_unitario, unidad_medida')
      .eq('negocio_id', this.negocioId)
      .eq('activo', true);

    const inventario = items || [];

    // Top consumidos: movimientos de los últimos 30 días tipo salida/produccion
    const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: movs } = await this.supabase.client
      .from('restaurant_inventory_movements')
      .select('inventory_item_id, cantidad, inventario:inventory_item_id(nombre, unidad_medida)')
      .eq('negocio_id', this.negocioId)
      .in('tipo_movimiento', ['salida', 'produccion', 'merma'])
      .gte('created_at', hace30);

    const consumoMapa: Record<string, { nombre: string; consumido: number; unidad: string }> = {};
    for (const m of movs || []) {
      const id = m.inventory_item_id;
      if (!consumoMapa[id]) {
        consumoMapa[id] = {
          nombre:   (m.inventario as any)?.nombre || '?',
          consumido: 0,
          unidad:   (m.inventario as any)?.unidad_medida || ''
        };
      }
      consumoMapa[id].consumido += m.cantidad || 0;
    }

    const topConsumidos = Object.values(consumoMapa)
      .sort((a, b) => b.consumido - a.consumido)
      .slice(0, 8);

    return {
      total_items:        inventario.length,
      valor_total_stock:  inventario.reduce((s, i) => s + (i.cantidad_actual * i.costo_unitario), 0),
      items_bajo_stock:   inventario.filter(i => i.cantidad_actual <= i.cantidad_minima && i.cantidad_actual > 0).length,
      items_sin_stock:    inventario.filter(i => i.cantidad_actual <= 0).length,
      top_consumidos:     topConsumidos
    };
  }

  // ============================================================
  // GANANCIAS REALES DEL PERÍODO (ingresos - COGS estimado)
  // ============================================================

  async cargarGanancias(filtro: FiltroFecha): Promise<GananciasResumen> {
    // 1. Órdenes cerradas en el período
    const { data: ordenes } = await this.supabase.client
      .from('restaurant_orders')
      .select('id, total')
      .eq('negocio_id', this.negocioId)
      .eq('estado', 'cerrada')
      .gte('hora_cierre', filtro.desde)
      .lte('hora_cierre', filtro.hasta);

    if (!ordenes?.length) {
      return {
        totalVentas: 0, costoEstimado: 0, gananciaEstimada: 0,
        margenGlobal: 0, platosConCosto: 0, platosSinCosto: 0,
        ingresosNoCosteados: 0, detalleGanancias: []
      };
    }

    const orderIds = ordenes.map(o => o.id);
    const totalVentas = ordenes.reduce((s, o) => s + (o.total || 0), 0);

    // 2. Items vendidos en esas órdenes
    const { data: items } = await this.supabase.client
      .from('restaurant_order_items')
      .select('menu_item_id, cantidad, subtotal, menu_item:menu_items(nombre, precio, costo_estimado)')
      .in('order_id', orderIds)
      .neq('estado', 'cancelado');

    if (!items?.length) {
      return {
        totalVentas, costoEstimado: 0, gananciaEstimada: totalVentas,
        margenGlobal: 100, platosConCosto: 0, platosSinCosto: 0,
        ingresosNoCosteados: totalVentas, detalleGanancias: []
      };
    }

    // Agrupar por menu_item_id
    const agrupado: Record<string, {
      nombre: string; cantidadVendida: number; ingresoTotal: number;
      precioUnitario: number; costoEstimado: number | null;
    }> = {};

    for (const it of items) {
      const id = it.menu_item_id;
      const mi = it.menu_item as any;
      if (!agrupado[id]) {
        agrupado[id] = {
          nombre: mi?.nombre || 'Desconocido',
          cantidadVendida: 0,
          ingresoTotal: 0,
          precioUnitario: mi?.precio || 0,
          costoEstimado: mi?.costo_estimado ?? null
        };
      }
      agrupado[id].cantidadVendida += it.cantidad || 0;
      agrupado[id].ingresoTotal    += it.subtotal || 0;
    }

    const menuIds = Object.keys(agrupado);

    // 3. Costos de receta (suma de insumos × costo unitario por plato)
    const { data: recetas } = await this.supabase.client
      .from('menu_item_recipes')
      .select('menu_item_id, cantidad_requerida, inventario:inventory_item_id(costo_unitario)')
      .in('menu_item_id', menuIds);

    const costosPorReceta: Record<string, number> = {};
    for (const r of recetas || []) {
      const costo = ((r.inventario as any)?.costo_unitario || 0) * (r.cantidad_requerida || 0);
      costosPorReceta[r.menu_item_id] = (costosPorReceta[r.menu_item_id] || 0) + costo;
    }

    // 4. Construir detalle
    const detalleGanancias: GananciaDetalle[] = [];
    let costoEstimadoTotal = 0;
    let ingresosNoCosteados = 0;
    const setConCosto = new Set<string>();

    for (const [id, ag] of Object.entries(agrupado)) {
      const tieneReceta   = id in costosPorReceta;
      const tieneCostoEst = ag.costoEstimado != null && ag.costoEstimado > 0;

      let costoUnitario: number;
      let fuente: 'receta' | 'estimado' | 'sin_datos';

      if (tieneReceta) {
        costoUnitario = costosPorReceta[id];
        fuente = 'receta';
      } else if (tieneCostoEst) {
        costoUnitario = ag.costoEstimado!;
        fuente = 'estimado';
      } else {
        costoUnitario = 0;
        fuente = 'sin_datos';
      }

      const costoTotal = costoUnitario * ag.cantidadVendida;
      const ganancia   = ag.ingresoTotal - costoTotal;
      const margenPct  = ag.ingresoTotal > 0 && fuente !== 'sin_datos'
        ? Math.round((ganancia / ag.ingresoTotal) * 100)
        : 0;

      if (fuente !== 'sin_datos') {
        costoEstimadoTotal += costoTotal;
        setConCosto.add(id);
      } else {
        ingresosNoCosteados += ag.ingresoTotal;
      }

      detalleGanancias.push({
        menu_item_id: id,
        nombre: ag.nombre,
        cantidadVendida: ag.cantidadVendida,
        ingresoTotal: ag.ingresoTotal,
        costoUnitario,
        costoTotal,
        ganancia,
        margenPct,
        fuente_costo: fuente
      });
    }

    detalleGanancias.sort((a, b) => b.ganancia - a.ganancia);

    const gananciaEstimada = totalVentas - costoEstimadoTotal;
    const baseParaMargen   = totalVentas - ingresosNoCosteados;
    const margenGlobal     = baseParaMargen > 0
      ? Math.round((gananciaEstimada / baseParaMargen) * 100)
      : 0;

    return {
      totalVentas,
      costoEstimado:     costoEstimadoTotal,
      gananciaEstimada,
      margenGlobal,
      platosConCosto:    setConCosto.size,
      platosSinCosto:    menuIds.length - setConCosto.size,
      ingresosNoCosteados,
      detalleGanancias
    };
  }

  // ============================================================
  // RENDIMIENTO DE COCINA
  // ============================================================

  async cargarRendimientoCocina(filtro: FiltroFecha): Promise<{
    tiempoPromedioMinutos: number;
    ordenesAtendidas: number;
    ordenesExcedidas: number; // > 20 min
  }> {
    const { data, error } = await this.supabase.client
      .from('kitchen_tickets')
      .select('hora_creacion, hora_listo')
      .eq('negocio_id', this.negocioId)
      .eq('estado', 'entregado')
      .not('hora_listo', 'is', null)
      .gte('hora_creacion', filtro.desde)
      .lte('hora_creacion', filtro.hasta);

    if (error || !data?.length) return { tiempoPromedioMinutos: 0, ordenesAtendidas: 0, ordenesExcedidas: 0 };

    const tiempos = data.map(t => {
      const diff = (new Date(t.hora_listo).getTime() - new Date(t.hora_creacion).getTime()) / 60000;
      return Math.max(0, diff);
    });

    return {
      tiempoPromedioMinutos: Math.round(tiempos.reduce((s, t) => s + t, 0) / tiempos.length),
      ordenesAtendidas:      data.length,
      ordenesExcedidas:      tiempos.filter(t => t > 20).length
    };
  }
}
