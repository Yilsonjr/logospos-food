import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { RestaurantTablesService } from '../../../services/restaurant-tables.service';
import { RestaurantOrdersService } from '../../../services/restaurant-orders.service';
import { InventoryRestaurantService, CompraAgrupada } from '../../../services/inventory-restaurant.service';
import { NegociosService } from '../../../services/negocios.service';
import { PrintersAdminComponent } from '../printers-admin/printers-admin.component';
import { PrintService } from '../../../services/print.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseService } from '../../../services/supabase.service';
import { CuentasCobrarService } from '../../../services/cuentas-cobrar.service';
import { environment } from '../../../environment/environment';
import {
  RestaurantZone, RestaurantTable, MenuCategory, MenuItem,
  RestaurantInventoryItem, RestaurantInventoryMovement, TipoMovimientoInventario,
  RestaurantPrinter, MenuItemModifier
} from '../../../models/restaurant.models';
import Swal from 'sweetalert2';

type Tab = 'zonas' | 'mesas' | 'categorias' | 'platos' | 'inventario' | 'compras' | 'ordenes' | 'creditos' | 'impresoras';

@Component({
  selector: 'app-restaurant-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PrintersAdminComponent],
  templateUrl: './restaurant-admin.component.html',
  styleUrl: './restaurant-admin.component.css'
})
export class RestaurantAdminComponent implements OnInit, OnDestroy {

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.mostrarFormPlato) this.mostrarFormPlato = false;
  }

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
  impresoras: RestaurantPrinter[] = [];
  catForm: { nombre: string; descripcion: string; icono: string; orden: number; printer_id: string | null } =
    { nombre: '', descripcion: '', icono: '🍽️', orden: 1, printer_id: null };
  editandoCat: MenuCategory | null = null;
  mostrarFormCat = false;

  // ── Platos ────────────────────────────────────────────────
  platos: MenuItem[] = [];
  platoForm: {
    categoria_id: string; nombre: string; descripcion: string;
    precio: number; costo_estimado: number | null; tiempo_preparacion_minutos: number;
    notas_cocina: string; requiere_inventario: boolean; enviar_a_cocina: boolean;
    disponible: boolean; imagen_url: string | null;
  } = { categoria_id: '', nombre: '', descripcion: '', precio: 0, costo_estimado: null,
        tiempo_preparacion_minutos: 15, notas_cocina: '', requiere_inventario: false,
        enviar_a_cocina: true, disponible: true, imagen_url: null };
  editandoPlato: MenuItem | null = null;
  mostrarFormPlato = false;
  categoriaFiltroPlatos = '';
  busquedaPlatos = '';
  drawerTab: 'info' | 'acompanantes' = 'info';

  // Receta del plato seleccionado
  receta: Array<{ inventory_item_id: string; cantidad_requerida: number; unidad_medida: string; _nombre?: string }> = [];
  recetaItemForm: { inventory_item_id: string; cantidad_requerida: number; unidad_medida: string } =
    { inventory_item_id: '', cantidad_requerida: 1, unidad_medida: 'unidad' };
  guardandoReceta = false;

  // Guarniciones / Modificadores del plato
  modificadores: MenuItemModifier[] = [];
  modGruposUnicos: string[] = [];
  modForm: { grupo_nombre: string; nombre: string; precio_adicional: number; obligatorio: boolean; max_seleccion: number } =
    { grupo_nombre: '', nombre: '', precio_adicional: 0, obligatorio: false, max_seleccion: 1 };
  guardandoMod = false;
  cargandoMods = false;
  subiendoImagen = false;

  // Plantillas de modificadores (nueva funcionalidad, no toca lo anterior)
  modTemplates: { id: string; grupo_nombre: string; opciones: { nombre: string; precio_adicional: number }[] }[] = [];
  aplicandoPlantilla = false;
  guardandoPlantilla = false;

  // ── Inventario ────────────────────────────────────────────
  inventarioItems: RestaurantInventoryItem[] = [];
  private _invBusqueda = '';
  get invBusqueda(): string { return this._invBusqueda; }
  set invBusqueda(v: string) { this._invBusqueda = v; this._invPagina = 0; }

  private _invFiltroStock: 'todos' | 'con_stock' | 'bajo' | 'sin_stock' = 'todos';
  get invFiltroStock(): 'todos' | 'con_stock' | 'bajo' | 'sin_stock' { return this._invFiltroStock; }
  set invFiltroStock(v: 'todos' | 'con_stock' | 'bajo' | 'sin_stock') { this._invFiltroStock = v; this._invPagina = 0; }

  private _invCategoria = '';
  get invCategoria(): string { return this._invCategoria; }
  set invCategoria(v: string) { this._invCategoria = v; this._invPagina = 0; }

  readonly CATEGORIAS_INV = [
    'Bebida', 'Licor', 'Cerveza', 'Vino',
    'Carne', 'Pescado', 'Vegetal', 'Lácteo',
    'Cereal', 'Condimento', 'Embutido', 'Postre',
    'Snack', 'Limpieza', 'Desechable', 'Otro'
  ];

  // Buscador de categoría de insumo
  invCatBusqueda   = '';
  invCatDropdown   = false;

  get invCatsFiltradas(): string[] {
    const q = this.invCatBusqueda.toLowerCase().trim();
    return q
      ? this.CATEGORIAS_INV.filter(c => c.toLowerCase().includes(q))
      : this.CATEGORIAS_INV;
  }

  seleccionarCatInv(cat: string): void {
    this.invForm.categoria = cat;
    this.invCatBusqueda    = cat;
    this.invCatDropdown    = false;
  }

  abrirCatDropdown(): void {
    this.invCatBusqueda = this.invForm.categoria || '';
    this.invCatDropdown = true;
  }

  cerrarCatDropdown(): void {
    // Pequeño delay para que el click en opción se registre antes de cerrar
    setTimeout(() => { this.invCatDropdown = false; }, 180);
  }

  get categoriasFiltroInv(): string[] {
    const set = new Set(this.inventarioItems.map(i => i.categoria).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }

  get inventarioFiltrado(): RestaurantInventoryItem[] {
    const q = this._invBusqueda.trim().toLowerCase();
    return this.inventarioItems.filter(item => {
      const matchNombre = !q || item.nombre.toLowerCase().includes(q)
        || (item.proveedor || '').toLowerCase().includes(q)
        || (item.ubicacion || '').toLowerCase().includes(q);
      const matchStock =
        this._invFiltroStock === 'todos'     ? true :
        this._invFiltroStock === 'con_stock' ? item.cantidad_actual > 0 :
        this._invFiltroStock === 'bajo'      ? item.stock_bajo === true :
        this._invFiltroStock === 'sin_stock' ? item.cantidad_actual <= 0 : true;
      const matchCat = !this._invCategoria || item.categoria === this._invCategoria;
      return matchNombre && matchStock && matchCat;
    });
  }
  movimientos: RestaurantInventoryMovement[] = [];
  invForm: Partial<RestaurantInventoryItem> = {};
  editandoInv: RestaurantInventoryItem | null = null;
  mostrarFormInv = false;
  mostrarFormEntrada = false;
  entradaForm: { inventory_item_id: string; cantidad: number; razon: string } =
    { inventory_item_id: '', cantidad: 0, razon: '' };

  // Buscador entrada
  entradaBusqueda = '';
  entradaItemSeleccionado: RestaurantInventoryItem | null = null;
  entradaSugerencias: RestaurantInventoryItem[] = [];

  filtrarEntrada(texto: string): void {
    this.entradaBusqueda = texto;
    if (!texto.trim()) { this.entradaSugerencias = []; return; }
    const q = texto.toLowerCase();
    this.entradaSugerencias = this.inventarioItems
      .filter(i => i.nombre.toLowerCase().includes(q))
      .slice(0, 10);
  }

  seleccionarItemEntrada(item: RestaurantInventoryItem): void {
    this.entradaForm.inventory_item_id = item.id;
    this.entradaItemSeleccionado       = item;
    this.entradaBusqueda               = item.nombre;
    this.entradaSugerencias            = [];
  }

  limpiarItemEntrada(): void {
    this.entradaForm.inventory_item_id = '';
    this.entradaItemSeleccionado       = null;
    this.entradaBusqueda               = '';
    this.entradaSugerencias            = [];
  }

  // Paginación inventario
  readonly INV_PAGE_SIZE = 24;
  private _invPagina = 0;
  get invPagina(): number { return this._invPagina; }
  set invPagina(v: number) { this._invPagina = v; }

  get inventarioFiltradoPaginado(): RestaurantInventoryItem[] {
    const inicio = this.invPagina * this.INV_PAGE_SIZE;
    return this.inventarioFiltrado.slice(inicio, inicio + this.INV_PAGE_SIZE);
  }

  get invTotalPaginas(): number {
    return Math.ceil(this.inventarioFiltrado.length / this.INV_PAGE_SIZE);
  }

  cambiarPaginaInv(delta: number): void {
    this.invPagina = Math.max(0, Math.min(this.invTotalPaginas - 1, this.invPagina + delta));
  }
  invSubTab: 'items' | 'movimientos' = 'items';

  // Relación inventario ↔ menú: mapa de inventory_item_id → nombres de platos que lo usan
  usosPorInsumo: Record<string, string[]> = {};

  // ── Compras de insumos ────────────────────────────────────
  historialCompras: CompraAgrupada[] = [];
  mostrarModalCompra = false;
  guardandoCompra = false;
  compraDetalleAbierta: string | null = null;
  compraForm: {
    proveedor: string;
    numero_comprobante: string;
    notas: string;
    items: Array<{
      inventory_item_id: string;
      cantidad: number;
      precio_unitario: number;
      _nombre?: string;
      _unidad?: string;
      _busqueda?: string;
      _sugerencias?: RestaurantInventoryItem[];
    }>;
  } = { proveedor: '', numero_comprobante: '', notas: '', items: [] };

  // Wizard "Crear Producto Vendible" (insumo + menu item + receta 1:1)
  mostrarWizardProducto = false;
  wizardInsumoOrigen: RestaurantInventoryItem | null = null;
  wizardForm: { nombre: string; precio: number; categoria_id: string; enviar_a_cocina: boolean } =
    { nombre: '', precio: 0, categoria_id: '', enviar_a_cocina: false };
  guardandoProducto = false;

  /** Categorías de insumos que NO van a cocina (bebidas) */
  private readonly CATS_NO_COCINA = ['bebida','licor','cerveza','vino','otro'];

  // ── Créditos / Cuentas por Cobrar ────────────────────────
  cuentasCredito: any[] = [];
  filtroCreditoEstado = 'pendiente';
  creditoSeleccionado: any = null;
  abonoMonto = 0;
  abonoFormaPago = 'efectivo';
  procesandoAbono = false;

  // ── Órdenes / Historial ──────────────────────────────────
  historialOrdenes: any[] = [];
  ordenSeleccionada: any = null;
  cargandoDetalle = false;
  busquedaOrden = '';
  negocioNombre = '';
  negocioFormatoTicket: '58mm' | '80mm' = '80mm';
  negocioModoImpuesto: 'sin_impuesto' | 'encima' | 'incluido' = 'sin_impuesto';
  negocioTasaItbis = 0;
  filtroEstadoOrden = '';

  readonly unidades = [
    // Conteo
    'unidad', 'docena', 'par', 'paquete', 'caja', 'bandeja', 'rollo',
    // Peso
    'kg', 'g', 'lb', 'oz',
    // Volumen
    'litro', 'ml', 'galón', 'botella', 'lata', 'barril',
    // Cocina
    'porción', 'ración', 'taza', 'cucharada', 'cucharadita',
  ];

  get usaInventario(): boolean {
    return this.negociosService.tieneModulo('restaurante_inventario');
  }

  get hayStockBajo(): boolean {
    return this.inventarioItems.some(i => i.stock_bajo);
  }

  get countStockBajo(): number {
    return this.inventarioItems.filter(i => i.stock_bajo).length;
  }

  get countConStock(): number {
    return this.inventarioItems.filter(i => i.cantidad_actual > 0).length;
  }

  get countSinStock(): number {
    return this.inventarioItems.filter(i => i.cantidad_actual <= 0).length;
  }

  constructor(
    private tablesService: RestaurantTablesService,
    private ordersService: RestaurantOrdersService,
    private inventoryService: InventoryRestaurantService,
    private negociosService: NegociosService,
    private printService: PrintService,
    private authService: AuthService,
    private supabaseService: SupabaseService,
    private cuentasCobrarService: CuentasCobrarService,
    private route: ActivatedRoute,
    public cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    const negocio = await this.negociosService.cargarNegocio().catch(() => null);
    if (negocio) {
      this.negocioNombre = negocio.nombre || '';
      this.negocioFormatoTicket = negocio.formato_ticket ?? '80mm';
      this.negocioModoImpuesto = negocio.modo_impuesto ?? 'sin_impuesto';
      this.negocioTasaItbis = negocio.tasa_itbis ?? 0;
    }
    // Soportar ?tab=ordenes para navegación directa desde la pantalla principal
    const tabParam = this.route.snapshot.queryParamMap.get('tab') as Tab | null;
    const tabInicial = (tabParam && this.puedeVerTab(tabParam)) ? tabParam : this.primeraTabAccesible;
    await this.cargarTab(tabInicial);
  }

  ngOnDestroy(): void { }

  /** Devuelve true si el usuario puede ver el tab dado.
   *  Lógica: super admin siempre puede (tienePermiso lo maneja).
   *  Si el rol tiene ALGÚN sub-permiso restaurante.admin.* → se aplica control granular.
   *  Si NO tiene ningún sub-permiso → se acepta que tiene restaurante.admin completo (backward compat).
   */
  puedeVerTab(tab: Tab): boolean {
    const subPermiso = `restaurante.admin.${tab}`;
    if (this.authService.tienePermiso(subPermiso)) return true;
    // Backward compat: si no tiene ningún sub-permiso definido, acceso completo via restaurante.admin
    const haySubPermisos = (['zonas','mesas','categorias','platos','inventario','compras','ordenes','impresoras'] as Tab[])
      .some(t => this.authService.tienePermiso(`restaurante.admin.${t}`));
    return !haySubPermisos && this.authService.tienePermiso('restaurante.admin');
  }

  get primeraTabAccesible(): Tab {
    const todas: Tab[] = ['zonas','mesas','categorias','platos','inventario','compras','ordenes','creditos','impresoras'];
    return todas.find(t => this.puedeVerTab(t)) ?? 'ordenes';
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
        [this.categorias, this.impresoras] = await Promise.all([
          this.ordersService.cargarCategorias(),
          this.printService.cargarImpresoras()
        ]);
      }
      if (tab === 'platos') {
        this.platos = await this.ordersService.cargarItemsAdmin(this.categoriaFiltroPlatos || undefined);
        if (this.usaInventario) {
          this.inventarioItems = await this.inventoryService.cargarInventario();
        }
      }
      if (tab === 'inventario') {
        [this.inventarioItems, this.usosPorInsumo] = await Promise.all([
          this.inventoryService.cargarInventario(),
          this.inventoryService.cargarUsosDeInsumos()
        ]);
        if (!this.categorias.length) {
          this.categorias = await this.ordersService.cargarCategorias();
        }
        if (this.invSubTab === 'movimientos') {
          this.movimientos = await this.inventoryService.obtenerHistorialMovimientos(undefined, 80);
        }
      }
      if (tab === 'compras') {
        [this.inventarioItems, this.historialCompras] = await Promise.all([
          this.inventoryService.cargarInventario(),
          this.inventoryService.obtenerHistorialCompras(50)
        ]);
      }
      if (tab === 'ordenes') {
        this.historialOrdenes = await this.ordersService.obtenerHistorial(100);
      }
      if (tab === 'creditos') {
        await this.cargarCreditos();
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
      ? { nombre: cat.nombre, descripcion: cat.descripcion || '', icono: cat.icono || '🍽️', orden: cat.orden, printer_id: (cat as any).printer_id || null }
      : { nombre: '', descripcion: '', icono: '🍽️', orden: this.categorias.length + 1, printer_id: null };
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
    this.drawerTab = 'info';
    this.receta = [];
    this.modificadores = [];
    this.modGruposUnicos = [];
    this.modForm = { grupo_nombre: '', nombre: '', precio_adicional: 0, obligatorio: false, max_seleccion: 1 };
    this.recetaItemForm = { inventory_item_id: '', cantidad_requerida: 1, unidad_medida: 'unidad' };
    this.platoForm = plato
      ? { categoria_id: plato.categoria_id, nombre: plato.nombre, descripcion: plato.descripcion || '',
          precio: plato.precio, costo_estimado: plato.costo_estimado ?? null,
          tiempo_preparacion_minutos: plato.tiempo_preparacion_minutos,
          notas_cocina: plato.notas_cocina || '',
          requiere_inventario: plato.requiere_inventario ?? false,
          enviar_a_cocina: plato.enviar_a_cocina ?? true,
          disponible: plato.disponible ?? true,
          imagen_url: plato.imagen_url ?? null }
      : { categoria_id: this.categorias[0]?.id || '', nombre: '', descripcion: '',
          precio: 0, costo_estimado: null, tiempo_preparacion_minutos: 15, notas_cocina: '',
          requiere_inventario: false, enviar_a_cocina: true, disponible: true, imagen_url: null };
    this.mostrarFormPlato = true;
    if (plato) {
      this.cargarModificadores(plato.id);
      if (plato.requiere_inventario && this.usaInventario) {
        this.cargarReceta(plato.id);
      }
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

  get modificadoresPorGrupo(): { grupo: string; items: MenuItemModifier[] }[] {
    const map = new Map<string, MenuItemModifier[]>();
    for (const mod of this.modificadores) {
      if (!map.has(mod.grupo_nombre)) map.set(mod.grupo_nombre, []);
      map.get(mod.grupo_nombre)!.push(mod);
    }
    return Array.from(map.entries()).map(([grupo, items]) => ({ grupo, items }));
  }

  async cargarModificadores(menuItemId: string): Promise<void> {
    this.cargandoMods = true;
    try {
      this.modificadores = await this.ordersService.cargarModificadores(menuItemId);
      this.modGruposUnicos = [...new Set(this.modificadores.map(m => m.grupo_nombre))];
      this.cdr.detectChanges();
    } catch (e) {
      console.error('[RestaurantAdmin] Error cargando modificadores:', e);
    } finally {
      this.cargandoMods = false;
      this.cdr.detectChanges();
    }
  }

  async agregarModificador(): Promise<void> {
    if (!this.editandoPlato || !this.modForm.grupo_nombre.trim() || !this.modForm.nombre.trim()) return;
    this.guardandoMod = true;
    try {
      await this.ordersService.crearModificador({
        menu_item_id: this.editandoPlato.id,
        grupo_nombre: this.modForm.grupo_nombre.trim(),
        nombre: this.modForm.nombre.trim(),
        precio_adicional: this.modForm.precio_adicional || 0,
        obligatorio: this.modForm.obligatorio,
        max_seleccion: this.modForm.max_seleccion || 1,
        orden: this.modificadores.length + 1,
        activo: true
      });
      this.modForm = { ...this.modForm, nombre: '', precio_adicional: 0 };
      await this.cargarModificadores(this.editandoPlato.id);
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.guardandoMod = false;
    }
  }

  async eliminarModificador(modId: string): Promise<void> {
    if (!this.editandoPlato) return;
    try {
      await this.ordersService.eliminarModificador(modId);
      await this.cargarModificadores(this.editandoPlato.id);
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    }
  }

  // ── Plantillas de modificadores ──────────────────────────

  async cargarPlantillas(): Promise<void> {
    try {
      this.modTemplates = await this.ordersService.cargarPlantillas();
      this.cdr.detectChanges();
    } catch (e) { console.warn('[RestaurantAdmin] Plantillas no disponibles:', e); }
  }

  async aplicarPlantilla(template: typeof this.modTemplates[0]): Promise<void> {
    if (!this.editandoPlato || this.aplicandoPlantilla) return;
    this.aplicandoPlantilla = true;
    try {
      for (const op of template.opciones) {
        await this.ordersService.crearModificador({
          menu_item_id: this.editandoPlato.id,
          grupo_nombre: template.grupo_nombre,
          nombre: op.nombre,
          precio_adicional: op.precio_adicional || 0,
          obligatorio: false,
          max_seleccion: 1,
          orden: this.modificadores.length + 1,
          activo: true
        });
      }
      await this.cargarModificadores(this.editandoPlato.id);
      Swal.fire({ icon: 'success', title: `Plantilla "${template.grupo_nombre}" aplicada`, timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.aplicandoPlantilla = false;
    }
  }

  async guardarComoPlantilla(): Promise<void> {
    if (!this.modForm.grupo_nombre.trim()) {
      Swal.fire('Falta el grupo', 'Escribe el nombre del grupo antes de guardar la plantilla', 'warning');
      return;
    }
    const grupoOpciones = this.modificadores
      .filter(m => m.grupo_nombre === this.modForm.grupo_nombre.trim())
      .map(m => ({ nombre: m.nombre, precio_adicional: m.precio_adicional || 0 }));

    if (!grupoOpciones.length) {
      Swal.fire('Sin opciones', 'El grupo no tiene opciones para guardar como plantilla', 'warning');
      return;
    }
    this.guardandoPlantilla = true;
    try {
      await this.ordersService.guardarPlantilla(this.modForm.grupo_nombre.trim(), grupoOpciones);
      await this.cargarPlantillas();
      Swal.fire({ icon: 'success', title: 'Plantilla guardada', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.guardandoPlantilla = false;
    }
  }

  async eliminarPlantilla(id: string, nombre: string): Promise<void> {
    const { isConfirmed } = await Swal.fire({
      title: `¿Eliminar plantilla "${nombre}"?`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444'
    });
    if (!isConfirmed) return;
    try {
      await this.ordersService.eliminarPlantilla(id);
      await this.cargarPlantillas();
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  }

  async subirImagenPlato(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    this.subiendoImagen = true;
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const negocioId = localStorage.getItem('logos_negocio_id') || 'sin-negocio';
      const nombre = `platos/${negocioId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await this.supabaseService.client.storage
        .from('productos-imagenes')
        .upload(nombre, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      this.platoForm.imagen_url =
        `${environment.SUPABASE_URL}/storage/v1/object/public/productos-imagenes/${nombre}`;
    } catch (e: any) {
      Swal.fire('Error al subir imagen', e.message ?? 'Verifica que el bucket "productos-imagenes" exista en Supabase Storage.', 'error');
    } finally {
      this.subiendoImagen = false;
      input.value = '';
    }
  }

  async toggleDisponiblePlato(plato: MenuItem): Promise<void> {
    const nuevoEstado = !plato.disponible;
    plato.disponible = nuevoEstado; // optimista
    try {
      await this.ordersService.actualizarMenuItem(plato.id, { disponible: nuevoEstado });
    } catch (e: any) {
      plato.disponible = !nuevoEstado; // revertir
      Swal.fire('Error', e.message, 'error');
    }
  }

  async duplicarPlato(plato: MenuItem): Promise<void> {
    try {
      await this.ordersService.crearMenuItem({
        categoria_id: plato.categoria_id,
        nombre: `${plato.nombre} (copia)`,
        descripcion: plato.descripcion ?? undefined,
        precio: plato.precio,
        costo_estimado: plato.costo_estimado ?? null,
        tiempo_preparacion_minutos: plato.tiempo_preparacion_minutos,
        notas_cocina: plato.notas_cocina ?? undefined,
        requiere_inventario: false,
        enviar_a_cocina: plato.enviar_a_cocina,
        disponible: false
      });
      await this.cargarTab('platos');
      Swal.fire({ icon: 'success', title: 'Plato duplicado', text: 'Revísalo y ajusta el precio si es necesario.', timer: 2000, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
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

  get platosFiltrados(): MenuItem[] {
    const q = this.busquedaPlatos.trim().toLowerCase();
    if (!q) return this.platos;
    return this.platos.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.descripcion || '').toLowerCase().includes(q)
    );
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
      : { nombre: '', categoria: '', unidad_medida: 'unidad', cantidad_actual: 0,
          cantidad_minima: 0, costo_unitario: 0, activo: true, imagen_url: null };
    this.invCatBusqueda = this.invForm.categoria || '';
    this.invCatDropdown = false;
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

  subiendoImagenInsumo = false;

  async subirImagenInsumo(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.subiendoImagenInsumo = true;
    try {
      const ext    = file.name.split('.').pop();
      const nombre = `insumos/${Date.now()}.${ext}`;
      const { error } = await this.supabaseService.client.storage
        .from('productos-imagenes')
        .upload(nombre, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      this.invForm.imagen_url =
        `${environment.SUPABASE_URL}/storage/v1/object/public/productos-imagenes/${nombre}`;
      this.cdr.detectChanges();
    } catch (e: any) {
      Swal.fire('Error al subir imagen', e.message ?? 'Verifica el bucket "productos-imagenes" en Supabase Storage.', 'error');
    } finally {
      this.subiendoImagenInsumo = false;
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
    this.entradaItemSeleccionado = item || null;
    this.entradaBusqueda         = item?.nombre || '';
    this.entradaSugerencias      = [];
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

  stockPct(item: RestaurantInventoryItem): number {
    const min = item.cantidad_minima || 0;
    const actual = item.cantidad_actual || 0;
    if (min === 0) return actual > 0 ? 100 : 0;
    return Math.min(100, Math.round((actual / (min * 2)) * 100));
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

  // ── WIZARD: Crear Producto Vendible ──────────────────────

  abrirWizardProducto(insumo: RestaurantInventoryItem): void {
    this.wizardInsumoOrigen = insumo;
    const esNoCocina = this.CATS_NO_COCINA.includes((insumo.categoria || '').toLowerCase());
    // Intentar preseleccionar la categoría del menú que más se parezca al insumo
    const catSugerida = this.categorias.find(c =>
      (insumo.categoria || '').toLowerCase().includes(c.nombre.toLowerCase()) ||
      c.nombre.toLowerCase().includes((insumo.categoria || '').toLowerCase())
    ) || this.categorias[0];
    this.wizardForm = {
      nombre: insumo.nombre,
      precio: 0,
      categoria_id: catSugerida?.id || '',
      enviar_a_cocina: !esNoCocina
    };
    this.mostrarWizardProducto = true;
  }

  async guardarProductoVendible(): Promise<void> {
    if (!this.wizardForm.nombre.trim() || !this.wizardForm.categoria_id || this.wizardForm.precio <= 0) {
      Swal.fire('Atención', 'Completa nombre, categoría y precio.', 'warning');
      return;
    }
    if (!this.wizardInsumoOrigen) return;

    this.guardandoProducto = true;
    try {
      const menuItem = await this.ordersService.crearMenuItem({
        categoria_id:                this.wizardForm.categoria_id,
        nombre:                      this.wizardForm.nombre,
        descripcion:                 '',
        precio:                      this.wizardForm.precio,
        costo_estimado:              this.wizardInsumoOrigen.costo_unitario || null,
        tiempo_preparacion_minutos:  0,
        notas_cocina:                '',
        requiere_inventario:         true,
        enviar_a_cocina:             this.wizardForm.enviar_a_cocina,
        disponible:                  true
      });
      // Heredar imagen del insumo si tiene una
      if (this.wizardInsumoOrigen.imagen_url) {
        await this.supabaseService.client
          .from('menu_items')
          .update({ imagen_url: this.wizardInsumoOrigen.imagen_url })
          .eq('id', menuItem.id);
      }

      await this.inventoryService.guardarReceta(menuItem.id, [{
        menu_item_id: menuItem.id,
        inventory_item_id: this.wizardInsumoOrigen.id,
        cantidad_requerida: 1,
        unidad_medida: this.wizardInsumoOrigen.unidad_medida
      }]);

      this.mostrarWizardProducto = false;
      this.usosPorInsumo = await this.inventoryService.cargarUsosDeInsumos();
      this.cdr.detectChanges();
      Swal.fire({ icon: 'success', title: '¡Producto creado!',
        text: `"${menuItem.nombre}" ya está en el menú y descontará inventario al vender.`,
        timer: 2500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.guardandoProducto = false;
    }
  }

  usosLabel(insumoId: string): string {
    const nombres = this.usosPorInsumo[insumoId];
    if (!nombres?.length) return '';
    return nombres.slice(0, 2).join(', ') + (nombres.length > 2 ? ` +${nombres.length - 2}` : '');
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
    this.cargandoDetalle = true;
    this.ordenSeleccionada = null;
    this.cdr.detectChanges();
    try {
      this.ordenSeleccionada = await this.ordersService.obtenerOrdenPorId(orderId);
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.cargandoDetalle = false;
      this.cdr.detectChanges();
    }
  }

  reimprimirTicket(orden: any): void {
    const fmt = this.negocioFormatoTicket;
    const ancho = fmt === '58mm' ? '54mm' : '76mm';
    const anchoPx = fmt === '58mm' ? 200 : 280;
    const fuentePx = fmt === '58mm' ? 10 : 12;

    const items = (orden.items || []).filter((i: any) => i.estado !== 'cancelado');
    const itemsHTML = items.map((i: any) =>
      `<tr><td>${i.cantidad}× ${i.menu_item?.nombre || 'Item'}</td><td class="r">RD$ ${(i.subtotal || 0).toFixed(2)}</td></tr>`
    ).join('');

    const subtotal = orden.subtotal || 0;
    const impuesto = orden.impuesto || orden.impuestos || 0;
    const propina  = orden.propina  || 0;
    const total    = orden.total    || 0;

    const pago = orden.pagos?.[0];
    const formaPago = pago?.forma_pago || pago?.metodo_pago || 'efectivo';
    const ncf = pago?.ncf || null;
    const tipoNcf = pago?.tipo_ncf || '';
    const rncCliente = pago?.rnc_cliente || '';

    const identificador = orden.mesa
      ? `Mesa ${orden.mesa.numero_mesa}`
      : (orden.numero_pedido_dia ? `Pedido #${orden.numero_pedido_dia}` : `Orden #${orden.id.slice(-6).toUpperCase()}`);

    const itbisRow = this.negocioModoImpuesto !== 'sin_impuesto' && impuesto > 0
      ? `<tr><td>ITBIS (${Math.round(this.negocioTasaItbis * 100)}%)</td><td class="r">RD$ ${impuesto.toFixed(2)}</td></tr>`
      : '';
    const propinaRow = propina > 0 ? `<tr><td>Propina</td><td class="r">RD$ ${propina.toFixed(2)}</td></tr>` : '';
    const ncfSection = ncf
      ? `<div class="div"></div><p class="c bold" style="font-size:${fuentePx-1}px">COMPROBANTE FISCAL</p>
         <p class="c" style="font-size:${fuentePx-1}px">Tipo: ${tipoNcf}</p>
         <p class="c bold" style="letter-spacing:1px">${ncf}</p>
         ${rncCliente ? `<p class="c small">RNC: ${rncCliente}</p>` : ''}`
      : '';
    const piePagina = ncf
      ? `<p class="small c">─── DOCUMENTO FISCAL ───</p>`
      : `<p class="small c">─── DOCUMENTO NO FISCAL ───</p>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket</title>
<style>
  @page { size: ${fmt} auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { font-family:'Courier New',monospace; width:${ancho}; margin:0 auto; font-size:${fuentePx}px; line-height:1.4; }
  h2 { text-align:center; margin:4px 0; font-size:${fuentePx+2}px; }
  p { text-align:center; margin:2px 0; }
  table { width:100%; border-collapse:collapse; }
  td { padding:1px 0; vertical-align:top; }
  .r { text-align:right; white-space:nowrap; padding-left:4px; }
  .div { border-top:1px dashed #000; margin:5px 0; }
  .total td { font-weight:bold; font-size:${fuentePx+2}px; border-top:1px solid #000; padding-top:3px; }
  .c { text-align:center; } .bold { font-weight:bold; }
  .small { font-size:${fuentePx-2}px; color:#555; }
</style></head><body>
<h2>${this.negocioNombre || 'RESTAURANTE'}</h2>
<div class="div"></div>
<p>${identificador} &nbsp;|&nbsp; #${orden.id.slice(-6).toUpperCase()}</p>
<p class="small">${this.formatearFecha(orden.hora_cierre || orden.updated_at)}</p>
<div class="div"></div>
<table>${itemsHTML}</table>
<div class="div"></div>
<table>
  <tr><td>Subtotal</td><td class="r">RD$ ${subtotal.toFixed(2)}</td></tr>
  ${itbisRow}${propinaRow}
  <tr class="total"><td>TOTAL (${formaPago})</td><td class="r">RD$ ${total.toFixed(2)}</td></tr>
</table>
${ncfSection}
<div class="div"></div>
${piePagina}
<p class="small">¡Gracias por su visita!</p>
<p class="small">REIMPRESIÓN — ${new Date().toLocaleString('es-DO')}</p>
</body></html>`;

    const w = window.open('', '_blank', `width=${anchoPx + 40},height=600`);
    if (w) {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      w.location.href = url;
      setTimeout(() => { w.print(); URL.revokeObjectURL(url); }, 600);
    }
  }

  // ── CRÉDITOS ─────────────────────────────────────────────

  async cargarCreditos(): Promise<void> {
    const negocioId = localStorage.getItem('logos_negocio_id') || '';
    const { data, error } = await this.supabaseService.client
      .from('cuentas_por_cobrar')
      .select(`*, clientes(nombre), abonos:pagos_cuentas(id, monto, metodo_pago, created_at)`)
      .eq('negocio_id', negocioId)
      .ilike('concepto', 'Restaurante%')
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Resolver nombre: cliente registrado > nombre en concepto > 'Sin nombre'
    this.cuentasCredito = (data || []).map(c => ({
      ...c,
      cliente_nombre: c.clientes?.nombre || this.extraerNombreDeConcepto(c.concepto) || 'Sin nombre'
    }));
    this.cdr.detectChanges();
  }

  private extraerNombreDeConcepto(concepto: string): string {
    // Formato: "Restaurante Mesa X — NombreCliente"
    const sep = concepto?.indexOf('—');
    if (sep !== -1) return concepto.substring(sep + 1).trim();
    return '';
  }

  get creditosFiltrados(): any[] {
    if (!this.filtroCreditoEstado) return this.cuentasCredito;
    if (this.filtroCreditoEstado === 'pendiente')
      return this.cuentasCredito.filter(c => c.estado === 'pendiente' || c.estado === 'parcial');
    return this.cuentasCredito.filter(c => c.estado === this.filtroCreditoEstado);
  }

  get totalCreditoPendiente(): number {
    return this.cuentasCredito
      .filter(c => c.estado !== 'pagada' && c.estado !== 'anulada')
      .reduce((acc, c) => acc + (c.monto_pendiente || 0), 0);
  }

  abrirAbono(credito: any): void {
    this.creditoSeleccionado = credito;
    this.abonoMonto = credito.monto_pendiente;
    this.abonoFormaPago = 'efectivo';
  }

  async registrarAbono(): Promise<void> {
    if (!this.creditoSeleccionado || this.abonoMonto <= 0) return;
    this.procesandoAbono = true;
    try {
      await this.cuentasCobrarService.registrarPago({
        cuenta_id: this.creditoSeleccionado.id,
        monto: this.abonoMonto,
        metodo_pago: this.abonoFormaPago,
        fecha_pago: new Date().toISOString()
      });
      this.creditoSeleccionado = null;
      await this.cargarCreditos();
      Swal.fire({ icon: 'success', title: 'Abono registrado', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.procesandoAbono = false;
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

  // ── COMPRAS ───────────────────────────────────────────────

  abrirModalCompra(): void {
    this.compraForm = { proveedor: '', numero_comprobante: '', notas: '', items: [] };
    this.agregarLineaCompra();
    this.mostrarModalCompra = true;
  }

  cerrarModalCompra(): void {
    this.mostrarModalCompra = false;
  }

  agregarLineaCompra(): void {
    this.compraForm.items.push({
      inventory_item_id: '',
      cantidad: 1,
      precio_unitario: 0,
      _busqueda: '',
      _sugerencias: []
    });
  }

  quitarLineaCompra(i: number): void {
    this.compraForm.items.splice(i, 1);
  }

  onInsumoCompraChange(i: number): void {
    const itemId = this.compraForm.items[i].inventory_item_id;
    const inv = this.inventarioItems.find(x => x.id === itemId);
    if (inv) {
      this.compraForm.items[i]._nombre = inv.nombre;
      this.compraForm.items[i]._unidad = inv.unidad_medida;
      this.compraForm.items[i].precio_unitario = inv.costo_unitario || 0;
    }
  }

  // ── Búsqueda de insumos con autocompletado ─────────────────
  filtrarInsumos(i: number, texto: string): void {
    this.compraForm.items[i]._busqueda = texto;
    if (!texto.trim()) {
      this.compraForm.items[i]._sugerencias = [];
      return;
    }
    const q = texto.toLowerCase();
    this.compraForm.items[i]._sugerencias = this.inventarioItems
      .filter(inv => inv.nombre.toLowerCase().includes(q))
      .slice(0, 10);
  }

  seleccionarInsumoSugerido(i: number, inv: RestaurantInventoryItem): void {
    this.compraForm.items[i].inventory_item_id = inv.id;
    this.compraForm.items[i]._nombre          = inv.nombre;
    this.compraForm.items[i]._unidad          = inv.unidad_medida;
    this.compraForm.items[i]._busqueda        = inv.nombre;
    this.compraForm.items[i]._sugerencias     = [];
    this.compraForm.items[i].precio_unitario  = inv.costo_unitario || 0;
  }

  limpiarSeleccionInsumo(i: number): void {
    this.compraForm.items[i].inventory_item_id = '';
    this.compraForm.items[i]._nombre           = '';
    this.compraForm.items[i]._unidad           = '';
    this.compraForm.items[i]._busqueda         = '';
    this.compraForm.items[i]._sugerencias      = [];
    this.compraForm.items[i].precio_unitario   = 0;
  }

  get totalCompra(): number {
    return this.compraForm.items.reduce((sum, i) => sum + (i.cantidad * i.precio_unitario), 0);
  }

  async guardarCompra(): Promise<void> {
    if (!this.compraForm.proveedor.trim()) {
      Swal.fire('Atención', 'Ingresa el nombre del proveedor.', 'warning');
      return;
    }
    const itemsValidos = this.compraForm.items.filter(i => i.inventory_item_id && i.cantidad > 0);
    if (!itemsValidos.length) {
      Swal.fire('Atención', 'Agrega al menos un insumo con cantidad mayor a 0.', 'warning');
      return;
    }

    this.guardandoCompra = true;
    try {
      await this.inventoryService.registrarCompra({
        proveedor: this.compraForm.proveedor,
        numero_comprobante: this.compraForm.numero_comprobante || undefined,
        notas: this.compraForm.notas || undefined,
        items: itemsValidos.map(i => ({
          inventory_item_id: i.inventory_item_id,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario
        }))
      });

      this.cerrarModalCompra();
      await this.cargarTab('compras');
      Swal.fire({ icon: 'success', title: 'Compra registrada',
        text: `${itemsValidos.length} insumo(s) ingresado(s) al inventario.`,
        timer: 2500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      this.guardandoCompra = false;
      this.cdr.detectChanges();
    }
  }

  toggleDetalleCompra(id: string): void {
    this.compraDetalleAbierta = this.compraDetalleAbierta === id ? null : id;
  }
}
