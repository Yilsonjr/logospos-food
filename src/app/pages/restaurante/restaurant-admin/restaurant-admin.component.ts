import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { RestaurantTablesService } from '../../../services/restaurant-tables.service';
import { RestaurantOrdersService } from '../../../services/restaurant-orders.service';
import { InventoryRestaurantService } from '../../../services/inventory-restaurant.service';
import { NegociosService } from '../../../services/negocios.service';
import {
  RestaurantZone, RestaurantTable, MenuCategory, MenuItem,
  RestaurantInventoryItem, RestaurantInventoryMovement, TipoMovimientoInventario,
  MenuItemRecipe
} from '../../../models/restaurant.models';
import Swal from 'sweetalert2';

type Tab = 'zonas' | 'mesas' | 'categorias' | 'platos' | 'inventario' | 'ordenes';

@Component({
  selector: 'app-restaurant-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './restaurant-admin.component.html',
  styleUrl: './restaurant-admin.component.css'
})
export class RestaurantAdminComponent implements OnInit {

  tabActiva: Tab = 'zonas';
  cargando = false;

  // ── Zonas ─────────────────────────────────────────────────
  zonas: RestaurantZone[] = [];
  zonaForm: Partial<RestaurantZone> = {};
  editandoZona: RestaurantZone | null = null;
  mostrarFormZona = false;

  // ── Mesas ─────────────────────────────────────────────────
  mesas: RestaurantTable[] = [];
  mesaForm: Partial<RestaurantTable> & { zona_id: string; numero_mesa: number; capacidad: number } =
    { zona_id: '', numero_mesa: 1, capacidad: 4 };
  editandoMesa: RestaurantTable | null = null;
  mostrarFormMesa = false;

  // ── Categorías ────────────────────────────────────────────
  categorias: MenuCategory[] = [];
  catForm: { nombre: string; descripcion: string; icono: string; orden: number } =
    { nombre: '', descripcion: '', icono: '🍽️', orden: 1 };
  editandoCat: MenuCategory | null = null;
  mostrarFormCat = false;

  // ── Platos ────────────────────────────────────────────────
  platos: MenuItem[] = [];
  platoForm: {
    categoria_id: string; nombre: string; descripcion: string;
    precio: number; tiempo_preparacion_minutos: number; notas_cocina: string;
    requiere_inventario: boolean; disponible: boolean;
  } = { categoria_id: '', nombre: '', descripcion: '', precio: 0, tiempo_preparacion_minutos: 15, notas_cocina: '', requiere_inventario: false, disponible: true };
  editandoPlato: MenuItem | null = null;
  mostrarFormPlato = false;
  categoriaFiltroPlatos = '';

  // Receta del plato seleccionado
  receta: Array<{ inventory_item_id: string; cantidad_requerida: number; unidad_medida: string; _nombre?: string }> = [];
  recetaItemForm: { inventory_item_id: string; cantidad_requerida: number; unidad_medida: string } =
    { inventory_item_id: '', cantidad_requerida: 1, unidad_medida: 'unidad' };
  guardandoReceta = false;

  // ── Inventario ────────────────────────────────────────────
  inventarioItems: RestaurantInventoryItem[] = [];
  movimientos: RestaurantInventoryMovement[] = [];
  invForm: Partial<RestaurantInventoryItem> = {};
  editandoInv: RestaurantInventoryItem | null = null;
  mostrarFormInv = false;
  mostrarFormEntrada = false;
  entradaForm: { inventory_item_id: string; cantidad: number; razon: string } =
    { inventory_item_id: '', cantidad: 0, razon: '' };
  invSubTab: 'items' | 'movimientos' = 'items';

  // ── Órdenes / Historial ──────────────────────────────────
  historialOrdenes: any[] = [];
  ordenSeleccionada: any = null;
  busquedaOrden = '';
  filtroEstadoOrden = '';

  readonly unidades = ['unidad', 'kg', 'g', 'litro', 'ml', 'botella', 'caja', 'docena', 'porción'];

  get usaInventario(): boolean {
    return this.negociosService.tieneModulo('inventario');
  }

  get hayStockBajo(): boolean {
    return this.inventarioItems.some(i => i.stock_bajo);
  }

  constructor(
    private tablesService: RestaurantTablesService,
    private ordersService: RestaurantOrdersService,
    private inventoryService: InventoryRestaurantService,
    private negociosService: NegociosService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.cargarTab('zonas');
  }

  async cargarTab(tab: Tab): Promise<void> {
    this.tabActiva = tab;
    this.cargando = true;
    try {
      if (tab === 'zonas' || tab === 'mesas') {
        this.zonas = await this.tablesService.cargarZonas();
      }
      if (tab === 'mesas') {
        this.mesas = await this.tablesService.cargarMesas();
      }
      if (tab === 'categorias' || tab === 'platos') {
        this.categorias = await this.ordersService.cargarCategorias();
      }
      if (tab === 'platos') {
        this.platos = await this.ordersService.cargarItemsAdmin(this.categoriaFiltroPlatos || undefined);
        if (this.usaInventario) {
          this.inventarioItems = await this.inventoryService.cargarInventario();
        }
      }
      if (tab === 'inventario') {
        this.inventarioItems = await this.inventoryService.cargarInventario();
        if (this.invSubTab === 'movimientos') {
          this.movimientos = await this.inventoryService.obtenerHistorialMovimientos(undefined, 80);
        }
      }
      if (tab === 'ordenes') {
        this.historialOrdenes = await this.ordersService.obtenerHistorial(100);
      }
    } catch (e: any) {
      console.error('[RestaurantAdmin] Error cargando tab', tab, e);
      Swal.fire('Error', e.message || 'Error al cargar datos', 'error');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  // ── ZONAS ─────────────────────────────────────────────────

  abrirFormZona(zona?: RestaurantZone): void {
    this.editandoZona = zona || null;
    this.zonaForm = zona ? { ...zona } : { nombre: '', descripcion: '', orden: this.zonas.length + 1 };
    this.mostrarFormZona = true;
  }

  async guardarZona(): Promise<void> {
    if (!this.zonaForm.nombre?.trim()) return;
    this.cargando = true;
    try {
      if (this.editandoZona) {
        await this.tablesService.actualizarZona(this.editandoZona.id, this.zonaForm);
      } else {
        await this.tablesService.crearZona({
          nombre: this.zonaForm.nombre!,
          descripcion: this.zonaForm.descripcion || null,
          orden: this.zonaForm.orden || 1,
          activa: true
        });
      }
      this.mostrarFormZona = false;
      await this.cargarTab('zonas');
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargando = false;
    }
  }

  async eliminarZona(zona: RestaurantZone): Promise<void> {
    const { isConfirmed } = await Swal.fire({
      title: `¿Eliminar zona "${zona.nombre}"?`,
      text: 'Las mesas de esta zona quedarán sin zona asignada.',
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444'
    });
    if (!isConfirmed) return;
    try {
      await this.tablesService.eliminarZona(zona.id);
      await this.cargarTab('zonas');
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    }
  }

  // ── MESAS ─────────────────────────────────────────────────

  abrirFormMesa(mesa?: RestaurantTable): void {
    this.editandoMesa = mesa || null;
    if (mesa) {
      this.mesaForm = { ...mesa as any };
    } else {
      const nextNum = this.mesas.length ? Math.max(...this.mesas.map(m => m.numero_mesa)) + 1 : 1;
      this.mesaForm = { zona_id: this.zonas[0]?.id || '', numero_mesa: nextNum, capacidad: 4, nombre_mesa: '' };
    }
    this.mostrarFormMesa = true;
  }

  async guardarMesa(): Promise<void> {
    if (!this.mesaForm.zona_id || !this.mesaForm.numero_mesa) return;
    this.cargando = true;
    try {
      if (this.editandoMesa) {
        await this.tablesService.actualizarMesa(this.editandoMesa.id, this.mesaForm as any);
      } else {
        await this.tablesService.crearMesa({
          zona_id: this.mesaForm.zona_id,
          numero_mesa: this.mesaForm.numero_mesa,
          nombre_mesa: this.mesaForm.nombre_mesa || null,
          capacidad: this.mesaForm.capacidad || 4,
          ubicacion_x: 0, ubicacion_y: 0, activa: true, notas: null
        });
      }
      this.mostrarFormMesa = false;
      await this.cargarTab('mesas');
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargando = false;
    }
  }

  async eliminarMesa(mesa: RestaurantTable): Promise<void> {
    const { isConfirmed } = await Swal.fire({
      title: `¿Eliminar Mesa ${mesa.numero_mesa}?`, icon: 'warning',
      showCancelButton: true, confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar', confirmButtonColor: '#ef4444'
    });
    if (!isConfirmed) return;
    try {
      await this.tablesService.eliminarMesa(mesa.id);
      await this.cargarTab('mesas');
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    }
  }

  // ── CATEGORÍAS ────────────────────────────────────────────

  abrirFormCat(cat?: MenuCategory): void {
    this.editandoCat = cat || null;
    this.catForm = cat
      ? { nombre: cat.nombre, descripcion: cat.descripcion || '', icono: cat.icono || '🍽️', orden: cat.orden }
      : { nombre: '', descripcion: '', icono: '🍽️', orden: this.categorias.length + 1 };
    this.mostrarFormCat = true;
  }

  async guardarCat(): Promise<void> {
    if (!this.catForm.nombre.trim()) return;
    this.cargando = true;
    try {
      if (this.editandoCat) {
        await this.ordersService.actualizarCategoria(this.editandoCat.id, this.catForm);
      } else {
        await this.ordersService.crearCategoria(this.catForm);
      }
      this.mostrarFormCat = false;
      await this.cargarTab('categorias');
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargando = false;
    }
  }

  async eliminarCat(cat: MenuCategory): Promise<void> {
    const { isConfirmed } = await Swal.fire({
      title: `¿Eliminar categoría "${cat.nombre}"?`,
      text: 'Los platos de esta categoría quedarán sin categoría.', icon: 'warning',
      showCancelButton: true, confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar', confirmButtonColor: '#ef4444'
    });
    if (!isConfirmed) return;
    try {
      await this.ordersService.eliminarCategoria(cat.id);
      await this.cargarTab('categorias');
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    }
  }

  // ── PLATOS ────────────────────────────────────────────────

  abrirFormPlato(plato?: MenuItem): void {
    this.editandoPlato = plato || null;
    this.receta = [];
    this.recetaItemForm = { inventory_item_id: '', cantidad_requerida: 1, unidad_medida: 'unidad' };
    this.platoForm = plato
      ? { categoria_id: plato.categoria_id, nombre: plato.nombre, descripcion: plato.descripcion || '',
          precio: plato.precio, tiempo_preparacion_minutos: plato.tiempo_preparacion_minutos,
          notas_cocina: plato.notas_cocina || '',
          requiere_inventario: plato.requiere_inventario ?? false,
          disponible: plato.disponible ?? true }
      : { categoria_id: this.categorias[0]?.id || '', nombre: '', descripcion: '',
          precio: 0, tiempo_preparacion_minutos: 15, notas_cocina: '',
          requiere_inventario: false, disponible: true };
    this.mostrarFormPlato = true;
    if (plato?.requiere_inventario && this.usaInventario) {
      this.cargarReceta(plato.id);
    }
  }

  async guardarPlato(): Promise<void> {
    if (!this.platoForm.nombre.trim() || !this.platoForm.categoria_id) return;
    this.cargando = true;
    try {
      if (this.editandoPlato) {
        await this.ordersService.actualizarMenuItem(this.editandoPlato.id, this.platoForm);
      } else {
        await this.ordersService.crearMenuItem(this.platoForm);
      }
      this.mostrarFormPlato = false;
      await this.cargarTab('platos');
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargando = false;
    }
  }

  async eliminarPlato(plato: MenuItem): Promise<void> {
    const { isConfirmed } = await Swal.fire({
      title: `¿Eliminar "${plato.nombre}"?`, icon: 'warning',
      showCancelButton: true, confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar', confirmButtonColor: '#ef4444'
    });
    if (!isConfirmed) return;
    try {
      await this.ordersService.eliminarMenuItem(plato.id);
      await this.cargarTab('platos');
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    }
  }

  async filtrarPlatos(): Promise<void> {
    this.platos = await this.ordersService.cargarItemsAdmin(this.categoriaFiltroPlatos || undefined);
    this.cdr.detectChanges();
  }

  async cargarReceta(menuItemId: string): Promise<void> {
    try {
      const data = await this.inventoryService.obtenerRecetaDeItem(menuItemId);
      this.receta = data.map(r => ({
        inventory_item_id: r.inventory_item_id,
        cantidad_requerida: r.cantidad_requerida,
        unidad_medida: r.unidad_medida,
        _nombre: (r as any).item_inventario?.nombre || ''
      }));
      this.cdr.detectChanges();
    } catch (e: any) {
      console.error('[RestaurantAdmin] Error cargando receta:', e);
    }
  }

  onToggleRequiereInventario(): void {
    if (this.platoForm.requiere_inventario && this.editandoPlato && this.usaInventario) {
      this.cargarReceta(this.editandoPlato.id);
    } else {
      this.receta = [];
    }
  }

  agregarIngredienteReceta(): void {
    if (!this.recetaItemForm.inventory_item_id || this.recetaItemForm.cantidad_requerida <= 0) return;
    const inv = this.inventarioItems.find(i => i.id === this.recetaItemForm.inventory_item_id);
    this.receta.push({
      inventory_item_id: this.recetaItemForm.inventory_item_id,
      cantidad_requerida: this.recetaItemForm.cantidad_requerida,
      unidad_medida: inv?.unidad_medida || this.recetaItemForm.unidad_medida,
      _nombre: inv?.nombre || ''
    });
    this.recetaItemForm = { inventory_item_id: '', cantidad_requerida: 1, unidad_medida: 'unidad' };
  }

  quitarIngredienteReceta(index: number): void {
    this.receta.splice(index, 1);
  }

  async guardarRecetaPlato(): Promise<void> {
    if (!this.editandoPlato) return;
    this.guardandoReceta = true;
    try {
      await this.inventoryService.guardarReceta(
        this.editandoPlato.id,
        this.receta.map(r => ({
          menu_item_id: this.editandoPlato!.id,
          inventory_item_id: r.inventory_item_id,
          cantidad_requerida: r.cantidad_requerida,
          unidad_medida: r.unidad_medida
        }))
      );
      Swal.fire({ icon: 'success', title: 'Receta guardada', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.guardandoReceta = false;
      this.cdr.detectChanges();
    }
  }

  // ── INVENTARIO ────────────────────────────────────────────

  abrirFormInv(item?: RestaurantInventoryItem): void {
    this.editandoInv = item || null;
    this.invForm = item
      ? { ...item }
      : { nombre: '', unidad_medida: 'unidad', cantidad_actual: 0, cantidad_minima: 0, costo_unitario: 0, activo: true };
    this.mostrarFormInv = true;
  }

  async guardarInv(): Promise<void> {
    if (!this.invForm.nombre?.trim()) return;
    this.cargando = true;
    try {
      if (this.editandoInv) {
        await this.inventoryService.actualizarItem(this.editandoInv.id, this.invForm);
      } else {
        await this.inventoryService.crearItem(this.invForm as any);
      }
      this.mostrarFormInv = false;
      this.inventarioItems = await this.inventoryService.cargarInventario();
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  async eliminarInv(item: RestaurantInventoryItem): Promise<void> {
    const { isConfirmed } = await Swal.fire({
      title: `¿Eliminar "${item.nombre}"?`,
      text: 'Se desactivará el insumo. El historial se conserva.',
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444'
    });
    if (!isConfirmed) return;
    try {
      await this.inventoryService.eliminarItem(item.id);
      this.inventarioItems = await this.inventoryService.cargarInventario();
      this.cdr.detectChanges();
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    }
  }

  abrirFormEntrada(item?: RestaurantInventoryItem): void {
    this.entradaForm = {
      inventory_item_id: item?.id || '',
      cantidad: 0,
      razon: 'Compra / recepción de mercancía'
    };
    this.mostrarFormEntrada = true;
  }

  async guardarEntrada(): Promise<void> {
    if (!this.entradaForm.inventory_item_id || this.entradaForm.cantidad <= 0) {
      Swal.fire('Atención', 'Selecciona un insumo y una cantidad mayor a 0.', 'warning');
      return;
    }
    this.cargando = true;
    try {
      await this.inventoryService.registrarMovimiento(
        this.entradaForm.inventory_item_id,
        'entrada',
        this.entradaForm.cantidad,
        this.entradaForm.razon || 'Entrada manual'
      );
      this.mostrarFormEntrada = false;
      this.inventarioItems = await this.inventoryService.cargarInventario();
      Swal.fire({ icon: 'success', title: 'Entrada registrada', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  async cambiarInvSubTab(sub: 'items' | 'movimientos'): Promise<void> {
    this.invSubTab = sub;
    if (sub === 'movimientos' && !this.movimientos.length) {
      this.movimientos = await this.inventoryService.obtenerHistorialMovimientos(undefined, 80);
      this.cdr.detectChanges();
    }
  }

  nombreInsumo(id: string): string {
    return this.inventarioItems.find(i => i.id === id)?.nombre || id;
  }

  tipoMovLabel(tipo: TipoMovimientoInventario): string {
    const map: Record<TipoMovimientoInventario, string> = {
      entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste',
      merma: 'Merma', produccion: 'Producción'
    };
    return map[tipo] ?? tipo;
  }

  tipoMovClass(tipo: TipoMovimientoInventario): string {
    if (tipo === 'entrada') return 'text-success';
    if (tipo === 'produccion' || tipo === 'salida') return 'text-danger';
    if (tipo === 'merma') return 'text-warning';
    return 'text-muted';
  }

  // ── HELPERS ───────────────────────────────────────────────

  nombreZona(zonaId: string): string {
    return this.zonas.find(z => z.id === zonaId)?.nombre || '—';
  }

  nombreCategoria(catId: string): string {
    return this.categorias.find(c => c.id === catId)?.nombre || '—';
  }

  mesasPorZona(zonaId: string): RestaurantTable[] {
    return this.mesas.filter(m => m.zona_id === zonaId);
  }

  async verDetalleOrden(orderId: string): Promise<void> {
    this.cargando = true;
    try {
      this.ordenSeleccionada = await this.ordersService.obtenerOrdenPorId(orderId);
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  get ordenesFiltradas(): any[] {
    const q = this.busquedaOrden.trim().toLowerCase();
    const st = this.filtroEstadoOrden;

    return this.historialOrdenes.filter(o => {
      // Filtro por estado
      if (st && o.estado !== st) return false;

      // Filtro por búsqueda
      if (q) {
        const idMatches = o.id.toLowerCase().includes(q);
        const mesaMatches = `mesa ${o.mesa?.numero_mesa || ''}`.toLowerCase().includes(q) ||
                            String(o.mesa?.numero_mesa || '').includes(q);
        return idMatches || mesaMatches;
      }

      return true;
    });
  }

  formatearFecha(fecha: string): string {
    if (!fecha) return '—';
    const date = new Date(fecha);
    return new Intl.DateTimeFormat('es-DO', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  formatearMoneda(valor: number): string {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(valor || 0);
  }

  trackById(_: number, item: any): string { return item.id; }
}
