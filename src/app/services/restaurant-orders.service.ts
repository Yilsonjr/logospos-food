import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import {
  RestaurantOrder, RestaurantOrderItem, OrderWithItems,
  CrearOrden, AgregarItemOrden, KitchenTicketItem,
  EstadoOrden, MenuCategory, MenuItem, MenuItemModifier, TipoOrden
} from '../models/restaurant.models';

@Injectable({ providedIn: 'root' })
export class RestaurantOrdersService {

  private ordenActualSubject = new BehaviorSubject<OrderWithItems | null>(null);
  public ordenActual$ = this.ordenActualSubject.asObservable();

  private realtimeChannel: any = null;

  constructor(private supabaseService: SupabaseService) {}

  private get negocioId(): string {
    return localStorage.getItem('logos_negocio_id') || '';
  }

  // ============================================================
  // MENÚ (categorías + items)
  // ============================================================

  async cargarCategorias(): Promise<MenuCategory[]> {
    const { data, error } = await this.supabaseService.client
      .from('menu_categories')
      .select('*')
      .eq('negocio_id', this.negocioId)
      .eq('activa', true)
      .order('orden', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async cargarItemsPorCategoria(categoriaId: string): Promise<MenuItem[]> {
    const { data, error } = await this.supabaseService.client
      .from('menu_items')
      .select('*, modificadores:menu_item_modifiers(*)')
      .eq('negocio_id', this.negocioId)
      .eq('categoria_id', categoriaId)
      .eq('disponible', true)
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async cargarTodoElMenu(): Promise<MenuCategory[]> {
    const { data, error } = await this.supabaseService.client
      .from('menu_categories')
      .select(`
        *,
        items:menu_items(
          *,
          modificadores:menu_item_modifiers(*)
        )
      `)
      .eq('negocio_id', this.negocioId)
      .eq('activa', true)
      .order('orden', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  // ============================================================
  // ÓRDENES
  // ============================================================

  async obtenerOrdenActivaDeMesa(tableId: string): Promise<OrderWithItems | null> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_orders')
      .select(`
        *,
        mesa:restaurant_tables(id, numero_mesa, zona_id, capacidad),
        items:restaurant_order_items(
          *,
          menu_item:menu_items(id, nombre, precio, imagen_url, tiempo_preparacion_minutos)
        )
      `)
      .eq('negocio_id', this.negocioId)
      .eq('table_id', tableId)
      .not('estado', 'in', '("cerrada","cancelada")')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    this.ordenActualSubject.next(data);
    return data;
  }

  async obtenerOrdenPorId(orderId: string): Promise<OrderWithItems | null> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_orders')
      .select(`
        *,
        mesa:restaurant_tables(id, numero_mesa, zona_id, capacidad),
        items:restaurant_order_items(
          *,
          menu_item:menu_items(id, nombre, precio, imagen_url)
        ),
        pagos:restaurant_order_payments(*)
      `)
      .eq('id', orderId)
      .eq('negocio_id', this.negocioId)
      .single();

    if (error) throw error;
    return data;
  }

  async crearOrden(datos: CrearOrden): Promise<RestaurantOrder> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_orders')
      .insert(datos)
      .select()
      .single();

    if (error) throw error;
    console.log('[RestaurantOrdersService] Orden creada:', data.id);
    return data;
  }

  async agregarItem(item: AgregarItemOrden): Promise<RestaurantOrderItem> {
    const costoMods = item.modificadores.reduce(
      (acc, m) => acc + (m.precio_adicional || 0), 0
    );
    const subtotal = (item.precio_unitario + costoMods) * item.cantidad;

    const { data, error } = await this.supabaseService.client
      .from('restaurant_order_items')
      .insert({ ...item, subtotal, modificadores: item.modificadores })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async actualizarCantidadItem(itemId: string, cantidad: number): Promise<void> {
    const { data: item } = await this.supabaseService.client
      .from('restaurant_order_items')
      .select('precio_unitario, modificadores')
      .eq('id', itemId)
      .single();

    if (!item) throw new Error('Item no encontrado');

    const costoMods = (item.modificadores || []).reduce(
      (acc: number, m: any) => acc + (m.precio_adicional || 0), 0
    );
    const subtotal = (item.precio_unitario + costoMods) * cantidad;

    const { error } = await this.supabaseService.client
      .from('restaurant_order_items')
      .update({ cantidad, subtotal })
      .eq('id', itemId);

    if (error) throw error;
  }

  async cancelarItem(itemId: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('restaurant_order_items')
      .update({ estado: 'cancelado' })
      .eq('id', itemId);

    if (error) throw error;
  }

  async actualizarNotasItem(itemId: string, notas: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('restaurant_order_items')
      .update({ notas_especiales: notas })
      .eq('id', itemId);

    if (error) throw error;
  }

  /** Envía la orden a cocina: crea ticket KDS y actualiza estados */
  async enviarACocina(orderId: string): Promise<void> {
    // Obtener items pendientes con flag enviar_a_cocina del plato
    const { data: items, error: errItems } = await this.supabaseService.client
      .from('restaurant_order_items')
      .select('id, cantidad, notas_especiales, modificadores, comensal_asignado, menu_item:menu_items(nombre, enviar_a_cocina)')
      .eq('order_id', orderId)
      .eq('estado', 'pendiente');

    if (errItems) throw errItems;
    if (!items || items.length === 0) throw new Error('No hay items pendientes para enviar a cocina');

    // Separar: items que van al KDS vs los que se entregan directo (bebidas, snacks)
    const itemsCocina   = items.filter((i: any) => (i.menu_item as any)?.enviar_a_cocina !== false);
    const itemsDirectos = items.filter((i: any) => (i.menu_item as any)?.enviar_a_cocina === false);

    // Los items directos pasan a "entregado" sin pasar por cocina
    if (itemsDirectos.length > 0) {
      await this.supabaseService.client
        .from('restaurant_order_items')
        .update({ estado: 'entregado' })
        .in('id', itemsDirectos.map((i: any) => i.id));
    }

    // Si hay items para cocina, crear ticket KDS
    if (itemsCocina.length > 0) {
      const { data: orden } = await this.supabaseService.client
        .from('restaurant_orders')
        .select('table_id, negocio_id, mesa:restaurant_tables(numero_mesa)')
        .eq('id', orderId)
        .single();

      if (!orden) throw new Error('Orden no encontrada');

      const numeroMesa = (orden.mesa as any)?.numero_mesa || 0;

      const kitchenItems: KitchenTicketItem[] = itemsCocina.map((item: any) => ({
        order_item_id: item.id,
        nombre: (item.menu_item as any)?.nombre || 'Sin nombre',
        cantidad: item.cantidad,
        modificadores: item.modificadores || [],
        notas_especiales: item.notas_especiales || null,
        comensal_asignado: item.comensal_asignado || null
      }));

      const { error: errTicket } = await this.supabaseService.client
        .from('kitchen_tickets')
        .insert({
          negocio_id: this.negocioId,
          order_id: orderId,
          table_id: orden.table_id,
          numero_mesa: numeroMesa,
          items: kitchenItems,
          estado: 'nuevo',
          prioridad: 'normal',
          hora_creacion: new Date().toISOString()
        });

      if (errTicket) throw errTicket;

      // Marcar items de cocina como en_preparacion
      await this.supabaseService.client
        .from('restaurant_order_items')
        .update({ estado: 'en_preparacion' })
        .in('id', itemsCocina.map((i: any) => i.id));
    }

    // Actualizar estado de la orden
    await this.supabaseService.client
      .from('restaurant_orders')
      .update({
        estado: 'en_cocina',
        hora_envio_cocina: new Date().toISOString()
      })
      .eq('id', orderId);

    console.log('[RestaurantOrdersService] Orden enviada a cocina:', orderId,
      `| KDS: ${itemsCocina.length} | Directo: ${itemsDirectos.length}`);
  }

  async aplicarDescuento(orderId: string, descuento: number): Promise<void> {
    const { data: orden } = await this.supabaseService.client
      .from('restaurant_orders')
      .select('subtotal, impuesto, propina')
      .eq('id', orderId)
      .single();

    if (!orden) throw new Error('Orden no encontrada');
    const total = orden.subtotal + orden.impuesto - descuento + (orden.propina || 0);

    const { error } = await this.supabaseService.client
      .from('restaurant_orders')
      .update({ descuento, total })
      .eq('id', orderId);

    if (error) throw error;
  }

  async aplicarPropina(orderId: string, propina: number): Promise<void> {
    const { data: orden } = await this.supabaseService.client
      .from('restaurant_orders')
      .select('subtotal, impuesto, descuento')
      .eq('id', orderId)
      .single();

    if (!orden) throw new Error('Orden no encontrada');
    const total = orden.subtotal + orden.impuesto - (orden.descuento || 0) + propina;

    const { error } = await this.supabaseService.client
      .from('restaurant_orders')
      .update({ propina, total })
      .eq('id', orderId);

    if (error) throw error;
  }

  async actualizarEstadoOrden(orderId: string, estado: EstadoOrden): Promise<void> {
    const update: any = { estado };
    if (estado === 'cerrada') update.hora_cierre = new Date().toISOString();

    const { error } = await this.supabaseService.client
      .from('restaurant_orders')
      .update(update)
      .eq('id', orderId)
      .eq('negocio_id', this.negocioId);

    if (error) throw error;
    if (estado === 'cerrada' || estado === 'cancelada') {
      this.ordenActualSubject.next(null);
    }
  }

  async cerrarOrden(orderId: string): Promise<void> {
    await this.actualizarEstadoOrden(orderId, 'cerrada');
    console.log('[RestaurantOrdersService] Orden cerrada:', orderId);
  }

  async cancelarOrden(orderId: string): Promise<void> {
    await this.actualizarEstadoOrden(orderId, 'cancelada');
    console.log('[RestaurantOrdersService] Orden cancelada:', orderId);
  }

  /** Carga órdenes activas de barra / llevar / delivery para la cola de espera */
  async cargarOrdenesPendientes(tipos: TipoOrden[] = ['barra', 'llevar', 'delivery']): Promise<RestaurantOrder[]> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_orders')
      .select(`
        *,
        items:restaurant_order_items(id, cantidad, estado, menu_item:menu_items(nombre))
      `)
      .eq('negocio_id', this.negocioId)
      .in('tipo_orden', tipos)
      .not('estado', 'in', '("cerrada","cancelada")')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async obtenerHistorial(limite = 50): Promise<RestaurantOrder[]> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_orders')
      .select('*, mesa:restaurant_tables(numero_mesa)')
      .eq('negocio_id', this.negocioId)
      .in('estado', ['cerrada', 'cancelada'])
      .order('hora_cierre', { ascending: false })
      .limit(limite);

    if (error) throw error;
    return data || [];
  }

  // ============================================================
  // REALTIME
  // ============================================================

  suscribirOrden(orderId: string, onCambio: () => void): void {
    this.desuscribir();

    this.realtimeChannel = this.supabaseService.client
      .channel(`rt_order_${orderId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'restaurant_order_items',
        filter: `order_id=eq.${orderId}`
      }, onCambio)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'restaurant_orders',
        filter: `id=eq.${orderId}`
      }, onCambio)
      .subscribe((status: string, err?: Error) => {
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] Canal no disponible, sin actualizaciones en tiempo real:', status);
        }
      });
  }

  desuscribir(): void {
    if (this.realtimeChannel) {
      this.supabaseService.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  limpiarOrdenActual(): void {
    this.ordenActualSubject.next(null);
  }

  // ============================================================
  // ADMIN MENÚ — Categorías CRUD
  // ============================================================

  async crearCategoria(data: { nombre: string; descripcion?: string; icono?: string; orden: number }): Promise<MenuCategory> {
    const { data: res, error } = await this.supabaseService.client
      .from('menu_categories')
      .insert({ ...data, negocio_id: this.negocioId, activa: true })
      .select().single();
    if (error) throw error;
    return res;
  }

  async actualizarCategoria(id: string, cambios: Partial<MenuCategory>): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('menu_categories')
      .update(cambios)
      .eq('id', id)
      .eq('negocio_id', this.negocioId);
    if (error) throw error;
  }

  async eliminarCategoria(id: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('menu_categories')
      .update({ activa: false })
      .eq('id', id)
      .eq('negocio_id', this.negocioId);
    if (error) throw error;
  }

  // ============================================================
  // ADMIN MENÚ — Ítems CRUD
  // ============================================================

  async cargarItemsAdmin(categoriaId?: string): Promise<MenuItem[]> {
    let q = this.supabaseService.client
      .from('menu_items')
      .select('*')
      .eq('negocio_id', this.negocioId)
      .eq('activo', true)
      .order('nombre');
    if (categoriaId) q = q.eq('categoria_id', categoriaId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async crearMenuItem(item: {
    categoria_id: string; nombre: string; descripcion?: string;
    precio: number; costo_estimado?: number | null;
    tiempo_preparacion_minutos: number; notas_cocina?: string;
    requiere_inventario?: boolean; enviar_a_cocina?: boolean; disponible?: boolean;
  }): Promise<MenuItem> {
    const { data, error } = await this.supabaseService.client
      .from('menu_items')
      .insert({
        ...item,
        negocio_id: this.negocioId,
        activo: true,
        disponible: item.disponible ?? true,
        requiere_inventario: item.requiere_inventario ?? false,
        enviar_a_cocina: item.enviar_a_cocina ?? true
      })
      .select().single();
    if (error) throw error;
    return data;
  }

  async actualizarMenuItem(id: string, cambios: Partial<MenuItem>): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('menu_items')
      .update(cambios)
      .eq('id', id)
      .eq('negocio_id', this.negocioId);
    if (error) throw error;
  }

  async eliminarMenuItem(id: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('menu_items')
      .update({ activo: false })
      .eq('id', id)
      .eq('negocio_id', this.negocioId);
    if (error) throw error;
  }

  // ── Guarniciones / Modificadores ──────────────────────────

  async cargarModificadores(menuItemId: string): Promise<MenuItemModifier[]> {
    const { data, error } = await this.supabaseService.client
      .from('menu_item_modifiers')
      .select('*')
      .eq('menu_item_id', menuItemId)
      .eq('activo', true)
      .order('orden');
    if (error) throw error;
    return data || [];
  }

  async crearModificador(mod: Omit<MenuItemModifier, 'id' | 'created_at'>): Promise<MenuItemModifier> {
    const { data, error } = await this.supabaseService.client
      .from('menu_item_modifiers')
      .insert(mod)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async eliminarModificador(id: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('menu_item_modifiers')
      .update({ activo: false })
      .eq('id', id);
    if (error) throw error;
  }
}
