import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RestaurantOrdersService } from '../../../services/restaurant-orders.service';
import { NegociosService } from '../../../services/negocios.service';
import { InventoryRestaurantService } from '../../../services/inventory-restaurant.service';
import { SupabaseService } from '../../../services/supabase.service';
import { CajaService } from '../../../services/caja.service';
import { AuthService } from '../../../services/auth.service';
import { PrintService } from '../../../services/print.service';
import { FiscalService } from '../../../services/fiscal.service';
import { ConfiguracionFiscal, TIPOS_COMPROBANTE } from '../../../models/fiscal.model';
import {
  OrderWithItems, OrderItemWithMenuItem, CuentaComensal, FormaPago
} from '../../../models/restaurant.models';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-bill-split',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bill-split.component.html',
  styleUrl: './bill-split.component.css'
})
export class BillSplitComponent implements OnInit {

  @Input() orderId!: string;
  @Output() cerrar = new EventEmitter<void>();
  @Output() ordenPagada = new EventEmitter<void>();

  orden: OrderWithItems | null = null;
  cuentas: CuentaComensal[] = [];

  // Modo de división
  modoDivision: 'individual' | 'partes_iguales' | 'por_comensal' = 'individual';
  partesIguales = 2;
  propinaGlobal = 0;
  propinaOpcion: 10 | 15 | 18 | 0 = 0;
  propinaPersonalizada = false;

  cargando = true;
  procesando = false;
  tasaItbis = 0.18;
  modoImpuesto: 'sin_impuesto' | 'encima' | 'incluido' = 'sin_impuesto';
  negocioNombre = '';
  formatoTicket: '58mm' | '80mm' = '80mm';

  // Fiscal
  configFiscal: ConfiguracionFiscal | null = null;
  readonly tiposComprobante = TIPOS_COMPROBANTE.filter(t => t.codigo !== 'B03' && t.codigo !== 'B04');

  readonly formasPago: FormaPago[] = ['efectivo', 'tarjeta', 'transferencia', 'cheque', 'mixto', 'credito'];
  clienteCredito = '';  // Nombre del cliente cuando forma_pago = credito

  constructor(
    private ordersService: RestaurantOrdersService,
    private negociosService: NegociosService,
    private inventoryService: InventoryRestaurantService,
    private supabaseService: SupabaseService,
    private cajaService: CajaService,
    private authService: AuthService,
    private printService: PrintService,
    private fiscalService: FiscalService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.cargando = true;
      const [negocio] = await Promise.all([
        this.negociosService.cargarNegocio(),
        this.fiscalService.cargarConfiguracion()
      ]);
      this.tasaItbis = negocio?.tasa_itbis ?? 0;
      this.modoImpuesto = negocio?.modo_impuesto ?? 'sin_impuesto';
      this.negocioNombre = negocio?.nombre || '';
      this.formatoTicket = negocio?.formato_ticket ?? '80mm';
      this.fiscalService.config$.subscribe(c => this.configFiscal = c);
      this.orden = await this.ordersService.obtenerOrdenPorId(this.orderId);
      if (this.orden) this.inicializarCuentaSimple();
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  // ============================================================
  // MODOS DE DIVISIÓN
  // ============================================================

  inicializarCuentaSimple(): void {
    this.modoDivision = 'individual';
    this.cuentas = [{
      numero: 1,
      items: this.itemsActivos as OrderItemWithMenuItem[],
      subtotal: this.subtotalOrden,
      propina: 0,
      total: this.totalOrden,
      forma_pago: 'efectivo',
      pagado: false
    }];
  }

  dividirEnPartesIguales(): void {
    this.modoDivision = 'partes_iguales';
    const n = Math.max(2, this.partesIguales);
    const subtotalParte = this.subtotalOrden / n;
    const impuestoParte = this.impuestoOrden / n;
    const propinaParte = this.propinaGlobal / n;

    this.cuentas = Array.from({ length: n }, (_, i) => ({
      numero: i + 1,
      items: this.itemsActivos as OrderItemWithMenuItem[],
      subtotal: Math.round(subtotalParte * 100) / 100,
      propina: Math.round(propinaParte * 100) / 100,
      total: Math.round((subtotalParte + impuestoParte + propinaParte) * 100) / 100,
      forma_pago: 'efectivo' as FormaPago,
      pagado: false
    }));

    this.ajustarRedondeo();
  }

  dividirPorComensal(): void {
    this.modoDivision = 'por_comensal';
    const comensales = this.orden?.cantidad_comensales || 1;

    // Items asignados a cada comensal
    const itemsPorComensal: Record<number, OrderItemWithMenuItem[]> = {};
    for (let i = 1; i <= comensales; i++) itemsPorComensal[i] = [];

    for (const item of this.itemsActivos as OrderItemWithMenuItem[]) {
      const num = item.comensal_asignado || 1;
      if (!itemsPorComensal[num]) itemsPorComensal[num] = [];
      itemsPorComensal[num].push(item);
    }

    const propinaParte = this.propinaGlobal / comensales;

    this.cuentas = Array.from({ length: comensales }, (_, i) => {
      const items = itemsPorComensal[i + 1] || [];
      const sumaItems = items.reduce((acc, it) => acc + it.subtotal, 0);
      let subtotal: number;
      let impuesto: number;
      if (this.modoImpuesto === 'incluido' && this.tasaItbis > 0) {
        subtotal = Math.round((sumaItems / (1 + this.tasaItbis)) * 100) / 100;
        impuesto = Math.round((sumaItems - subtotal) * 100) / 100;
      } else if (this.modoImpuesto === 'encima') {
        subtotal = sumaItems;
        impuesto = Math.round(subtotal * this.tasaItbis * 100) / 100;
      } else {
        subtotal = sumaItems;
        impuesto = 0;
      }
      const propina = Math.round(propinaParte * 100) / 100;
      return {
        numero: i + 1,
        items,
        subtotal,
        propina,
        total: subtotal + impuesto + propina,
        forma_pago: 'efectivo' as FormaPago,
        pagado: false
      };
    });
  }

  aplicarPropinaPct(pct: 10 | 15 | 18 | 0): void {
    this.propinaOpcion = pct;
    this.propinaPersonalizada = false;
    this.propinaGlobal = pct > 0
      ? Math.round(this.subtotalOrden * (pct / 100) * 100) / 100
      : 0;
    this.recalcularCuentas();
  }

  activarPropinaPersonalizada(): void {
    this.propinaOpcion = 0;
    this.propinaPersonalizada = true;
    this.propinaGlobal = 0;
  }

  aplicarPropinaManual(): void {
    this.recalcularCuentas();
  }

  private recalcularCuentas(): void {
    if (this.modoDivision === 'partes_iguales') this.dividirEnPartesIguales();
    else if (this.modoDivision === 'por_comensal') this.dividirPorComensal();
    else {
      this.cuentas[0].propina = this.propinaGlobal;
      this.cuentas[0].total = this.totalOrden + this.propinaGlobal;
    }
  }

  // Ajusta diferencias por redondeo en la última cuenta
  private ajustarRedondeo(): void {
    if (this.cuentas.length < 2) return;
    const sumaTotal = this.cuentas.reduce((acc, c) => acc + c.total, 0);
    const diff = Math.round((this.totalOrden + this.propinaGlobal - sumaTotal) * 100) / 100;
    if (diff !== 0) this.cuentas[this.cuentas.length - 1].total += diff;
  }

  // ============================================================
  // PROCESAMIENTO DE PAGOS
  // ============================================================

  async procesarPago(cuenta: CuentaComensal): Promise<void> {
    if (!this.orden) return;

    // Crédito: pedir nombre del cliente antes de procesar
    if (cuenta.forma_pago === 'credito' && !this.clienteCredito.trim()) {
      const { value: nombre } = await Swal.fire({
        title: 'Cobro a Crédito',
        html: `<p class="text-muted small mb-2">Ingresa el nombre del cliente que queda a deber</p>`,
        input: 'text',
        inputPlaceholder: 'Nombre del cliente...',
        inputAttributes: { autocomplete: 'off' },
        showCancelButton: true,
        confirmButtonText: 'Confirmar Crédito',
        confirmButtonColor: '#6f42c1',
        cancelButtonText: 'Cancelar',
        inputValidator: (v) => !v?.trim() ? 'El nombre es requerido' : null
      });
      if (!nombre) return;
      this.clienteCredito = nombre.trim();
    }

    try {
      const negocioId = localStorage.getItem('logos_negocio_id') || '';

      // Generar NCF si el negocio tiene modo fiscal y el cajero lo solicitó
      let ncf: string | null = null;
      if (cuenta.requiere_comprobante && cuenta.tipo_ncf) {
        try {
          ncf = await this.fiscalService.generarNCF(cuenta.tipo_ncf);
        } catch (e: any) {
          await Swal.fire('Error fiscal', `No se pudo generar el NCF: ${e.message}`, 'error');
          return;
        }
      }

      await this.supabaseService.client
        .from('restaurant_order_payments')
        .insert({
          order_id: this.orden.id,
          negocio_id: negocioId,
          monto: cuenta.total,
          forma_pago: cuenta.forma_pago,
          comensal_numero: this.modoDivision === 'individual' ? null : cuenta.numero,
          propina_incluida: cuenta.propina,
          pagado: true,
          ncf: ncf || null,
          tipo_ncf: cuenta.requiere_comprobante ? (cuenta.tipo_ncf || null) : null,
          rnc_cliente: cuenta.requiere_comprobante ? (cuenta.rnc_cliente || null) : null,
          nombre_cliente_fiscal: cuenta.requiere_comprobante ? (cuenta.nombre_cliente_fiscal || null) : null
        });

      // --- REGISTRAR MOVIMIENTO EN CAJA ---
      try {
        const cajaAbierta = await this.cajaService.verificarCajaAbierta();
        if (cajaAbierta && cajaAbierta.id) {
          const usuarioId = this.authService.usuarioActual?.id || 1;
          const mesaNumero = this.orden.mesa?.numero_mesa || '';
          const ordenIdShort = this.orden.id.slice(-6).toUpperCase();

          if (cuenta.forma_pago === 'mixto') {
            // Dividir 50/50 si es mixto en caja
            const mitadMonto = Math.round((cuenta.total / 2) * 100) / 100;
            if (mitadMonto > 0) {
              await this.cajaService.registrarMovimiento({
                caja_id: cajaAbierta.id,
                tipo: 'venta',
                concepto: `Venta Mesa ${mesaNumero} - Orden #${ordenIdShort} (Efectivo)`,
                monto: mitadMonto,
                referencia: this.orden.id,
                usuario_id: usuarioId
              });
              await this.cajaService.registrarMovimiento({
                caja_id: cajaAbierta.id,
                tipo: 'venta',
                concepto: `Venta Mesa ${mesaNumero} - Orden #${ordenIdShort} (Tarjeta)`,
                monto: mitadMonto,
                referencia: this.orden.id,
                usuario_id: usuarioId
              });
            }
          } else if (cuenta.forma_pago === 'credito') {
            // Crédito: NO entra a caja, se registra en cuentas_por_cobrar existente
            const identificador = this.orden!.mesa
              ? `Mesa ${this.orden!.mesa.numero_mesa}`
              : `Pedido #${this.orden!.numero_pedido_dia || this.orden!.id.slice(-6).toUpperCase()}`;
            await this.supabaseService.client
              .from('cuentas_por_cobrar')
              .insert({
                negocio_id: negocioId,
                concepto: `Restaurante ${identificador} — ${this.clienteCredito}`,
                monto_total: cuenta.total,
                monto_pagado: 0,
                monto_pendiente: cuenta.total,
                fecha_venta: new Date().toISOString().split('T')[0],
                estado: 'pendiente'
              });
          } else {
            // Método simple (efectivo, tarjeta, transferencia, cheque)
            let metodoLabel = '(Efectivo)';
            if (cuenta.forma_pago === 'tarjeta') metodoLabel = '(Tarjeta)';
            else if (cuenta.forma_pago === 'transferencia') metodoLabel = '(Transferencia)';
            else if (cuenta.forma_pago === 'cheque') metodoLabel = '(Cheque)';

            await this.cajaService.registrarMovimiento({
              caja_id: cajaAbierta.id,
              tipo: 'venta',
              concepto: `Venta Mesa ${mesaNumero} - Orden #${ordenIdShort} ${metodoLabel}`,
              monto: cuenta.total,
              referencia: this.orden!.id,
              usuario_id: usuarioId
            });
          }
        }
      } catch (cajaErr) {
        console.error('Error registrando movimiento de caja desde restaurante:', cajaErr);
      }

      cuenta.pagado = true;
      this.cdr.detectChanges();

      // Si todas las cuentas están pagadas, descontar inventario y cerrar la orden
      if (this.cuentas.every(c => c.pagado)) {
        try {
          await this.inventoryService.descontarIngredientesPorOrden(this.orden.id);
        } catch (invErr) {
          console.error('[BillSplit] Error descontando inventario:', invErr);
        }
        await this.ordersService.cerrarOrden(this.orden.id);

        // Imprimir recibo — agente térmico si está configurado, siempre abre ventana del navegador
        try {
          await this.printService.imprimirReciboRestaurant({
            orden: this.orden,
            propina: this.propinaGlobal,
            formaPago: cuenta.forma_pago,
            negocioNombre: this.negocioNombre
          });
        } catch {
          console.warn('[BillSplit] Impresora térmica no disponible');
        }
        this.abrirTicketEnNavegador(cuenta.forma_pago, ncf, cuenta.tipo_ncf, cuenta.rnc_cliente);

        Swal.fire({
          icon: 'success',
          title: '¡Orden pagada!',
          text: 'La mesa ha sido liberada.',
          timer: 2000,
          showConfirmButton: false
        }).then(() => this.ordenPagada.emit());
      }
    } catch (e: any) {
      Swal.fire('Error al procesar pago', e.message, 'error');
    }
  }

  async procesarTodosLosPagos(): Promise<void> {
    const { isConfirmed } = await Swal.fire({
      title: '¿Confirmar todos los pagos?',
      html: `Total a cobrar: <strong>RD$ ${this.totalConPropina.toFixed(2)}</strong>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirmar',
      cancelButtonText: 'Cancelar'
    });
    if (!isConfirmed) return;

    this.procesando = true;
    try {
      for (const cuenta of this.cuentas.filter(c => !c.pagado)) {
        await this.procesarPago(cuenta);
      }
    } finally {
      this.procesando = false;
    }
  }

  // ============================================================
  // GETTERS
  // ============================================================

  get itemsActivos(): any[] {
    return (this.orden?.items || []).filter(i => i.estado !== 'cancelado');
  }

  get subtotalOrden(): number { return this.orden?.subtotal || 0; }
  get impuestoOrden(): number { return this.orden?.impuesto || 0; }
  get descuentoOrden(): number { return this.orden?.descuento || 0; }
  get totalOrden(): number { return this.orden?.total || 0; }
  get totalConPropina(): number { return this.totalOrden + this.propinaGlobal; }

  get sumaCuentas(): number {
    return this.cuentas.reduce((acc, c) => acc + c.total, 0);
  }

  get diferencia(): number {
    return Math.round((this.totalConPropina - this.sumaCuentas) * 100) / 100;
  }

  get todasPagadas(): boolean { return this.cuentas.every(c => c.pagado); }

  get comensalesRange(): number[] {
    return Array.from({ length: this.orden?.cantidad_comensales || 1 }, (_, i) => i + 1);
  }

  trackByCuenta(_: number, c: CuentaComensal): number { return c.numero; }
  trackByItem(_: number, i: any): string { return i.id; }

  formatModificadores(modificadores: any[]): string {
    if (!modificadores || !modificadores.length) return '';
    return modificadores.map(m => m.nombre).join(', ');
  }

  private abrirTicketEnNavegador(formaPago: string, ncf?: string | null, tipoNcf?: string, rncCliente?: string): void {
    if (!this.orden) return;

    const ancho = this.formatoTicket === '58mm' ? '54mm' : '76mm';
    const anchoPx = this.formatoTicket === '58mm' ? 200 : 280;
    const fuentePx = this.formatoTicket === '58mm' ? 10 : 12;

    const itemsHTML = (this.orden.items || [])
      .filter(i => i.estado !== 'cancelado')
      .map(i => `<tr><td>${i.cantidad}× ${i.menu_item?.nombre || 'Item'}</td><td class="r">RD$ ${(i.subtotal || 0).toFixed(2)}</td></tr>`)
      .join('');

    const propina = this.propinaGlobal;
    const total = (this.totalOrden + propina).toFixed(2);

    const itbisRow = this.modoImpuesto !== 'sin_impuesto' && this.impuestoOrden > 0
      ? `<tr><td>ITBIS (${Math.round(this.tasaItbis * 100)}%)</td><td class="r">RD$ ${this.impuestoOrden.toFixed(2)}</td></tr>`
      : '';
    const propinaRow = propina > 0
      ? `<tr><td>Propina</td><td class="r">RD$ ${propina.toFixed(2)}</td></tr>`
      : '';
    const ncfSection = ncf ? `
<div class="div"></div>
<p class="c bold" style="font-size:${fuentePx - 1}px">COMPROBANTE FISCAL</p>
<p class="c" style="font-size:${fuentePx - 1}px">Tipo: ${tipoNcf || ''}</p>
<p class="c bold" style="letter-spacing:1px">${ncf}</p>
${rncCliente ? `<p class="c small">RNC: ${rncCliente}</p>` : ''}` : '';

    const piePagina = ncf
      ? `<p class="small c">─── DOCUMENTO FISCAL ───</p>`
      : `<p class="small c">─── DOCUMENTO NO FISCAL ───</p>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket</title>
<style>
  @page { size: ${this.formatoTicket} auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; width: ${ancho}; margin: 0 auto; font-size: ${fuentePx}px; line-height: 1.4; }
  h2 { text-align: center; margin: 4px 0; font-size: ${fuentePx + 2}px; }
  p { text-align: center; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; padding-left: 4px; }
  .div { border-top: 1px dashed #000; margin: 5px 0; }
  .total td { font-weight: bold; font-size: ${fuentePx + 2}px; border-top: 1px solid #000; padding-top: 3px; }
  .c { text-align: center; }
  .bold { font-weight: bold; }
  .small { font-size: ${fuentePx - 2}px; color: #555; }
  @media print { body { width: ${ancho}; } }
</style></head><body>
<h2>${this.negocioNombre || 'RESTAURANTE'}</h2>
<div class="div"></div>
<p>${this.orden.mesa ? `Mesa ${this.orden.mesa.numero_mesa}  |  ` : ''}Orden #${this.orden.id.slice(-6).toUpperCase()}</p>
<div class="div"></div>
<table>${itemsHTML}</table>
<div class="div"></div>
<table>
  <tr><td>Subtotal</td><td class="r">RD$ ${this.subtotalOrden.toFixed(2)}</td></tr>
  ${itbisRow}${propinaRow}
  <tr class="total"><td>TOTAL (${formaPago})</td><td class="r">RD$ ${total}</td></tr>
</table>
${ncfSection}
<div class="div"></div>
${piePagina}
<p class="small">¡Gracias por su visita!</p>
<p class="small">${new Date().toLocaleString('es-DO')}</p>
</body></html>`;

    const w = window.open('', '_blank', `width=${anchoPx + 40},height=600`);
    if (w) {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      w.location.href = url;
      setTimeout(() => { w.print(); URL.revokeObjectURL(url); }, 600);
    }
  }
}
