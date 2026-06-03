import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import {
  RestaurantTable, RestaurantZone, TableWithOrder, EstadoMesa
} from '../models/restaurant.models';

@Injectable({ providedIn: 'root' })
export class RestaurantTablesService {

  private mesasSubject = new BehaviorSubject<RestaurantTable[]>([]);
  private zonasSubject = new BehaviorSubject<RestaurantZone[]>([]);
  public mesas$ = this.mesasSubject.asObservable();
  public zonas$ = this.zonasSubject.asObservable();

  private realtimeChannel: any = null;

  constructor(private supabaseService: SupabaseService) {}

  private get negocioId(): string {
    return localStorage.getItem('logos_negocio_id') || '';
  }

  // ============================================================
  // ZONAS
  // ============================================================

  async cargarZonas(): Promise<RestaurantZone[]> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_zones')
      .select('*')
      .eq('negocio_id', this.negocioId)
      .eq('activa', true)
      .order('orden', { ascending: true });

    if (error) {
      console.error('[RestaurantTablesService] Error cargando zonas:', error.message);
      throw error;
    }
    this.zonasSubject.next(data || []);
    return data || [];
  }

  async crearZona(zona: Omit<RestaurantZone, 'id' | 'negocio_id' | 'created_at' | 'updated_at'>): Promise<RestaurantZone> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_zones')
      .insert({ ...zona, negocio_id: this.negocioId })
      .select()
      .single();

    if (error) throw error;
    await this.cargarZonas();
    return data;
  }

  async actualizarZona(id: string, cambios: Partial<RestaurantZone>): Promise<RestaurantZone> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_zones')
      .update(cambios)
      .eq('id', id)
      .eq('negocio_id', this.negocioId)
      .select()
      .single();

    if (error) throw error;
    await this.cargarZonas();
    return data;
  }

  async eliminarZona(id: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('restaurant_zones')
      .update({ activa: false })
      .eq('id', id)
      .eq('negocio_id', this.negocioId);

    if (error) throw error;
    await this.cargarZonas();
  }

  // ============================================================
  // MESAS
  // ============================================================

  async cargarMesas(zonaId?: string): Promise<RestaurantTable[]> {
    let query = this.supabaseService.client
      .from('restaurant_tables')
      .select('*, zona:restaurant_zones(id, nombre, orden)')
      .eq('negocio_id', this.negocioId)
      .eq('activa', true)
      .order('numero_mesa', { ascending: true });

    if (zonaId) query = query.eq('zona_id', zonaId);

    const { data, error } = await query;
    if (error) {
      console.error('[RestaurantTablesService] Error cargando mesas:', error.message);
      throw error;
    }
    this.mesasSubject.next(data || []);
    return data || [];
  }

  /** Carga mesas con su orden activa para el mapa visual */
  async cargarMesasConOrden(): Promise<TableWithOrder[]> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_tables')
      .select(`
        *,
        zona:restaurant_zones(id, nombre, orden),
        ordenes_activas:restaurant_orders(
          id, estado, total, hora_apertura, cantidad_comensales,
          items:restaurant_order_items(id)
        )
      `)
      .eq('negocio_id', this.negocioId)
      .eq('activa', true)
      .order('numero_mesa', { ascending: true });

    if (error) {
      console.error('[RestaurantTablesService] Error cargando mesas con orden:', error.message);
      throw error;
    }

    const ahora = Date.now();
    return (data || []).map((mesa: any) => {
      // Filtrar solo órdenes no cerradas/canceladas
      const ordenesActivas = (mesa.ordenes_activas || [])
        .filter((o: any) => !['cerrada', 'cancelada'].includes(o.estado));
      const ordenActiva = ordenesActivas[0] || null;

      return {
        ...mesa,
        zona: mesa.zona,
        orden_activa: ordenActiva,
        items_count: ordenActiva
          ? (ordenActiva.items || []).filter((i: any) => i).length
          : 0,
        tiempo_ocupada_minutos: ordenActiva?.hora_apertura
          ? Math.floor((ahora - new Date(ordenActiva.hora_apertura).getTime()) / 60000)
          : 0
      } as TableWithOrder;
    });
  }

  async crearMesa(mesa: Omit<RestaurantTable, 'id' | 'negocio_id' | 'estado' | 'created_at' | 'updated_at'>): Promise<RestaurantTable> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_tables')
      .insert({ ...mesa, negocio_id: this.negocioId, estado: 'libre' })
      .select()
      .single();

    if (error) throw error;
    await this.cargarMesas();
    return data;
  }

  async actualizarMesa(id: string, cambios: Partial<RestaurantTable>): Promise<RestaurantTable> {
    const { data, error } = await this.supabaseService.client
      .from('restaurant_tables')
      .update(cambios)
      .eq('id', id)
      .eq('negocio_id', this.negocioId)
      .select()
      .single();

    if (error) throw error;
    await this.cargarMesas();
    return data;
  }

  async actualizarEstadoMesa(id: string, estado: EstadoMesa): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('restaurant_tables')
      .update({ estado })
      .eq('id', id)
      .eq('negocio_id', this.negocioId);

    if (error) throw error;
    const mesas = this.mesasSubject.value.map(m =>
      m.id === id ? { ...m, estado } : m
    );
    this.mesasSubject.next(mesas);
  }

  async reservarMesa(id: string, datos: {
    reserva_nombre: string;
    reserva_hora: string;
    reserva_personas?: number | null;
    reserva_notas?: string | null;
  }): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('restaurant_tables')
      .update({ estado: 'reservada', ...datos })
      .eq('id', id)
      .eq('negocio_id', this.negocioId);

    if (error) throw error;
    const mesas = this.mesasSubject.value.map(m =>
      m.id === id ? { ...m, estado: 'reservada' as EstadoMesa, ...datos } : m
    );
    this.mesasSubject.next(mesas);
  }

  async cancelarReserva(id: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('restaurant_tables')
      .update({
        estado: 'libre',
        reserva_nombre: null,
        reserva_hora: null,
        reserva_personas: null,
        reserva_notas: null
      })
      .eq('id', id)
      .eq('negocio_id', this.negocioId);

    if (error) throw error;
    const mesas = this.mesasSubject.value.map(m =>
      m.id === id ? { ...m, estado: 'libre' as EstadoMesa, reserva_nombre: null, reserva_hora: null, reserva_personas: null, reserva_notas: null } : m
    );
    this.mesasSubject.next(mesas);
  }

  async eliminarMesa(id: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('restaurant_tables')
      .update({ activa: false })
      .eq('id', id)
      .eq('negocio_id', this.negocioId);

    if (error) throw error;
    await this.cargarMesas();
  }

  // ============================================================
  // REALTIME
  // ============================================================

  /** Suscribirse a cambios en tiempo real de mesas y órdenes.
   *  Sin filtro server-side para compatibilidad con plan gratuito de Supabase.
   *  El filtrado por negocio_id ocurre en las queries de recarga. */
  suscribirCambios(onCambio?: () => void): void {
    this.desuscribir();

    this.realtimeChannel = this.supabaseService.client
      .channel('rt_restaurant_tables')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'restaurant_tables'
      }, async () => {
        if (onCambio) onCambio();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'restaurant_orders'
      }, async () => {
        if (onCambio) onCambio();
      })
      .subscribe((status: string) => {
        console.log('[RestaurantTablesService] Realtime status:', status);
      });
  }

  desuscribir(): void {
    if (this.realtimeChannel) {
      this.supabaseService.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }
}
