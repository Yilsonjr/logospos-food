import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RestaurantOrdersService } from '../../../services/restaurant-orders.service';
import { PrintService } from '../../../services/print.service';
import { NegociosService } from '../../../services/negocios.service';
import {
  TableWithOrder, MenuCategory, MenuItem, MenuItemModifier,
  CartItem, ModificadorSeleccionado, RestaurantOrder,
  AgregarItemOrden, OrderWithItems, TipoOrden, CrearOrden
} from '../../../models/restaurant.models';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-order-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-modal.component.html',
  styleUrl: './order-modal.component.css'
})
export class OrderModalComponent implements OnInit, OnDestroy {

  @Input() mesa: TableWithOrder | null = null;
  @Input() tipoOrden: TipoOrden = 'mesa';
  @Input() clienteNombre = '';
  @Input() clienteTelefono = '';
  @Input() direccionEntrega = '';
  @Input() orderId?: string;
  @Output() cerrar = new EventEmitter<void>();
  @Output() ordenActualizada = new EventEmitter<void>();
  @Output() cobrar = new EventEmitter<string>();

  // Estado
  orden: OrderWithItems | null = null;
  categorias: MenuCategory[] = [];
  categoriaActiva: MenuCategory | null = null;
  itemsCategoria: MenuItem[] = [];
  todosLosItems: MenuItem[] = [];
  carrito: CartItem[] = [];
  busqueda = '';

  // Modal interno: detalle de item
  itemSeleccionado: MenuItem | null = null;
  modificadoresSeleccionados: ModificadorSeleccionado[] = [];
  cantidadItem = 1;
  notasItem = '';
  comensalItem: number | null = null;
  cantidadComensales = 1;

  cargando = false;
  enviandoCocina = false;

  // Vista móvil: 'menu' | 'orden'
  vistaMovil: 'menu' | 'orden' = 'menu';

  constructor(
    private ordersService: RestaurantOrdersService,
    private printService: PrintService,
    private negociosService: NegociosService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.cargando = true;
    try {
      const [categorias, todasLasCategorias] = await Promise.all([
        this.ordersService.cargarCategorias(),
        this.ordersService.cargarTodoElMenu()
      ]);

      // Load existing order by ID (barra/llevar reopen) or by mesa (table orders)
      let orden: OrderWithItems | null = null;
      if (this.orderId) {
        orden = await this.ordersService.obtenerOrdenPorId(this.orderId);
      } else if (this.mesa && this.tipoOrden === 'mesa') {
        orden = await this.ordersService.obtenerOrdenActivaDeMesa(this.mesa.id);
      }

      this.orden = orden;
      this.categorias = categorias;
      this.cantidadComensales = orden?.cantidad_comensales || 1;
      this.todosLosItems = todasLasCategorias
        .flatMap(c => (c as any).items || [])
        .filter((i: MenuItem) => i.disponible && i.activo);
      if (categorias.length) await this.seleccionarCategoria(categorias[0]);

      if (this.orden) {
        this.ordersService.suscribirOrden(this.orden.id, () => this.refrescarOrden());
      }
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy(): void {
    this.ordersService.desuscribir();
  }

  async seleccionarCategoria(cat: MenuCategory): Promise<void> {
    this.busqueda = '';
    this.categoriaActiva = cat;
    this.itemsCategoria = await this.ordersService.cargarItemsPorCategoria(cat.id);
    this.cdr.detectChanges();
  }

  limpiarBusqueda(): void {
    this.busqueda = '';
  }

  get itemsMostrados(): MenuItem[] {
    const q = this.busqueda.trim().toLowerCase();
    if (!q) return this.itemsCategoria;
    return this.todosLosItems.filter(i =>
      i.nombre.toLowerCase().includes(q) ||
      i.descripcion?.toLowerCase().includes(q)
    );
  }

  get buscando(): boolean {
    return this.busqueda.trim().length > 0;
  }

  // Abre panel de detalle/selección de un item del menú
  abrirDetalleItem(item: MenuItem): void {
    this.itemSeleccionado = item;
    this.modificadoresSeleccionados = [];
    this.cantidadItem = 1;
    this.notasItem = '';
    this.comensalItem = null;
  }

  toggleModificador(mod: MenuItemModifier): void {
    const idx = this.modificadoresSeleccionados.findIndex(m => m.nombre === mod.nombre);
    if (idx >= 0) {
      this.modificadoresSeleccionados.splice(idx, 1);
    } else {
      // Si el grupo es de selección única (max_seleccion = 1), reemplaza el anterior del mismo grupo
      if (mod.max_seleccion === 1) {
        const idxGrupo = this.modificadoresSeleccionados.findIndex(m =>
          this.itemSeleccionado?.modificadores?.find(x => x.nombre === m.nombre)?.grupo_nombre === mod.grupo_nombre
        );
        if (idxGrupo >= 0) this.modificadoresSeleccionados.splice(idxGrupo, 1);
      }
      this.modificadoresSeleccionados.push({
        nombre: mod.nombre,
        precio_adicional: mod.precio_adicional
      });
    }
  }

  tieneModificador(nombre: string): boolean {
    return this.modificadoresSeleccionados.some(m => m.nombre === nombre);
  }

  /** Agrupa los modificadores del item seleccionado por grupo_nombre */
  get gruposModificadores(): { grupo: string; obligatorio: boolean; max: number; items: MenuItemModifier[] }[] {
    const mods = this.itemSeleccionado?.modificadores?.filter(m => m.activo) || [];
    const map = new Map<string, MenuItemModifier[]>();
    for (const mod of mods) {
      const g = mod.grupo_nombre || 'Opciones';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(mod);
    }
    return Array.from(map.entries()).map(([grupo, items]) => ({
      grupo,
      obligatorio: items.some(i => i.obligatorio),
      max: items[0]?.max_seleccion ?? 0,
      items
    }));
  }

  get precioConMods(): number {
    const costoMods = this.modificadoresSeleccionados.reduce((acc, m) => acc + m.precio_adicional, 0);
    return (this.itemSeleccionado?.precio || 0) + costoMods;
  }

  seleccionadosEnGrupo(grupo: string): number {
    const nombres = this.itemSeleccionado?.modificadores
      ?.filter(m => (m.grupo_nombre || 'Opciones') === grupo)
      .map(m => m.nombre) || [];
    return this.modificadoresSeleccionados.filter(m => nombres.includes(m.nombre)).length;
  }

  agregarAlCarrito(): void {
    if (!this.itemSeleccionado) return;

    const costoMods = this.modificadoresSeleccionados.reduce(
      (acc, m) => acc + m.precio_adicional, 0
    );

    const cartItem: CartItem = {
      menu_item: this.itemSeleccionado,
      cantidad: this.cantidadItem,
      modificadores_seleccionados: [...this.modificadoresSeleccionados],
      notas_especiales: this.notasItem,
      comensal_asignado: this.comensalItem,
      precio_total: (this.itemSeleccionado.precio + costoMods) * this.cantidadItem
    };

    // Intentar agrupar si mismo item y mismos modificadores
    const existente = this.carrito.find(c =>
      c.menu_item.id === cartItem.menu_item.id &&
      JSON.stringify(c.modificadores_seleccionados) === JSON.stringify(cartItem.modificadores_seleccionados) &&
      c.notas_especiales === cartItem.notas_especiales
    );

    if (existente) {
      existente.cantidad += cartItem.cantidad;
      existente.precio_total = (existente.menu_item.precio + costoMods) * existente.cantidad;
    } else {
      this.carrito.push(cartItem);
    }

    this.itemSeleccionado = null;
  }

  quitarDelCarrito(idx: number): void {
    this.carrito.splice(idx, 1);
  }

  // Confirma y persiste los items del carrito en la orden
  async confirmarItems(): Promise<void> {
    if (!this.carrito.length) return;

    try {
      this.cargando = true;

      // Crear orden si no existe
      if (!this.orden) {
        const usuarioData = JSON.parse(localStorage.getItem('logos_usuario') || '{}');
        const meseroId: number | null = usuarioData.id ?? null;
        const negocioId = localStorage.getItem('logos_negocio_id') || '';

        const datosOrden: CrearOrden = {
          negocio_id: negocioId,
          table_id: this.mesa?.id ?? null,
          mesero_id: meseroId,
          cantidad_comensales: this.cantidadComensales,
          tipo_orden: this.tipoOrden,
        };
        if (this.clienteNombre) datosOrden.cliente_nombre = this.clienteNombre;
        if (this.clienteTelefono) datosOrden.cliente_telefono = this.clienteTelefono;
        if (this.direccionEntrega) datosOrden.direccion_entrega = this.direccionEntrega;
        this.orden = await this.ordersService.crearOrden(datosOrden) as any;
      }

      // Insertar items
      for (const item of this.carrito) {
        const payload: AgregarItemOrden = {
          order_id: this.orden!.id,
          menu_item_id: item.menu_item.id,
          cantidad: item.cantidad,
          precio_unitario: item.menu_item.precio,
          modificadores: item.modificadores_seleccionados,
          notas_especiales: item.notas_especiales || undefined,
          comensal_asignado: item.comensal_asignado || undefined
        };
        await this.ordersService.agregarItem(payload);
      }

      this.carrito = [];
      await this.refrescarOrden();
      this.ordenActualizada.emit();
      Swal.fire({ icon: 'success', title: 'Items agregados', timer: 1200, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  async enviarACocina(): Promise<void> {
    if (!this.orden) return;

    const { isConfirmed } = await Swal.fire({
      title: '¿Enviar a cocina?',
      text: 'Los items pendientes se enviarán a la pantalla de cocina.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Enviar',
      cancelButtonText: 'Cancelar'
    });
    if (!isConfirmed) return;

    try {
      this.enviandoCocina = true;

      // Imprimir ANTES de cambiar estados (get_ruteo_orden filtra por estado='pendiente')
      try {
        const usuarioData = JSON.parse(localStorage.getItem('logos_usuario') || '{}');
        const mesero = usuarioData.nombre || usuarioData.email || 'Mesero';
        const numeroMesa = this.mesa?.numero_mesa || (this.orden as any)?.numero_pedido_dia || 0;
        const resultado = await this.printService.imprimirOrden(this.orden.id, numeroMesa, mesero);
        if (resultado.errores.length > 0) {
          console.warn('[OrderModal] Errores de impresión:', resultado.errores);
        }
      } catch (printError: any) {
        console.warn('[OrderModal] No se pudo imprimir comanda:', printError.message);
      }

      await this.ordersService.enviarACocina(this.orden.id);
      await this.refrescarOrden();
      this.ordenActualizada.emit();
      Swal.fire({ icon: 'success', title: '¡Enviado a cocina!', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.enviandoCocina = false;
      this.cdr.detectChanges();
    }
  }

  async cancelarItem(itemId: string): Promise<void> {
    const { isConfirmed } = await Swal.fire({
      title: '¿Eliminar Item?',
      text: 'Se removerá este item de la orden.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!isConfirmed) return;

    try {
      this.cargando = true;
      await this.ordersService.cancelarItem(itemId);
      await this.refrescarOrden();
      this.ordenActualizada.emit();
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  async actualizarCantidad(itemId: string, nuevaCantidad: number): Promise<void> {
    if (nuevaCantidad < 1) return;
    try {
      this.cargando = true;
      await this.ordersService.actualizarCantidadItem(itemId, nuevaCantidad);
      await this.refrescarOrden();
      this.ordenActualizada.emit();
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  async cancelarOrden(): Promise<void> {
    if (!this.orden) return;

    const { isConfirmed } = await Swal.fire({
      title: '¿Cancelar Orden?',
      text: 'Se cancelará toda la orden y se liberará la mesa. Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar orden',
      cancelButtonText: 'No, mantener',
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6'
    });

    if (!isConfirmed) return;

    try {
      this.cargando = true;
      await this.ordersService.cancelarOrden(this.orden.id);
      this.orden = null;
      this.ordenActualizada.emit();
      Swal.fire({
        icon: 'success',
        title: 'Orden cancelada',
        text: 'La mesa ha sido liberada.',
        timer: 1500,
        showConfirmButton: false
      }).then(() => this.cerrar.emit());
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  private async refrescarOrden(): Promise<void> {
    if (!this.orden) return;
    this.orden = await this.ordersService.obtenerOrdenPorId(this.orden.id);
    this.cdr.detectChanges();
  }

  // Totales del carrito
  get subtotalCarrito(): number {
    return this.carrito.reduce((acc, i) => acc + i.precio_total, 0);
  }

  // Items de la orden persistidos
  get itemsPersistidos(): any[] {
    return this.orden?.items?.filter(i => i.estado !== 'cancelado') || [];
  }

  get hayItemsPendientes(): boolean {
    return (this.orden?.items || []).some(i => i.estado === 'pendiente');
  }

  get subtotalOrden(): number { return this.orden?.subtotal || 0; }
  get impuestoOrden(): number { return this.orden?.impuesto || 0; }
  get totalOrden(): number    { return this.orden?.total || 0; }

  get comensalesRange(): number[] {
    return Array.from({ length: this.cantidadComensales }, (_, i) => i + 1);
  }

  get numeroPedidoDia(): number | null {
    return (this.orden as any)?.numero_pedido_dia ?? null;
  }

  trackByItem(_: number, i: CartItem): string { return i.menu_item.id; }
  trackByCat(_: number, c: MenuCategory): string { return c.id; }
  trackByMenuItem(_: number, m: MenuItem): string { return m.id; }

  formatModificadores(modificadores: any[]): string {
    if (!modificadores || !modificadores.length) return '';
    return modificadores.map(m => m.nombre).join(', ');
  }

  async imprimirPrecuenta(): Promise<void> {
    if (!this.orden || !this.itemsPersistidos.length) return;

    const np = (this.orden as any).numero_pedido_dia;
    let identificador: string;
    if (this.tipoOrden === 'mesa') {
      identificador = `Mesa ${this.orden.mesa?.numero_mesa || '-'}`;
    } else if (this.tipoOrden === 'barra') {
      identificador = np ? `Pedido #${np}` : 'Venta Rápida';
    } else {
      const label = this.tipoOrden === 'delivery' ? 'Delivery' : 'Para Llevar';
      identificador = `${label}${np ? ` #${np}` : ''}${this.clienteNombre ? ` | ${this.clienteNombre}` : ''}`;
    }

    const items = this.itemsPersistidos.map(i => ({
      cantidad: i.cantidad,
      nombre: i.menu_item?.nombre || 'Item',
      subtotal: i.subtotal || 0,
      notas: (i as any).notas_especiales || undefined
    }));

    const negocio = await this.negociosService.cargarNegocio().catch(() => null);
    const negocioNombre = negocio?.nombre || 'RESTAURANTE';

    // Intentar térmica primero
    let imprimioTermica = false;
    try {
      imprimioTermica = await this.printService.imprimirPrecuenta({
        identificador,
        ordenId: this.orden.id,
        items,
        subtotal: this.subtotalOrden,
        impuesto: this.impuestoOrden,
        total: this.totalOrden,
        negocioNombre
      });
    } catch {
      console.warn('[OrderModal] Error en térmica, abriendo navegador');
    }

    if (!imprimioTermica) {
      this.abrirPrecuentaNavegador(identificador, items, negocioNombre);
    }
  }

  private abrirPrecuentaNavegador(
    identificador: string,
    items: Array<{ cantidad: number; nombre: string; subtotal: number; notas?: string }>,
    negocioNombre: string
  ): void {
    if (!this.orden) return;
    const itemsHTML = items
      .map(i => `<tr><td>${i.cantidad}× ${i.nombre}${i.notas ? `<br><small style="color:#666">* ${i.notas}</small>` : ''}</td><td style="text-align:right">RD$ ${i.subtotal.toFixed(2)}</td></tr>`)
      .join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pre-Cuenta</title>
<style>
  @page{size:80mm auto;margin:3mm}
  body{font-family:monospace;width:76mm;margin:0 auto;font-size:12px}
  h2,p{text-align:center;margin:4px 0}
  table{width:100%;border-collapse:collapse}
  td{padding:2px 0}
  .divider{border-top:1px dashed #000;margin:6px 0}
  .total td{font-weight:bold;font-size:14px}
  .nofiscal{font-size:10px;text-align:center;margin-top:8px;color:#666}
</style></head><body>
<h2>${negocioNombre}</h2>
<h2>PRE-CUENTA</h2>
<p>─────────────────────────</p>
<p>${identificador} | #${this.orden.id.slice(-6).toUpperCase()}</p>
<div class="divider"></div>
<table>${itemsHTML}</table>
<div class="divider"></div>
<table>
  <tr><td>Subtotal</td><td style="text-align:right">RD$ ${this.subtotalOrden.toFixed(2)}</td></tr>
  <tr><td>ITBIS</td><td style="text-align:right">RD$ ${this.impuestoOrden.toFixed(2)}</td></tr>
  <tr><td><b>TOTAL ESTIMADO</b></td><td style="text-align:right"><b>RD$ ${this.totalOrden.toFixed(2)}</b></td></tr>
</table>
<p class="nofiscal">─── DOCUMENTO NO FISCAL ───</p>
<p class="nofiscal">${new Date().toLocaleString('es-DO')}</p>
</body></html>`;

    const w = window.open('', '_blank', 'width=420,height=600');
    if (w) {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      w.location.href = url;
      setTimeout(() => { w.print(); URL.revokeObjectURL(url); }, 600);
    }
  }
}
