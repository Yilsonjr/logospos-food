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
import { CuentasCobrarService } from '../../../services/cuentas-cobrar.service';
import { ClientesService } from '../../../services/clientes.service';
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
  negocioRnc = '';
  formatoTicket: '58mm' | '80mm' = '80mm';

  // Fiscal
  configFiscal: ConfiguracionFiscal | null = null;
  readonly tiposComprobante = TIPOS_COMPROBANTE.filter(t => t.codigo !== 'B03' && t.codigo !== 'B04');

  // Estado de lookup RNC por cuenta (key = cuenta.numero)
  rncLookupStatus: Record<number, 'found' | 'notfound' | null> = {};

  readonly formasPago: FormaPago[] = ['efectivo', 'tarjeta', 'transferencia', 'cheque', 'mixto', 'credito'];
  clienteCredito = '';
  clienteCreditoId: number | null = null;  // ID si es cliente registrado

  constructor(
    private ordersService: RestaurantOrdersService,
    private negociosService: NegociosService,
    private inventoryService: InventoryRestaurantService,
    private supabaseService: SupabaseService,
    private cajaService: CajaService,
    private authService: AuthService,
    private printService: PrintService,
    private fiscalService: FiscalService,
    private cuentasCobrarService: CuentasCobrarService,
    private clientesService: ClientesService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.cargando = true;
      const [negocio] = await Promise.all([
        this.negociosService.cargarNegocio(),
        this.fiscalService.cargarConfiguracion(),
        this.clientesService.cargarClientes()
      ]);
      this.tasaItbis = negocio?.tasa_itbis ?? 0;
      this.modoImpuesto = negocio?.modo_impuesto ?? 'sin_impuesto';
      this.negocioNombre = negocio?.nombre || '';
      this.negocioRnc    = negocio?.rnc    || '';
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

    // Verificar caja abierta antes de procesar cualquier pago
    if (cuenta.forma_pago !== 'credito') {
      const caja = await this.cajaService.verificarCajaAbierta().catch(() => null);
      if (!caja) {
        await Swal.fire({
          icon: 'warning',
          title: 'Caja cerrada',
          html: `<p>No hay una caja abierta para registrar este pago.</p>
                 <p class="text-muted small mb-0">Abre la caja antes de procesar cobros en efectivo, tarjeta u otros métodos.</p>`,
          confirmButtonText: 'Ir a Caja',
          confirmButtonColor: '#f59e0b',
          showCancelButton: true,
          cancelButtonText: 'Cancelar',
        }).then(r => {
          if (r.isConfirmed) window.location.href = '/caja';
        });
        return;
      }
    }

    // Crédito: buscar cliente registrado o ingresar nombre libre
    if (cuenta.forma_pago === 'credito' && !this.clienteCredito.trim()) {
      const clientes = this.clientesService.getClientesActivos();
      let clienteSeleccionadoId: number | null = null;

      const renderSugerencias = (filtro: string) => {
        const lista = document.getElementById('swal-lista-clientes')!;
        const term = filtro.toLowerCase().trim();
        const coincidencias = term.length < 1 ? [] :
          clientes.filter(c =>
            c.nombre.toLowerCase().includes(term) ||
            (c.telefono || '').includes(term)
          ).slice(0, 6);

        lista.innerHTML = coincidencias.map(c =>
          `<div class="swal-cliente-item" data-id="${c.id}" data-nombre="${c.nombre}"
            style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:.9rem;text-align:left">
            <strong>${c.nombre}</strong>${c.telefono ? `<span style="color:#6b7280;margin-left:8px;font-size:.8rem">${c.telefono}</span>` : ''}
          </div>`
        ).join('') + (coincidencias.length === 0 && term.length > 0
          ? `<div style="padding:8px 12px;color:#9ca3af;font-size:.85rem;text-align:left">Sin coincidencias — se guardará como nombre libre</div>`
          : '');

        lista.querySelectorAll('.swal-cliente-item').forEach(el => {
          el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const id = +(el as HTMLElement).dataset['id']!;
            const nombre = (el as HTMLElement).dataset['nombre']!;
            clienteSeleccionadoId = id;
            (document.getElementById('swal-buscar-cliente') as HTMLInputElement).value = nombre;
            lista.innerHTML = '';
          });
        });
      };

      const { value: nombre, isConfirmed } = await Swal.fire<string>({
        title: 'Cobro a Crédito',
        html: `
          <p style="color:#6b7280;font-size:.85rem;margin-bottom:12px">
            Escribe el nombre del cliente o búscalo por nombre/teléfono
          </p>
          <div style="position:relative">
            <input id="swal-buscar-cliente" class="swal2-input" autocomplete="off"
              placeholder="Nombre o teléfono del cliente…"
              style="width:100%;margin:0 0 0 0">
            <div id="swal-lista-clientes"
              style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;
                     max-height:200px;overflow-y:auto;margin-top:4px"></div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Confirmar Crédito',
        confirmButtonColor: '#6f42c1',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        didOpen: () => {
          const input = document.getElementById('swal-buscar-cliente') as HTMLInputElement;
          input.focus();
          input.addEventListener('input', () => {
            clienteSeleccionadoId = null; // resetear si escribe de nuevo
            renderSugerencias(input.value);
          });
        },
        preConfirm: () => {
          const input = document.getElementById('swal-buscar-cliente') as HTMLInputElement;
          const val = input.value.trim();
          if (!val) { Swal.showValidationMessage('El nombre del cliente es requerido'); return false; }
          return val;
        }
      });

      if (!isConfirmed || !nombre) return;
      this.clienteCredito   = nombre;
      this.clienteCreditoId = clienteSeleccionadoId;
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
            // Crédito: usa CuentasCobrarService para mantener balance_pendiente del cliente
            const identificador = this.orden!.mesa
              ? `Mesa ${this.orden!.mesa.numero_mesa}`
              : `Pedido #${this.orden!.numero_pedido_dia || this.orden!.id.slice(-6).toUpperCase()}`;
            await this.cuentasCobrarService.crearCuenta({
              cliente_id: this.clienteCreditoId ?? null,
              venta_id: null,
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

      // Imprimir ticket de esta cuenta inmediatamente
      let imprimioTermica = false;
      try {
        imprimioTermica = await this.printService.imprimirReciboRestaurant({
          orden: this.orden,
          propina: cuenta.propina,
          formaPago: cuenta.forma_pago,
          negocioNombre: this.negocioNombre,
          negocioRnc:          this.negocioRnc || undefined,
          ncf:                 ncf || undefined,
          tipoNcf:             cuenta.tipo_ncf || undefined,
          rncCliente:          cuenta.rnc_cliente || undefined,
          nombreClienteFiscal: cuenta.nombre_cliente_fiscal || undefined,
        });
      } catch {
        console.warn('[BillSplit] Térmica no disponible, usando navegador');
      }
      if (!imprimioTermica) {
        this.imprimirTicketCuenta(cuenta, ncf);
      }

      // Si todas las cuentas están pagadas, descontar inventario y cerrar la orden
      if (this.cuentas.every(c => c.pagado)) {
        try {
          await this.inventoryService.descontarIngredientesPorOrden(this.orden.id);
        } catch (invErr) {
          console.error('[BillSplit] Error descontando inventario:', invErr);
        }
        await this.ordersService.cerrarOrden(this.orden.id);

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

  lookupRnc(cuenta: CuentaComensal): void {
    const rnc = cuenta.rnc_cliente?.trim() || '';
    if (!rnc) { this.rncLookupStatus[cuenta.numero] = null; return; }
    const cliente = this.clientesService.buscarPorRnc(rnc);
    if (cliente) {
      if (!cuenta.nombre_cliente_fiscal) {
        cuenta.nombre_cliente_fiscal = cliente.nombre;
      }
      this.rncLookupStatus[cuenta.numero] = 'found';
    } else {
      this.rncLookupStatus[cuenta.numero] = 'notfound';
    }
    this.cdr.markForCheck();
  }

  private imprimirTicketCuenta(cuenta: CuentaComensal, ncf?: string | null): void {
    if (!this.orden) return;

    const ancho   = this.formatoTicket === '58mm' ? '54mm' : '76mm';
    const anchoPx = this.formatoTicket === '58mm' ? 200 : 280;
    const fs      = this.formatoTicket === '58mm' ? 10 : 12;

    const mesa = this.orden.mesa ? `Mesa ${this.orden.mesa.numero_mesa}` : 'Pedido';
    const ordenRef = this.orden.id.slice(-6).toUpperCase();
    const totalCuentas = this.cuentas.length;

    // Título de la cuenta según modo
    let tituloCuenta = '';
    if (this.modoDivision === 'partes_iguales') {
      tituloCuenta = `Parte ${cuenta.numero} de ${totalCuentas}`;
    } else if (this.modoDivision === 'por_comensal') {
      tituloCuenta = `Comensal ${cuenta.numero}`;
    }

    // Ítems a mostrar: los de la cuenta (por_comensal) o todos divididos (partes_iguales / individual)
    let itemsHTML = '';
    if (this.modoDivision === 'por_comensal' && cuenta.items.length > 0) {
      itemsHTML = cuenta.items
        .map(i => `<tr><td>${i.cantidad}× ${i.menu_item?.nombre || 'Item'}</td><td class="r">RD$ ${(i.subtotal || 0).toFixed(2)}</td></tr>`)
        .join('');
    } else if (this.modoDivision === 'partes_iguales') {
      itemsHTML = `<tr><td colspan="2" style="text-align:center;color:#666;font-size:${fs - 1}px">
        ${totalCuentas} personas · División equitativa</td></tr>`;
      itemsHTML += (this.orden.items || [])
        .filter(i => i.estado !== 'cancelado')
        .map(i => {
          const montoParte = (i.subtotal / totalCuentas);
          return `<tr><td style="color:#888">${i.cantidad}× ${i.menu_item?.nombre || 'Item'}</td><td class="r" style="color:#888">RD$ ${montoParte.toFixed(2)}</td></tr>`;
        }).join('');
    } else {
      itemsHTML = (this.orden.items || [])
        .filter(i => i.estado !== 'cancelado')
        .map(i => `<tr><td>${i.cantidad}× ${i.menu_item?.nombre || 'Item'}</td><td class="r">RD$ ${(i.subtotal || 0).toFixed(2)}</td></tr>`)
        .join('');
    }

    const itbisRow = this.modoImpuesto !== 'sin_impuesto' && cuenta.subtotal > 0
      ? (() => {
          const itbis = this.modoImpuesto === 'encima'
            ? cuenta.subtotal * this.tasaItbis
            : cuenta.subtotal - (cuenta.subtotal / (1 + this.tasaItbis));
          return itbis > 0 ? `<tr><td>ITBIS (${Math.round(this.tasaItbis * 100)}%)</td><td class="r">RD$ ${itbis.toFixed(2)}</td></tr>` : '';
        })()
      : '';

    const propinaRow = cuenta.propina > 0
      ? `<tr><td>Propina</td><td class="r">RD$ ${cuenta.propina.toFixed(2)}</td></tr>` : '';

    const ncfSection = ncf ? `
      <div class="div"></div>
      <p class="c bold" style="font-size:${fs - 1}px">COMPROBANTE FISCAL</p>
      <p class="c" style="font-size:${fs - 1}px">Tipo: ${cuenta.tipo_ncf || ''}</p>
      <p class="c bold" style="letter-spacing:1px">${ncf}</p>
      ${cuenta.rnc_cliente ? `<p class="c small">RNC: ${cuenta.rnc_cliente}</p>` : ''}
      ${cuenta.nombre_cliente_fiscal ? `<p class="c small">${cuenta.nombre_cliente_fiscal}</p>` : ''}` : '';

    const piePagina = ncf
      ? `<p class="small c">─── DOCUMENTO FISCAL ───</p>`
      : `<p class="small c">─── DOCUMENTO NO FISCAL ───</p>`;

    const tituloSeccion = tituloCuenta
      ? `<div class="div"></div><p class="c bold">${tituloCuenta}</p>` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket</title>
<style>
  @page { size: ${this.formatoTicket} auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; width: ${ancho}; margin: 0 auto; font-size: ${fs}px; line-height: 1.4; }
  h2 { text-align: center; margin: 4px 0; font-size: ${fs + 2}px; }
  p { text-align: center; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; padding-left: 4px; }
  .div { border-top: 1px dashed #000; margin: 5px 0; }
  .total td { font-weight: bold; font-size: ${fs + 2}px; border-top: 1px solid #000; padding-top: 3px; }
  .c { text-align: center; }
  .bold { font-weight: bold; }
  .small { font-size: ${fs - 2}px; color: #555; }
  @media print { body { width: ${ancho}; } }
</style></head><body>
<h2>${this.negocioNombre || 'RESTAURANTE'}</h2>
${tituloSeccion}
<div class="div"></div>
<p>${mesa}  |  Orden #${ordenRef}</p>
<div class="div"></div>
<table>${itemsHTML}</table>
<div class="div"></div>
<table>
  <tr><td>Subtotal</td><td class="r">RD$ ${cuenta.subtotal.toFixed(2)}</td></tr>
  ${itbisRow}${propinaRow}
  <tr class="total"><td>TOTAL (${cuenta.forma_pago})</td><td class="r">RD$ ${cuenta.total.toFixed(2)}</td></tr>
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
      const url  = URL.createObjectURL(blob);
      w.location.href = url;
      setTimeout(() => { w.print(); URL.revokeObjectURL(url); }, 600);
    }
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
