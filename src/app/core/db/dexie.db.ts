import Dexie, { Table } from 'dexie';
import { Productos } from '../../models/productos.model';

// ── Ventas (módulo existente) ────────────────────────────────
export interface VentaPendiente {
  idLocal?: number;
  data: any;
  timestamp: string;
}

// ── Restaurante offline ──────────────────────────────────────

/** Categoría con sus items embebidos, cacheada localmente */
export interface MenuCategoriaLocal {
  id: string;
  negocio_id: string;
  nombre: string;
  orden: number;
  activa: boolean;
  color?: string | null;
  icono?: string | null;
  printer_id?: string | null;
  items: any[];          // MenuItem[] con modificadores
  cachedAt: string;      // ISO timestamp del último caché
}

/** Mesa con su estado, cacheada localmente */
export interface MesaLocal {
  id: string;
  negocio_id: string;
  zona_id: string;
  numero_mesa: number;
  nombre_mesa?: string | null;
  capacidad: number;
  estado: string;
  activa: boolean;
  zona?: any;
  cachedAt: string;
}

/** Orden creada offline — pendiente de sincronizar */
export interface OrdenOffline {
  idLocal?: number;
  tempId: string;          // UUID generado localmente (prefijo "off_")
  negocio_id: string;
  datos: any;              // CrearOrden
  items: any[];            // AgregarItemOrden[]
  timestamp: string;
  sincronizado: boolean;
  errorSync?: string;
}

export class LicorPOSDatabase extends Dexie {
  // Módulo ventas
  productos!: Table<Productos>;
  categorias!: Table<{ id: number; nombre: string }>;
  clientes!: Table<any>;
  ventasPendientes!: Table<VentaPendiente>;
  metadata!: Table<{ key: string; value: any }>;

  // Módulo restaurante
  menuCategorias!: Table<MenuCategoriaLocal>;
  mesas!: Table<MesaLocal>;
  ordenesOffline!: Table<OrdenOffline>;

  constructor() {
    super('LicorPOSDatabase');

    this.version(1).stores({
      productos:         'id, nombre, categoria, sku, codigo_barras',
      categorias:        'id, nombre',
      clientes:          'id, nombre, cedula, rnc',
      ventasPendientes:  '++idLocal, timestamp',
      metadata:          'key'
    });

    this.version(2).stores({
      productos:         'id, nombre, categoria, sku, codigo_barras',
      categorias:        'id, nombre',
      clientes:          'id, nombre, cedula, rnc',
      ventasPendientes:  '++idLocal, timestamp',
      metadata:          'key',
      menuCategorias:    'id, negocio_id, orden',
      mesas:             'id, negocio_id, zona_id, estado',
      ordenesOffline:    '++idLocal, tempId, negocio_id, sincronizado, timestamp'
    });
  }
}

export const db = new LicorPOSDatabase();
