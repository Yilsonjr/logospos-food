import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  RestaurantReportsService,
  PeriodoReporte, FiltroFecha,
  ResumenVentas, VentaPorDia, TopPlato,
  PagoPorMetodo, MargenPlato, ResumenInventario, InsumoReporte,
  GananciasResumen
} from '../../../services/restaurant-reports.service';

interface RendimientoCocina {
  tiempoPromedioMinutos: number;
  ordenesAtendidas: number;
  ordenesExcedidas: number;
}

@Component({
  selector: 'app-reportes-restaurante',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reportes-restaurante.component.html',
  styleUrl: './reportes-restaurante.component.css'
})
export class ReportesRestauranteComponent implements OnInit {

  periodo: PeriodoReporte = 'hoy';
  fechaDesde = '';
  fechaHasta = '';
  tabActiva: 'ventas' | 'platos' | 'pagos' | 'ganancias' | 'margenes' | 'inventario' | 'cocina' = 'ventas';
  cargando = false;

  // Datos
  resumen: ResumenVentas | null = null;
  ventasPorDia: VentaPorDia[] = [];
  topPlatos: TopPlato[] = [];
  pagosPorMetodo: PagoPorMetodo[] = [];
  margenes: MargenPlato[] = [];
  inventario: ResumenInventario | null = null;
  cocina: RendimientoCocina | null = null;
  ganancias: GananciasResumen | null = null;

  readonly periodos: { value: PeriodoReporte; label: string }[] = [
    { value: 'hoy',         label: 'Hoy' },
    { value: 'semana',      label: 'Esta semana' },
    { value: 'mes',         label: 'Este mes' },
    { value: 'personalizado', label: 'Personalizado' }
  ];

  readonly coloresPago: Record<string, string> = {
    efectivo:      '#22c55e',
    tarjeta:       '#3b82f6',
    transferencia: '#a855f7',
    cheque:        '#f59e0b',
    mixto:         '#64748b'
  };

  readonly labelPago: Record<string, string> = {
    efectivo:      'Efectivo',
    tarjeta:       'Tarjeta',
    transferencia: 'Transferencia',
    cheque:        'Cheque',
    mixto:         'Mixto'
  };

  constructor(
    private reportsService: RestaurantReportsService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Inicializar fechas personalizadas con hoy
    const hoy = new Date().toISOString().split('T')[0];
    this.fechaDesde = hoy;
    this.fechaHasta = hoy;
    this.cargarTodo();
  }

  regresar(): void {
    this.router.navigate(['/restaurante']);
  }

  async cambiarPeriodo(p: PeriodoReporte): Promise<void> {
    this.periodo = p;
    if (p !== 'personalizado') await this.cargarTodo();
  }

  async aplicarFechas(): Promise<void> {
    if (!this.fechaDesde || !this.fechaHasta) return;
    await this.cargarTodo();
  }

  get filtro(): FiltroFecha {
    return this.reportsService.filtroParaPeriodo(
      this.periodo,
      { desde: this.fechaDesde, hasta: this.fechaHasta }
    );
  }

  async cargarTodo(): Promise<void> {
    this.cargando = true;
    this.cdr.detectChanges();

    const f = this.filtro;

    // Cada sección falla de forma independiente — una query rota no bloquea las demás
    const [resumen, dias, top, pagos, cocina, ganancias] = await Promise.allSettled([
      this.reportsService.cargarResumenVentas(f),
      this.reportsService.cargarVentasPorDia(f),
      this.reportsService.cargarTopPlatos(f),
      this.reportsService.cargarPagosPorMetodo(f),
      this.reportsService.cargarRendimientoCocina(f),
      this.reportsService.cargarGanancias(f)
    ]);

    if (resumen.status  === 'fulfilled') this.resumen        = resumen.value;
    if (dias.status     === 'fulfilled') this.ventasPorDia   = dias.value;
    if (top.status      === 'fulfilled') this.topPlatos      = top.value;
    if (pagos.status    === 'fulfilled') this.pagosPorMetodo = pagos.value;
    if (cocina.status   === 'fulfilled') this.cocina         = cocina.value;
    if (ganancias.status === 'fulfilled') this.ganancias     = ganancias.value;

    // Inventario y márgenes siempre se cargan, independiente de los demás
    await Promise.allSettled([
      this.cargarMargenes().catch(e => console.warn('[Reportes] márgenes:', e.message)),
      this.cargarInventario().catch(e => console.warn('[Reportes] inventario:', e.message))
    ]);

    this.cargando = false;
    this.cdr.detectChanges();
  }

  async cargarMargenes(): Promise<void> {
    this.margenes = await this.reportsService.cargarMargenesPorPlato();
  }

  async cargarInventario(): Promise<void> {
    this.inventario = await this.reportsService.cargarResumenInventario();
  }

  // ============================================================
  // HELPERS PARA GRÁFICOS CSS
  // ============================================================

  get maxVentaDia(): number {
    return Math.max(...this.ventasPorDia.map(d => d.total), 1);
  }

  barWidth(valor: number, maximo: number): string {
    return `${Math.round((valor / maximo) * 100)}%`;
  }

  get maxTopPlato(): number {
    return Math.max(...this.topPlatos.map(p => p.cantidad), 1);
  }

  colorMargen(pct: number): string {
    if (pct >= 60) return 'text-success';
    if (pct >= 35) return 'text-warning';
    return 'text-danger';
  }

  badgeMargen(pct: number): string {
    if (pct >= 60) return 'badge-margen-alto';
    if (pct >= 35) return 'badge-margen-medio';
    return 'badge-margen-bajo';
  }

  conicGradient(): string {
    if (!this.pagosPorMetodo.length) return 'conic-gradient(#e2e8f0 0% 100%)';
    let acum = 0;
    const partes = this.pagosPorMetodo.map(p => {
      const desde = acum;
      acum += p.porcentaje;
      const color = this.coloresPago[p.forma_pago] || '#94a3b8';
      return `${color} ${desde}% ${acum}%`;
    });
    return `conic-gradient(${partes.join(', ')})`;
  }

  formatMoneda(valor: number): string {
    return `RD$ ${valor.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  trackByFecha(_: number, d: VentaPorDia): string { return d.fecha; }
  trackByPlato(_: number, p: TopPlato): string { return p.menu_item_id; }
  trackByPago(_: number, p: PagoPorMetodo): string { return p.forma_pago; }
  trackByMargen(_: number, m: MargenPlato): string { return m.menu_item_id; }
  trackByGanancia(_: number, g: any): string { return g.menu_item_id; }
  trackByInsumo(_: number, i: InsumoReporte): string { return i.id; }

  colorGanancia(pct: number): string {
    if (pct >= 60) return 'text-success';
    if (pct >= 35) return 'text-warning';
    return 'text-danger';
  }

  badgeGanancia(pct: number): string {
    if (pct >= 60) return 'badge-margen-alto';
    if (pct >= 35) return 'badge-margen-medio';
    return 'badge-margen-bajo';
  }

  // ============================================================
  // INVENTARIO: ordenamiento y filtrado
  // ============================================================

  invOrden: 'nombre' | 'stock' | 'valor' | 'estado' = 'nombre';
  invFiltroReporte: 'todos' | 'bajo' | 'sin_stock' = 'todos';
  invBusquedaReporte = '';

  get invItemsFiltrados(): InsumoReporte[] {
    let items = this.inventario?.items || [];
    const q = this.invBusquedaReporte.trim().toLowerCase();
    if (q) items = items.filter(i =>
      i.nombre.toLowerCase().includes(q) ||
      (i.categoria || '').toLowerCase().includes(q) ||
      (i.proveedor || '').toLowerCase().includes(q)
    );
    if (this.invFiltroReporte === 'bajo')      items = items.filter(i => i.estado === 'bajo');
    if (this.invFiltroReporte === 'sin_stock') items = items.filter(i => i.estado === 'sin_stock');

    return [...items].sort((a, b) => {
      if (this.invOrden === 'stock') return a.cantidad_actual - b.cantidad_actual;
      if (this.invOrden === 'valor') return b.valor_stock - a.valor_stock;
      if (this.invOrden === 'estado') {
        const p = (e: string) => e === 'sin_stock' ? 0 : e === 'bajo' ? 1 : 2;
        return p(a.estado) - p(b.estado);
      }
      return a.nombre.localeCompare(b.nombre);
    });
  }

  get invItemsReposicion(): InsumoReporte[] {
    return (this.inventario?.items || [])
      .filter(i => i.estado === 'bajo' || i.estado === 'sin_stock')
      .sort((a, b) => (a.estado === 'sin_stock' ? -1 : 1) - (b.estado === 'sin_stock' ? -1 : 1));
  }

  get invValorFiltrado(): number {
    return this.invItemsFiltrados.reduce((s, i) => s + i.valor_stock, 0);
  }

  // ============================================================
  // EXPORTAR CSV / EXCEL
  // ============================================================

  private descargarCSV(filas: string[][], nombreArchivo: string): void {
    const bom = '﻿'; // BOM para Excel con tildes
    const contenido = bom + filas
      .map(fila => fila.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportarInventarioCSV(): void {
    if (!this.inventario?.items?.length) return;
    const hoy = new Date().toISOString().split('T')[0];
    const filas: string[][] = [
      ['Nombre', 'Categoría', 'Stock Actual', 'Stock Mínimo', 'Unidad', 'Costo Unitario', 'Valor en Stock', 'Estado', 'Proveedor', 'Ubicación'],
      ...this.inventario.items.map(i => [
        i.nombre,
        i.categoria || '',
        String(i.cantidad_actual),
        String(i.cantidad_minima),
        i.unidad_medida,
        String(i.costo_unitario),
        String(i.valor_stock.toFixed(2)),
        i.estado === 'sin_stock' ? 'Sin stock' : i.estado === 'bajo' ? 'Bajo mínimo' : 'OK',
        i.proveedor || '',
        i.ubicacion || ''
      ])
    ];
    this.descargarCSV(filas, `inventario_restaurante_${hoy}.csv`);
  }

  exportarGananciasCSV(): void {
    if (!this.ganancias?.detalleGanancias?.length) return;
    const hoy = new Date().toISOString().split('T')[0];
    const p = (n: number) => n.toFixed(2);
    const filas: string[][] = [
      ['Plato', 'Unidades Vendidas', 'Ingresos (RD$)', 'Costo Total (RD$)', 'Ganancia (RD$)', 'Margen %', 'Fuente Costo'],
      ...this.ganancias.detalleGanancias.map(g => [
        g.nombre,
        String(g.cantidadVendida),
        p(g.ingresoTotal),
        g.fuente_costo === 'sin_datos' ? '' : p(g.costoTotal),
        g.fuente_costo === 'sin_datos' ? '' : p(g.ganancia),
        g.fuente_costo === 'sin_datos' ? '' : String(g.margenPct) + '%',
        g.fuente_costo === 'receta' ? 'Receta inventario' : g.fuente_costo === 'estimado' ? 'Costo estimado' : 'Sin datos'
      ]),
      ['TOTAL', '', p(this.ganancias.totalVentas), p(this.ganancias.costoEstimado), p(this.ganancias.gananciaEstimada), String(this.ganancias.margenGlobal) + '%', '']
    ];
    this.descargarCSV(filas, `ganancias_restaurante_${hoy}.csv`);
  }

  exportarMargenesCSV(): void {
    if (!this.margenes?.length) return;
    const hoy = new Date().toISOString().split('T')[0];
    const p = (n: number) => n.toFixed(2);
    const filas: string[][] = [
      ['Plato', 'Precio Venta (RD$)', 'Costo Receta (RD$)', 'Margen (RD$)', 'Margen %', 'Rentabilidad', 'Fuente'],
      ...this.margenes.map(m => [
        m.nombre,
        p(m.precio_venta),
        m.fuente_costo === 'sin_datos' ? '' : p(m.costo_receta),
        m.fuente_costo === 'sin_datos' ? '' : p(m.margen),
        m.fuente_costo === 'sin_datos' ? '' : String(m.margen_pct) + '%',
        m.fuente_costo === 'sin_datos' ? 'Sin datos' : m.margen_pct >= 60 ? 'Bueno' : m.margen_pct >= 35 ? 'Aceptable' : 'Revisar',
        m.fuente_costo === 'receta' ? 'Receta' : m.fuente_costo === 'estimado' ? 'Estimado' : 'Sin datos'
      ])
    ];
    this.descargarCSV(filas, `margenes_restaurante_${hoy}.csv`);
  }

  // ============================================================
  // IMPRIMIR / PDF
  // ============================================================

  imprimirReporte(): void {
    window.print();
  }

  periodoLabel(): string {
    const p = this.periodos.find(x => x.value === this.periodo);
    if (this.periodo === 'personalizado') return `${this.fechaDesde} → ${this.fechaHasta}`;
    return p?.label || '';
  }
}
