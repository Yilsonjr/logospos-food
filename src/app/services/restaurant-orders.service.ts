import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import {
  RestaurantOrder, RestaurantOrderItem, OrderWithItems,
  CrearOrden, AgregarItemOrden, KitchenTicketItem,
  EstadoOrden, MenuCategory, MenuItem
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
    // Obtener items pendientes
    const { data: items, error: errItems } = await this.supabaseService.client
      .from('restaurant_order_items')
      .select('id, cantidad, notas_especiales, modificadores, comensal_asignado, menu_item:menu_items(nombre)')
      .eq('order_id', orderId)
      .eq('estado', 'pendiente');

    if (errItems) throw errItems;
    if (!items || items.length === 0) throw new Error('No hay items pendientes para enviar a cocina');

    // Obtener datos de la orden y mesa
    const { data: orden } = await this.supabaseService.client
      .from('restaurant_orders')
      .select('table_id, negocio_id, mesa:restaurant_tables(numero_mesa)')
      .eq('id', orderId)
      .single();

    if (!orden) throw new Error('Orden no encontrada');

    const numeroMesa = (orden.mesa as any)?.numero_mesa || 0;

    // Construir snapshot de items para el ticket
    const kitchenItems: KitchenTicketItem[] = items.map((item: any) => ({
      order_item_id: item.id,
      nombre: (item.menu_item as any)?.nombre || 'Sin nombre',
      cantidad: item.cantidad,
      modificadores: item.modificadores || [],
      notas_especiales: item.notas_especiales || null,
      comensal_asignado: item.comensal_asignado || null
    }));

    // Crear ticket de cocina
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

    // Marcar items como en_preparacion
    await this.supabaseService.client
      .from('restaurant_order_items')
      .update({ estado: 'en_preparacion' })
      .eq('order_id', orderId)
      .eq('estado', 'pendiente');

    // Actualizar estado de la orden
    await this.supabaseService.client
      .from('restaurant_orders')
      .update({
        estado: 'en_cocina',
        hora_envio_cocina: new Date().toISOString()
      })
      .eq('id', orderId);

    console.log('[RestaurantOrdersService] Orden enviada a cocina:', orderId);
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
      .subscribe();
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
      .select('*, categoria:menu_categories(id, nombre), modificadores:menu_item_modifiers(*)')
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
    precio: number; tiempo_preparacion_minutos: number; notas_cocina?: string;
  }): Promise<MenuItem> {
    const { data, error } = await this.supabaseService.client
      .from('menu_items')
      .insert({ ...item, negocio_id: this.negocioId, disponible: true, activo: true, requiere_inventario: false })
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
}
