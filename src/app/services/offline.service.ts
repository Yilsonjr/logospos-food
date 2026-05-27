import { Injectable } from '@angular/core';
import { BehaviorSubject, fromEvent, merge, map } from 'rxjs';
import { db, VentaPendiente, MenuCategoriaLocal, MesaLocal, OrdenOffline } from '../core/db/dexie.db';
import { CrearVenta } from '../models/ventas.model';

@Injectable({ providedIn: 'root' })
export class OfflineService {

  private onlineSubject  = new BehaviorSubject<boolean>(navigator.onLine);
  public  online$        = this.onlineSubject.asObservable();

  private syncRequestSubject = new BehaviorSubject<void>(undefined);
  public  syncRequest$       = this.syncRequestSubject.asObservable();

  private syncingSubject = new BehaviorSubject<boolean>(false);
  public  syncing$       = this.syncingSubject.asObservable();

  constructor() { this.initConnectivityListeners(); }

  private initConnectivityListeners() {
    merge(
      fromEvent(window, 'online').pipe(map(() => true)),
      fromEvent(window, 'offline').pipe(map(() => false))
    ).subscribe(isOnline => {
      this.onlineSubject.next(isOnline);
      if (isOnline) {
        console.log('🌐 Conexión restaurada — iniciando sincronización…');
        this.triggerSync();
      } else {
        console.log('📵 Sin conexión — modo offline activado.');
      }
    });
  }

  triggerSync() { this.syncRequestSubject.next(); }
  setSyncing(v: boolean) { this.syncingSubject.next(v); }
  get isOnline(): boolean { return this.onlineSubject.value; }

  // ============================================================
  // VENTAS (módulo original)
  // ============================================================

  async guardarVentaOffline(venta: CrearVenta): Promise<number> {
    const id = await db.ventasPendientes.add({ data: venta, timestamp: new Date().toISOString() });
    console.log(`💾 Venta guardada offline ID: ${id}`);
    return id;
  }
  async obtenerVentasPendientes(): Promise<VentaPendiente[]> { return db.ventasPendientes.toArray(); }
  async eliminarVentaPendiente(id: number): Promise<void>    { await db.ventasPendientes.delete(id); }

  async actualizarProductosLocales(productos: any[])   { await db.productos.clear();   await db.productos.bulkPut(productos); }
  async obtenerProductosLocales(): Promise<any[]>       { return db.productos.toArray(); }
  async actualizarCategoriasLocales(categorias: any[])  { await db.categorias.clear();  await db.categorias.bulkPut(categorias); }
  async obtenerCategoriasLocales(): Promise<any[]>      { return db.categorias.toArray(); }
  async actualizarClientesLocales(clientes: any[])      { await db.clientes.clear();    await db.clientes.bulkPut(clientes); }
  async obtenerClientesLocales(): Promise<any[]>        { return db.clientes.toArray(); }

  // ============================================================
  // RESTAURANTE — Menú
  // ============================================================

  /** Guarda todo el menú (categorías + items) en caché local */
  async cachearMenu(negocioId: string, categorias: MenuCategoriaLocal[]): Promise<void> {
    await db.menuCategorias
      .where('negocio_id').equals(negocioId)
      .delete();
    await db.menuCategorias.bulkPut(
      categorias.map(c => ({ ...c, negocio_id: negocioId, cachedAt: new Date().toISOString() }))
    );
    console.log(`💾 Menú cacheado: ${categorias.length} categorías`);
  }

  /** Devuelve el menú desde caché local */
  async obtenerMenuLocal(negocioId: string): Promise<MenuCategoriaLocal[]> {
    return db.menuCategorias.where('negocio_id').equals(negocioId).sortBy('orden');
  }

  /** True si el caché del menú es reciente (< maxMinutes minutos) */
  async menuCacheValido(negocioId: string, maxMinutes = 60): Promise<boolean> {
    const primera = await db.menuCategorias.where('negocio_id').equals(negocioId).first();
    if (!primera?.cachedAt) return false;
    const diff = (Date.now() - new Date(primera.cachedAt).getTime()) / 60000;
    return diff < maxMinutes;
  }

  // ============================================================
  // RESTAURANTE — Mesas
  // ============================================================

  async cachearMesas(negocioId: string, mesas: MesaLocal[]): Promise<void> {
    await db.mesas.where('negocio_id').equals(negocioId).delete();
    await db.mesas.bulkPut(
      mesas.map(m => ({ ...m, negocio_id: negocioId, cachedAt: new Date().toISOString() }))
    );
    console.log(`💾 Mesas cacheadas: ${mesas.length}`);
  }

  async obtenerMesasLocales(negocioId: string): Promise<MesaLocal[]> {
    return db.mesas.where('negocio_id').equals(negocioId).toArray();
  }

  async actualizarEstadoMesaLocal(mesaId: string, estado: string): Promise<void> {
    await db.mesas.where('id').equals(mesaId).modify({ estado });
  }

  // ============================================================
  // RESTAURANTE — Órdenes offline
  // ============================================================

  /** Genera un ID local temporal con prefijo "off_" */
  generarTempId(): string {
    return `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async guardarOrdenOffline(
    negocioId: string,
    datos: any,
    items: any[]
  ): Promise<OrdenOffline> {
    const orden: OrdenOffline = {
      tempId:       this.generarTempId(),
      negocio_id:   negocioId,
      datos,
      items,
      timestamp:    new Date().toISOString(),
      sincronizado: false
    };
    const idLocal = await db.ordenesOffline.add(orden);
    console.log(`💾 Orden offline guardada ID local: ${idLocal}`);
    return { ...orden, idLocal };
  }

  async agregarItemAOrdenOffline(tempId: string, item: any): Promise<void> {
    const orden = await db.ordenesOffline.where('tempId').equals(tempId).first();
    if (!orden || orden.idLocal == null) throw new Error('Orden offline no encontrada');
    await db.ordenesOffline.update(orden.idLocal, {
      items: [...orden.items, item]
    });
  }

  async obtenerOrdenesOfflinePendientes(negocioId: string): Promise<OrdenOffline[]> {
    return db.ordenesOffline
      .where('negocio_id').equals(negocioId)
      .filter(o => !o.sincronizado)
      .toArray();
  }

  async marcarOrdenSincronizada(idLocal: number): Promise<void> {
    await db.ordenesOffline.update(idLocal, { sincronizado: true });
  }

  async marcarErrorSync(idLocal: number, error: string): Promise<void> {
    await db.ordenesOffline.update(idLocal, { errorSync: error });
  }

  async contarOrdenesPendientes(negocioId: string): Promise<number> {
    return db.ordenesOffline
      .where('negocio_id').equals(negocioId)
      .filter(o => !o.sincronizado)
      .count();
  }
}
