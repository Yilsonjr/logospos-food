import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { NegociosService } from './negocios.service';
import { RestaurantPrinter, RuteoImpresora, RuteoItem, ModificadorSeleccionado } from '../models/restaurant.models';

// ============================================================
// Constantes ESC/POS
// ============================================================
const ESC  = 0x1B;
const GS   = 0x1D;
const LF   = 0x0A;
const INIT          = [ESC, 0x40];
const BOLD_ON       = [ESC, 0x45, 0x01];
const BOLD_OFF      = [ESC, 0x45, 0x00];
const ALIGN_LEFT    = [ESC, 0x61, 0x00];
const ALIGN_CENTER  = [ESC, 0x61, 0x01];
const ALIGN_RIGHT   = [ESC, 0x61, 0x02];
const FONT_NORMAL   = [ESC, 0x21, 0x00];
const FONT_DOUBLE   = [ESC, 0x21, 0x30];  // doble ancho + alto
const CUT_FULL      = [GS,  0x56, 0x00];
const CUT_PARTIAL   = [GS,  0x56, 0x01];

@Injectable({ providedIn: 'root' })
export class PrintService {

  constructor(
    private supabaseService: SupabaseService,
    private negociosService: NegociosService
  ) {}

  // ============================================================
  // URL del agente de impresión
  // Prioridad: localStorage (override técnico) → negocio.print_agent_url
  // ============================================================
  get agentUrl(): string | null {
    const override = localStorage.getItem('logos_print_agent_url');
    if (override) return override;
    return this.negociosService.negocio$
      ? (this.negociosService as any)['negocioSubject']?.value?.print_agent_url ?? null
      : null;
  }

  get negocioId(): string {
    return localStorage.getItem('logos_negocio_id') || '';
  }

  // ============================================================
  // CRUD impresoras
  // ============================================================

  async cargarImpresoras(): Promise<RestaurantPrinter[]> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_printers')
      .select('*')
      .eq('negocio_id', this.negocioId)
      .order('tipo')
      .order('nombre');

    if (error) throw error;
    return data || [];
  }

  async crearImpresora(printer: Omit<RestaurantPrinter, 'id' | 'negocio_id' | 'created_at' | 'updated_at'>): Promise<RestaurantPrinter> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_printers')
      .insert({ ...printer, negocio_id: this.negocioId })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async actualizarImpresora(id: string, cambios: Partial<RestaurantPrinter>): Promise<RestaurantPrinter> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_printers')
      .update(cambios)
      .eq('id', id)
      .eq('negocio_id', this.negocioId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async eliminarImpresora(id: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('restaurant_printers')
      .delete()
      .eq('id', id)
      .eq('negocio_id', this.negocioId);

    if (error) throw error;
  }

  async probarConexion(printer: RestaurantPrinter): Promise<boolean> {
    const url = this.agentUrl;
    if (!url) throw new Error('No hay agente de impresión configurado.');

    const response = await fetch(`${url}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: printer.ip, puerto: printer.puerto }),
      signal: AbortSignal.timeout(5000)
    });

    return response.ok;
  }

  // ============================================================
  // RUTEO DE ORDEN
  // Agrupa ítems pendientes de la orden por impresora destino
  // ============================================================

  async obtenerRuteoOrden(orderId: string): Promise<RuteoImpresora[]> {
    const { data, error } = await this.supabaseService.client
      .rpc('get_ruteo_orden', { p_order_id: orderId });

    if (error) throw error;
    if (!data || data.length === 0) return [];

    // Agrupar filas planas en objetos RuteoImpresora[]
    const map = new Map<string, RuteoImpresora>();

    for (const row of data) {
      if (!map.has(row.printer_id)) {
        map.set(row.printer_id, {
          printer_id:           row.printer_id,
          printer_nombre:       row.printer_nombre,
          printer_ip:           row.printer_ip,
          printer_puerto:       row.printer_puerto,
          printer_tipo:         row.printer_tipo,
          printer_tipo_conexion: row.printer_tipo_conexion,
          printer_puerto_usb:   row.printer_puerto_usb,
          printer_chars:        row.printer_chars,
          printer_corte:        row.printer_corte,
          copies:               row.printer_copies || 1,
          items: []
        });
      }
      map.get(row.printer_id)!.items.push({
        item_id:           row.item_id,
        menu_item_nombre:  row.menu_item_nombre,
        cantidad:          row.cantidad,
        modificadores:     row.modificadores || [],
        notas_especiales:  row.notas_especiales,
        comensal_asignado: row.comensal_asignado
      });
    }

    return Array.from(map.values());
  }

  // ============================================================
  // IMPRESIÓN
  // Envía el ticket ESC/POS al agente de impresión local
  // ============================================================

  async imprimirOrden(
    orderId:      string,
    numeroMesa:   number,
    meseroNombre: string
  ): Promise<{ impresos: number; errores: string[] }> {
    const url = this.agentUrl;
    if (!url) throw new Error('Agente de impresión no configurado. Verifica la URL en la configuración del negocio.');

    const grupos = await this.obtenerRuteoOrden(orderId);
    if (!grupos.length) return { impresos: 0, errores: [] };

    const errores: string[] = [];
    let impresos = 0;

    for (const grupo of grupos) {
      try {
        const bytes = this.generarTicketComanda(grupo, numeroMesa, meseroNombre);
        await this.enviarAlAgente(url, grupo.printer_ip, grupo.printer_puerto, bytes, grupo.copies ?? 1, grupo.printer_tipo_conexion as any, grupo.printer_puerto_usb);
        impresos++;
      } catch (e: any) {
        errores.push(`${grupo.printer_nombre}: ${e.message}`);
      }
    }

    return { impresos, errores };
  }

  async imprimirRecibo(
    orderId:     string,
    printer:     RestaurantPrinter,
    nombreNegocio: string,
    subtotal:    number,
    impuesto:    number,
    total:       number
  ): Promise<void> {
    const url = this.agentUrl;
    if (!url) throw new Error('Agente de impresión no configurado.');

    const bytes = this.generarRecibo(printer, nombreNegocio, subtotal, impuesto, total);
    await this.enviarAlAgente(url, printer.ip, printer.puerto, bytes, printer.copies, printer.tipo_conexion, printer.puerto_usb);
  }

  /**
   * Imprime el recibo completo de una orden de restaurante al cerrar el cobro.
   * Busca automáticamente la impresora de tipo 'caja' activa.
   * Si no hay agente o impresora configurada, omite silenciosamente.
   */
  /**
   * Retorna true si imprimió en térmica, false si no había agente/impresora configurada.
   * Lanza error solo si el envío al agente falla (impresora fuera de línea, etc.).
   */
  async imprimirReciboRestaurant(params: {
    orden: {
      id: string;
      mesa?: { numero_mesa: number } | null;
      items?: any[];
      subtotal: number;
      impuesto: number;
      total: number;
    };
    propina: number;
    formaPago: string;
    negocioNombre: string;
  }): Promise<boolean> {
    const url = this.agentUrl;
    if (!url) return false;

    let impresoras: RestaurantPrinter[] = [];
    try {
      impresoras = await this.cargarImpresoras();
    } catch { return false; }

    const cajaP = impresoras.find(p => p.tipo === 'caja' && p.activa);
    if (!cajaP) return false;

    const bytes = this.generarReciboRestaurant(cajaP, params);
    await this.enviarAlAgente(url, cajaP.ip, cajaP.puerto, bytes, cajaP.copies, cajaP.tipo_conexion, cajaP.puerto_usb);
    return true;
  }

  /**
   * Imprime la pre-cuenta (documento no fiscal) en la impresora tipo 'caja'.
   * Retorna true si imprimió en térmica, false si no hay agente/impresora.
   */
  async imprimirPrecuenta(params: {
    identificador: string;
    ordenId: string;
    items: Array<{ cantidad: number; nombre: string; subtotal: number; notas?: string }>;
    subtotal: number;
    impuesto: number;
    total: number;
    negocioNombre: string;
  }): Promise<boolean> {
    const url = this.agentUrl;
    if (!url) return false;

    let impresoras: RestaurantPrinter[] = [];
    try { impresoras = await this.cargarImpresoras(); } catch { return false; }

    const cajaP = impresoras.find(p => p.tipo === 'caja' && p.activa);
    if (!cajaP) return false;

    const bytes = this.generarPrecuenta(cajaP, params);
    await this.enviarAlAgente(url, cajaP.ip, cajaP.puerto, bytes, cajaP.copies, cajaP.tipo_conexion, cajaP.puerto_usb);
    return true;
  }

  private generarPrecuenta(
    printer: RestaurantPrinter,
    params: {
      identificador: string;
      ordenId: string;
      items: Array<{ cantidad: number; nombre: string; subtotal: number; notas?: string }>;
      subtotal: number;
      impuesto: number;
      total: number;
      negocioNombre: string;
    }
  ): number[] {
    const chars = printer.caracteres_por_linea || 42;
    const buf: number[] = [];
    const push  = (...bytes: number[]) => buf.push(...bytes);
    const texto = (str: string)        => buf.push(...this.encodeText(str));
    const linea = (str = '')           => { texto(str); push(LF); };
    const sep   = (c = '-')            => linea(c.repeat(chars));
    const fmt   = (n: number)          => `RD$ ${n.toFixed(2)}`;
    const col2  = (izq: string, der: string) => {
      const espacio = Math.max(1, chars - izq.length - der.length);
      linea(izq + ' '.repeat(espacio) + der);
    };

    push(...INIT, ...ALIGN_CENTER, ...BOLD_ON);
    if (params.negocioNombre.length <= Math.floor(chars / 2)) {
      push(...FONT_DOUBLE); linea(params.negocioNombre); push(...FONT_NORMAL);
    } else {
      linea(params.negocioNombre);
    }
    push(...BOLD_OFF);
    linea('PRE-CUENTA');
    linea('-- DOCUMENTO NO FISCAL --');
    sep('=');

    push(...ALIGN_LEFT);
    col2(params.identificador, `#${params.ordenId.slice(-6).toUpperCase()}`);
    linea(new Date().toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }));
    sep();

    for (const item of params.items) {
      const precio  = fmt(item.subtotal);
      const izqLen  = chars - precio.length - 1;
      const izq     = `${item.cantidad}x ${item.nombre}`.substring(0, izqLen);
      col2(izq.padEnd(izqLen), precio);
      if (item.notas) linea(`  * ${item.notas}`);
    }
    sep();

    col2('Subtotal:', fmt(params.subtotal));
    if (params.impuesto > 0) col2('ITBIS:', fmt(params.impuesto));
    sep();
    push(...BOLD_ON);
    col2('TOTAL ESTIMADO:', fmt(params.total));
    push(...BOLD_OFF);
    sep('=');

    push(...ALIGN_CENTER);
    linea('Este documento no es comprobante fiscal.');
    push(LF, LF);

    if (printer.corte_automatico) push(...CUT_FULL);
    return buf;
  }

  // ============================================================
  // Generación ESC/POS — Comanda de cocina/barra
  // ============================================================

  private generarTicketComanda(
    grupo:       RuteoImpresora,
    numeroMesa:  number,
    mesero:      string
  ): number[] {
    const chars = grupo.printer_chars || 42;
    const buf: number[] = [];

    const push = (...bytes: number[]) => buf.push(...bytes);
    const texto = (str: string) => buf.push(...this.encodeText(str));
    const linea = (str = '') => { texto(str); push(LF); };
    const separador = (c = '-') => linea(c.repeat(chars));

    push(...INIT);
    push(...ALIGN_CENTER);
    push(...FONT_DOUBLE);
    push(...BOLD_ON);
    linea(grupo.printer_nombre.toUpperCase());
    push(...FONT_NORMAL);
    push(...BOLD_OFF);

    separador('=');

    push(...ALIGN_LEFT);
    push(...BOLD_ON);
    texto('MESA: '); push(...BOLD_OFF);
    linea(`${numeroMesa}`);

    push(...BOLD_ON);
    texto('MESERO: '); push(...BOLD_OFF);
    linea(mesero);

    push(...BOLD_ON);
    texto('HORA: '); push(...BOLD_OFF);
    linea(new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }));

    separador();

    for (const item of grupo.items) {
      push(...BOLD_ON);
      linea(`${item.cantidad}x ${item.menu_item_nombre}`);
      push(...BOLD_OFF);

      if (item.modificadores?.length) {
        for (const mod of item.modificadores as ModificadorSeleccionado[]) {
          linea(`   + ${mod.nombre}`);
        }
      }

      if (item.notas_especiales) {
        linea(`   * ${item.notas_especiales}`);
      }

      if (item.comensal_asignado) {
        linea(`   [Comensal ${item.comensal_asignado}]`);
      }

      push(LF);
    }

    separador();
    push(...ALIGN_CENTER);
    linea('*** ORDEN NUEVA ***');
    push(LF, LF);

    if (grupo.printer_corte) push(...CUT_PARTIAL);

    return buf;
  }

  // ============================================================
  // Generación ESC/POS — Recibo completo de restaurante
  // ============================================================

  private generarReciboRestaurant(
    printer: RestaurantPrinter,
    params: {
      orden: { id: string; mesa?: { numero_mesa: number } | null; items?: any[]; subtotal: number; impuesto: number; total: number };
      propina: number;
      formaPago: string;
      negocioNombre: string;
    }
  ): number[] {
    const { orden, propina, formaPago, negocioNombre } = params;
    const chars = printer.caracteres_por_linea || 42;
    const buf: number[] = [];

    const push  = (...bytes: number[]) => buf.push(...bytes);
    const texto = (str: string)        => buf.push(...this.encodeText(str));
    const linea = (str = '')           => { texto(str); push(LF); };
    const sep   = (c = '-')            => linea(c.repeat(chars));
    const col2  = (izq: string, der: string) => {
      const espacio = chars - izq.length - der.length;
      linea(izq + ' '.repeat(Math.max(1, espacio)) + der);
    };
    const fmt   = (n: number) => `RD$ ${n.toFixed(2)}`;

    // Cabecera
    push(...INIT, ...ALIGN_CENTER, ...BOLD_ON, ...FONT_DOUBLE);
    if (negocioNombre.length <= Math.floor(chars / 2)) {
      push(...FONT_DOUBLE); linea(negocioNombre); push(...FONT_NORMAL);
    } else {
      linea(negocioNombre);
    }
    push(...FONT_NORMAL, ...BOLD_OFF);
    sep('=');

    // Info orden
    push(...ALIGN_LEFT);
    const mesaLabel = orden.mesa?.numero_mesa ? `Mesa ${orden.mesa.numero_mesa}` : 'Orden';
    const ordenId   = `#${orden.id.slice(-6).toUpperCase()}`;
    col2(mesaLabel, ordenId);
    const ahora = new Date().toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });
    linea(ahora);
    sep();

    // Ítems
    const items = (orden.items || []).filter((i: any) => i.estado !== 'cancelado');
    for (const item of items) {
      const nombre = item.menu_item?.nombre || 'Item';
      const precio = fmt(item.subtotal);
      const izqLen = chars - precio.length - 1;
      const izq    = `${item.cantidad}x ${nombre}`.substring(0, izqLen);
      col2(izq.padEnd(izqLen), precio);

      if (item.modificadores_seleccionados?.length) {
        for (const mod of item.modificadores_seleccionados) {
          linea(`  + ${mod.nombre}`);
        }
      }
      if (item.notas_especiales) {
        linea(`  * ${item.notas_especiales}`);
      }
    }

    sep();

    // Totales
    col2('Subtotal:', fmt(orden.subtotal));
    if (orden.impuesto > 0) col2('ITBIS:', fmt(orden.impuesto));
    if (propina > 0)        col2('Propina:', fmt(propina));
    sep();
    push(...BOLD_ON);
    col2('TOTAL:', fmt(orden.total + propina));
    push(...BOLD_OFF);

    const pagoMap: Record<string, string> = {
      efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia',
      cheque: 'Cheque', mixto: 'Efectivo + Tarjeta'
    };
    linea(`Pago: ${pagoMap[formaPago] ?? formaPago}`);
    sep('=');

    // Pie
    push(...ALIGN_CENTER);
    linea('Gracias por su visita!');
    push(LF, LF);

    if (printer.corte_automatico) push(...CUT_FULL);
    return buf;
  }

  // ============================================================
  // Generación ESC/POS — Recibo de caja (simple, POS)
  // ============================================================

  private generarRecibo(
    printer:    RestaurantPrinter,
    negocio:    string,
    subtotal:   number,
    impuesto:   number,
    total:      number
  ): number[] {
    const chars = printer.caracteres_por_linea || 42;
    const buf: number[] = [];

    const push  = (...bytes: number[]) => buf.push(...bytes);
    const texto = (str: string)        => buf.push(...this.encodeText(str));
    const linea = (str = '')           => { texto(str); push(LF); };
    const sep   = (c = '-')            => linea(c.repeat(chars));
    const col2  = (izq: string, der: string) => {
      const espacio = chars - izq.length - der.length;
      linea(izq + ' '.repeat(Math.max(1, espacio)) + der);
    };

    const fmt = (n: number) => `RD$ ${n.toFixed(2)}`;

    push(...INIT, ...ALIGN_CENTER, ...BOLD_ON, ...FONT_DOUBLE);
    linea(negocio);
    push(...FONT_NORMAL, ...BOLD_OFF);
    sep('=');

    push(...ALIGN_LEFT);
    col2('Subtotal:', fmt(subtotal));
    if (impuesto > 0) col2('ITBIS:', fmt(impuesto));
    sep();
    push(...BOLD_ON);
    col2('TOTAL:', fmt(total));
    push(...BOLD_OFF);
    sep('=');

    push(...ALIGN_CENTER);
    linea('Gracias por su visita!');
    push(LF, LF);

    if (printer.corte_automatico) push(...CUT_FULL);

    return buf;
  }

  // ============================================================
  // Helpers
  // ============================================================

  private encodeText(str: string): number[] {
    // Codificación Latin-1 básica (suficiente para ESC/POS estándar)
    return Array.from(str).map(c => {
      const code = c.charCodeAt(0);
      return code < 256 ? code : 0x3F; // '?' para caracteres fuera de rango
    });
  }

  private async enviarAlAgente(
    agentUrl:  string,
    ip:        string,
    puerto:    number,
    bytes:     number[],
    copies:    number,
    tipoConexion: 'red' | 'usb' = 'red',
    puertoUsb?: string | null
  ): Promise<void> {
    let endpoint: string;
    let body: object;

    if (tipoConexion === 'usb') {
      if (!puertoUsb) throw new Error('Nombre de impresora USB no configurado (ej: POS-80)');
      endpoint = `${agentUrl}/print-usb`;
      body = { printer_name: puertoUsb, data: bytes, copies };
    } else {
      endpoint = `${agentUrl}/print`;
      body = { ip, puerto, data: bytes, copies };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(tipoConexion === 'usb' ? 25000 : 8000)
    });

    if (!response.ok) {
      const msg = await response.text().catch(() => response.statusText);
      throw new Error(`Error del agente: ${msg}`);
    }
  }

  /** Lista las impresoras instaladas en Windows (vía agente local) */
  async listarImpresoras(): Promise<{ Name: string; PortName: string; PrinterStatus: number }[]> {
    const url = this.agentUrl;
    if (!url) return [];
    try {
      const r = await fetch(`${url}/list-printers`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return [];
      const { impresoras } = await r.json();
      return impresoras || [];
    } catch { return []; }
  }

  /**
   * Imprime el resumen de cierre de caja en la impresora tipo 'caja'.
   * Retorna true si imprimió en térmica, false si no hay agente/impresora.
   */
  async imprimirCierreCaja(datos: {
    id: number;
    fecha_apertura: string;
    fecha_cierre: string;
    monto_inicial: number;
    ventas_efectivo: number;
    ventas_tarjeta: number;
    total_entradas: number;
    total_salidas: number;
    monto_esperado: number;
    monto_real: number;
    diferencia: number;
    usuario_apertura: string;
    usuario_cierre?: string;
    negocioNombre: string;
  }): Promise<boolean> {
    const url = this.agentUrl;
    if (!url) return false;

    let impresoras: RestaurantPrinter[] = [];
    try { impresoras = await this.cargarImpresoras(); } catch { return false; }

    const cajaP = impresoras.find(p => p.tipo === 'caja' && p.activa);
    if (!cajaP) return false;

    const bytes = this.generarTicketCierre(cajaP, datos);
    await this.enviarAlAgente(url, cajaP.ip, cajaP.puerto, bytes, cajaP.copies, cajaP.tipo_conexion, cajaP.puerto_usb);
    return true;
  }

  private generarTicketCierre(
    printer: RestaurantPrinter,
    datos: {
      id: number;
      fecha_apertura: string;
      fecha_cierre: string;
      monto_inicial: number;
      ventas_efectivo: number;
      ventas_tarjeta: number;
      total_entradas: number;
      total_salidas: number;
      monto_esperado: number;
      monto_real: number;
      diferencia: number;
      usuario_apertura: string;
      usuario_cierre?: string;
      negocioNombre: string;
    }
  ): number[] {
    const chars = printer.caracteres_por_linea || 42;
    const buf: number[] = [];
    const push  = (...b: number[]) => buf.push(...b);
    const texto = (str: string)    => buf.push(...this.encodeText(str));
    const linea = (str = '')       => { texto(str); push(LF); };
    const sep   = (c = '-')        => linea(c.repeat(chars));

    const fmt = (v: number) => `RD$ ${new Intl.NumberFormat('es-DO').format(v)}`;
    const fmtFecha = (f: string) => new Date(f).toLocaleString('es-DO', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
    const fila = (label: string, valor: string) => {
      const pad = chars - label.length - valor.length;
      linea(label + ' '.repeat(Math.max(1, pad)) + valor);
    };

    push(...INIT, ...ALIGN_CENTER, ...BOLD_ON, ...FONT_DOUBLE);
    linea('CIERRE DE CAJA');
    push(...FONT_NORMAL, ...BOLD_OFF);
    linea(datos.negocioNombre);
    sep('=');

    push(...ALIGN_LEFT);
    linea(`Caja #${datos.id}`);
    linea(`Cajero : ${datos.usuario_cierre || datos.usuario_apertura}`);
    linea(`Apertura: ${fmtFecha(datos.fecha_apertura)}`);
    linea(`Cierre  : ${fmtFecha(datos.fecha_cierre)}`);
    sep();

    push(...BOLD_ON);
    linea('VENTAS');
    push(...BOLD_OFF);
    fila('Efectivo',  fmt(datos.ventas_efectivo));
    fila('Tarjeta',   fmt(datos.ventas_tarjeta));
    fila('Entradas',  fmt(datos.total_entradas));
    fila('Salidas',   fmt(datos.total_salidas));
    sep();

    push(...BOLD_ON);
    linea('ARQUEO');
    push(...BOLD_OFF);
    fila('Monto inicial', fmt(datos.monto_inicial));
    fila('Esperado',      fmt(datos.monto_esperado));
    fila('Contado',       fmt(datos.monto_real));

    push(...BOLD_ON);
    const dif = datos.diferencia;
    fila('Diferencia', fmt(dif));
    push(...BOLD_OFF);

    sep('=');
    push(...ALIGN_CENTER);
    linea(dif === 0 ? 'CUADRE EXACTO' : dif > 0 ? `SOBRANTE: ${fmt(dif)}` : `FALTANTE: ${fmt(Math.abs(dif))}`);
    push(LF, LF, LF);

    linea('_'.repeat(Math.floor(chars * 0.6)));
    linea('Firma del cajero');
    push(LF, LF);

    if (printer.corte_automatico) push(...CUT_PARTIAL);

    return buf;
  }

  /** Verifica si el agente está corriendo haciendo ping a /health */
  async verificarAgente(): Promise<boolean> {
    const url = this.agentUrl;
    if (!url) return false;
    try {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
      return r.ok;
    } catch { return false; }
  }

  /** Imprime una página de prueba ESC/POS en la impresora indicada */
  async imprimirPrueba(printer: RestaurantPrinter, negocioNombre = 'LogosPOS'): Promise<void> {
    const url = this.agentUrl;
    if (!url) throw new Error('No hay agente de impresión configurado.');

    const bytes = this.generarPaginaPrueba(printer, negocioNombre);
    await this.enviarAlAgente(url, printer.ip, printer.puerto, bytes, 1, printer.tipo_conexion, printer.puerto_usb);
  }

  private generarPaginaPrueba(printer: RestaurantPrinter, negocioNombre: string): number[] {
    const chars = printer.caracteres_por_linea || 42;
    const buf: number[] = [];

    const push  = (...bytes: number[]) => buf.push(...bytes);
    const texto = (str: string)        => buf.push(...this.encodeText(str));
    const linea = (str = '')           => { texto(str); push(LF); };
    const sep   = (c = '-')            => linea(c.repeat(chars));

    push(...INIT, ...ALIGN_CENTER, ...BOLD_ON, ...FONT_DOUBLE);
    linea('PRUEBA DE IMPRESION');
    push(...FONT_NORMAL, ...BOLD_OFF);
    sep('=');

    push(...ALIGN_LEFT);
    linea(`Negocio : ${negocioNombre}`);
    linea(`Printer : ${printer.nombre}`);
    linea(`Tipo    : ${printer.tipo_conexion === 'usb' ? 'USB - ' + (printer.puerto_usb || '?') : 'RED - ' + printer.ip + ':' + printer.puerto}`);
    linea(`Chars   : ${chars} por linea`);
    linea(`Copias  : ${printer.copies}`);
    linea(`Corte   : ${printer.corte_automatico ? 'Si' : 'No'}`);
    sep();

    push(...ALIGN_CENTER);
    linea('123456789012345678901234567890123456789012');
    linea('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn');
    sep('=');
    linea(`${new Date().toLocaleString('es-DO')}`);
    linea('*** IMPRESORA OK ***');
    push(LF, LF);

    if (printer.corte_automatico) push(...CUT_PARTIAL);

    return buf;
  }
}
