// ============================================================
// LOGOSPOS - MÓDULO RESTAURANTE
// Modelos e Interfaces TypeScript
// Ruta: src/app/models/restaurant.models.ts
// ============================================================

// ============================================================
// TIPOS DE ESTADO (Enumeraciones)
// ============================================================

/** Estado visual de una mesa en el mapa */
export type EstadoMesa = 'libre' | 'ocupada' | 'reservada' | 'limpieza' | 'bloqueada';

/** Ciclo de vida de una orden */
export type EstadoOrden = 'abierta' | 'en_cocina' | 'lista' | 'pagando' | 'cerrada' | 'cancelada';

/** Tipo de orden del restaurante */
export type TipoOrden = 'mesa' | 'barra' | 'llevar' | 'delivery';

/** Estado de un item individual dentro de una orden */
export type EstadoItemOrden = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'cancelado';

/** Estado del ticket en la pantalla de cocina (KDS) */
export type EstadoTicketCocina = 'nuevo' | 'en_preparacion' | 'listo' | 'entregado';

/** Nivel de urgencia de un ticket de cocina */
export type PrioridadTicket = 'baja' | 'normal' | 'alta' | 'urgente';

/** Métodos de pago aceptados */
export type FormaPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'cheque' | 'mixto' | 'credito';

/** Tipos de movimiento de inventario */
export type TipoMovimientoInventario = 'entrada' | 'salida' | 'ajuste' | 'merma' | 'produccion';

// ============================================================
// INTERFACES DE TABLAS PRINCIPALES
// ============================================================

/** Zona o área del restaurante (salón, terraza, bar…) */
export interface RestaurantZone {
  id: string;
  negocio_id: string;
  nombre: string;
  descripcion?: string | null;
  orden: number;
  activa: boolean;
  created_at?: string;
  updated_at?: string;
  // Relaciones opcionales (joins)
  mesas?: RestaurantTable[];
}

/** Mesa física del restaurante */
export interface RestaurantTable {
  id: string;
  negocio_id: string;
  zona_id: string;
  numero_mesa: number;
  nombre_mesa?: string | null;
  capacidad: number;
  estado: EstadoMesa;
  ubicacion_x: number;
  ubicacion_y: number;
  activa: boolean;
  notas?: string | null;
  // Reserva
  reserva_nombre?: string | null;
  reserva_hora?: string | null;    // HH:MM
  reserva_personas?: number | null;
  reserva_notas?: string | null;
  created_at?: string;
  updated_at?: string;
  // Relaciones opcionales (joins)
  zona?: RestaurantZone;
  orden_activa?: RestaurantOrder | null;
}

/** Categoría del menú */
export interface MenuCategory {
  id: string;
  negocio_id: string;
  nombre: string;
  descripcion?: string | null;
  imagen_url?: string | null;
  icono?: string | null;
  orden: number;
  activa: boolean;
  created_at?: string;
  updated_at?: string;
  // Relaciones opcionales (joins)
  printer_id?: string | null;
  printer?: RestaurantPrinter | null;
  items?: MenuItem[];
}

/** Plato, bebida o producto del menú */
export interface MenuItem {
  id: string;
  negocio_id: string;
  categoria_id: string;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  imagen_url?: string | null;
  tiempo_preparacion_minutos: number;
  requiere_inventario: boolean;
  /** Costo estimado por unidad (cuando no se usa inventario con recetas) */
  costo_estimado?: number | null;
  /** Si es false, el item NO se envía al KDS (bebidas, snacks, postres fríos) */
  enviar_a_cocina: boolean;
  notas_cocina?: string | null;
  disponible: boolean;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
  // Relaciones opcionales (joins)
  categoria?: MenuCategory;
  modificadores?: MenuItemModifier[];
}

/** Modificador/opción de un item del menú */
export interface MenuItemModifier {
  id: string;
  menu_item_id: string;
  grupo_nombre: string;
  nombre: string;
  precio_adicional: number;
  obligatorio: boolean;
  max_seleccion: number;
  orden: number;
  activo: boolean;
  created_at?: string;
}

/** Orden/cuenta de una mesa */
export interface RestaurantOrder {
  id: string;
  negocio_id: string;
  table_id: string | null;
  mesero_id?: number | null;
  estado: EstadoOrden;
  tipo_orden?: TipoOrden;
  cantidad_comensales: number;
  subtotal: number;
  impuesto: number;
  descuento: number;
  total: number;
  propina: number;
  notas_generales?: string | null;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  direccion_entrega?: string | null;
  numero_pedido_dia?: number | null;
  hora_apertura: string;
  hora_envio_cocina?: string | null;
  hora_cierre?: string | null;
  created_at?: string;
  updated_at?: string;
  // Relaciones opcionales (joins)
  mesa?: RestaurantTable;
  items?: RestaurantOrderItem[];
  pagos?: RestaurantOrderPayment[];
}

/** Modificador seleccionado al momento de ordenar (snapshot en JSONB) */
export interface ModificadorSeleccionado {
  nombre: string;
  precio_adicional: number;
}

/** Item individual dentro de una orden */
export interface RestaurantOrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  modificadores: ModificadorSeleccionado[];
  notas_especiales?: string | null;
  comensal_asignado?: number | null;
  estado: EstadoItemOrden;
  created_at?: string;
  updated_at?: string;
  // Relaciones opcionales (joins)
  menu_item?: MenuItem;
}

/** Item dentro del snapshot de un ticket de cocina */
export interface KitchenTicketItem {
  order_item_id: string;
  nombre: string;
  cantidad: number;
  modificadores: ModificadorSeleccionado[];
  notas_especiales?: string | null;
  comensal_asignado?: number | null;
}

/** Ticket enviado a la pantalla de cocina (KDS) */
export interface KitchenTicket {
  id: string;
  negocio_id: string;
  order_id: string;
  table_id: string | null;
  numero_mesa: number;
  items: KitchenTicketItem[];
  estado: EstadoTicketCocina;
  prioridad: PrioridadTicket;
  cocinero_id?: number | null;
  hora_creacion: string;
  hora_inicio_prep?: string | null;
  hora_listo?: string | null;
  hora_entregado?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Ítem de inventario (ingrediente / insumo) */
export interface RestaurantInventoryItem {
  id: string;
  negocio_id: string;
  nombre: string;
  categoria?: string | null;
  unidad_medida: string;
  cantidad_actual: number;
  cantidad_minima: number;
  cantidad_maxima?: number | null;
  costo_unitario: number;
  proveedor?: string | null;
  ubicacion?: string | null;
  imagen_url?: string | null;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
  // Campo calculado (no viene de DB)
  stock_bajo?: boolean;
}

/** Línea de receta: qué ingrediente requiere un plato y en qué cantidad */
export interface MenuItemRecipe {
  id: string;
  menu_item_id: string;
  inventory_item_id: string;
  cantidad_requerida: number;
  unidad_medida: string;
  created_at?: string;
  // Relaciones opcionales (joins)
  item_inventario?: RestaurantInventoryItem;
}

/** Movimiento registrado en el inventario */
export interface RestaurantInventoryMovement {
  id: string;
  negocio_id: string;
  inventory_item_id: string;
  tipo_movimiento: TipoMovimientoInventario;
  cantidad: number;
  cantidad_anterior: number;
  cantidad_posterior: number;
  razon?: string | null;
  referencia_id?: string | null;
  referencia_tipo?: string | null;
  usuario_id?: number | null;
  created_at?: string;
}

// ============================================================
// IMPRESORAS Y RUTEO
// ============================================================

/** Tipo de estación destino de una impresora */
export type TipoImpresora = 'cocina' | 'barra' | 'caja' | 'comanda' | 'otro';

/** Tipo de conexión física de la impresora */
export type TipoConexionImpresora = 'red' | 'usb';

/** Impresora térmica configurada por negocio (red TCP o USB local) */
export interface RestaurantPrinter {
  id: string;
  negocio_id: string;
  nombre: string;
  descripcion?: string | null;
  tipo_conexion: TipoConexionImpresora; // 'red' = TCP/IP  |  'usb' = puerto Windows
  ip: string;                           // IP si tipo_conexion='red'
  puerto: number;                       // Puerto TCP si red (9100)
  puerto_usb?: string | null;           // Ej: 'USB001', 'USB002', 'COM3' si tipo_conexion='usb'
  tipo: TipoImpresora;
  caracteres_por_linea: number;
  corte_automatico: boolean;
  copies: number;
  activa: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Ítem individual dentro de un grupo de ruteo */
export interface RuteoItem {
  item_id: string;
  menu_item_nombre: string;
  cantidad: number;
  modificadores: ModificadorSeleccionado[];
  notas_especiales?: string | null;
  comensal_asignado?: number | null;
}

/** Grupo de ítems de una orden destinados a una impresora concreta */
export interface RuteoImpresora {
  printer_id: string;
  printer_nombre: string;
  printer_ip: string;
  printer_puerto: number;
  printer_tipo: TipoImpresora;
  printer_tipo_conexion?: TipoConexionImpresora;
  printer_puerto_usb?: string | null;
  printer_chars: number;
  printer_corte: boolean;
  copies: number;
  items: RuteoItem[];
}

/** Pago registrado para una orden (soporte pago dividido) */
export interface RestaurantOrderPayment {
  id: string;
  order_id: string;
  negocio_id: string;
  monto: number;
  forma_pago: FormaPago;
  comensal_numero?: number | null;
  propina_incluida: number;
  referencia_pago?: string | null;
  pagado: boolean;
  created_at?: string;
}

// ============================================================
// TIPOS COMPUESTOS / HELPER
// ============================================================

/** Mesa con zona y orden activa para el mapa visual */
export interface TableWithOrder extends RestaurantTable {
  zona: RestaurantZone;
  orden_activa: RestaurantOrder | null;
  tiempo_ocupada_minutos?: number;
  items_count?: number;
}

/** Orden completa con todos sus items y datos de menú */
export interface OrderWithItems extends RestaurantOrder {
  mesa?: RestaurantTable;  // undefined para órdenes de barra/llevar/delivery
  items: OrderItemWithMenuItem[];
}

/** Item de orden enriquecido con datos del menú */
export interface OrderItemWithMenuItem extends RestaurantOrderItem {
  menu_item: MenuItem;
}

/** Item en el carrito temporal (antes de persistir en BD) */
export interface CartItem {
  menu_item: MenuItem;
  cantidad: number;
  modificadores_seleccionados: ModificadorSeleccionado[];
  notas_especiales: string;
  comensal_asignado: number | null;
  precio_total: number;
}

/** Datos para crear una nueva orden */
export interface CrearOrden {
  negocio_id: string;
  table_id: string | null;
  mesero_id: number | null;
  cantidad_comensales: number;
  tipo_orden?: TipoOrden;
  notas_generales?: string;
  cliente_nombre?: string;
  cliente_telefono?: string;
  direccion_entrega?: string;
}

/** Datos para agregar un item a una orden existente */
export interface AgregarItemOrden {
  order_id: string;
  menu_item_id: string;
  cantidad: number;
  precio_unitario: number;
  modificadores: ModificadorSeleccionado[];
  notas_especiales?: string;
  comensal_asignado?: number | null;
}

/** Cuenta por comensal para pago dividido */
export interface CuentaComensal {
  numero: number;
  items: OrderItemWithMenuItem[];
  subtotal: number;
  propina: number;
  total: number;
  forma_pago: FormaPago;
  pagado: boolean;
  // Comprobante fiscal (NCF) — solo si el negocio tiene modo_fiscal activo
  requiere_comprobante?: boolean;
  tipo_ncf?: string;
  rnc_cliente?: string;
  nombre_cliente_fiscal?: string;
}

// ============================================================
// CONSTANTES DE UI
// ============================================================

/** Color Bootstrap por estado de mesa */
export const COLOR_ESTADO_MESA: Record<EstadoMesa, string> = {
  libre:     'success',
  ocupada:   'danger',
  reservada: 'warning',
  limpieza:  'info',
  bloqueada: 'secondary'
};

/** Etiqueta legible por estado de mesa */
export const LABEL_ESTADO_MESA: Record<EstadoMesa, string> = {
  libre:     'Libre',
  ocupada:   'Ocupada',
  reservada: 'Reservada',
  limpieza:  'En limpieza',
  bloqueada: 'Bloqueada'
};

/** Etiqueta legible por estado de orden */
export const LABEL_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  abierta:   'Abierta',
  en_cocina: 'En cocina',
  lista:     'Lista',
  pagando:   'Pagando',
  cerrada:   'Cerrada',
  cancelada: 'Cancelada'
};

/** Etiqueta legible por estado de ticket de cocina */
export const LABEL_ESTADO_TICKET: Record<EstadoTicketCocina, string> = {
  nuevo:          'Nuevo',
  en_preparacion: 'En preparación',
  listo:          'Listo',
  entregado:      'Entregado'
};

/** Color Bootstrap por prioridad de ticket */
export const COLOR_PRIORIDAD: Record<PrioridadTicket, string> = {
  baja:    'secondary',
  normal:  'primary',
  alta:    'warning',
  urgente: 'danger'
};
