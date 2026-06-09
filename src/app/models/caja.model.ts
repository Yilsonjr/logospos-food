export interface Caja {
  id?: number;
  fecha_apertura: string;
  fecha_cierre?: string;
  monto_inicial: number;
  monto_final?: number;
  total_ventas_efectivo?: number;
  total_ventas_tarjeta?: number;
  total_entradas?: number;
  total_salidas?: number;
  monto_esperado?: number;
  monto_real?: number;
  diferencia?: number;
  estado: 'abierta' | 'cerrada';
  usuario_apertura: string;
  usuario_cierre?: string;
  notas_apertura?: string;
  notas_cierre?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MovimientoCaja {
  id?: number;
  caja_id: number;
  tipo: 'entrada' | 'salida' | 'venta' | 'anulacion';
  concepto: string;
  monto: number;
  referencia?: string;
  usuario_id: number;
  created_at?: string;
  // Campos auxiliares para la UI (no están en la tabla movimientos_caja)
  metodo?: 'efectivo' | 'tarjeta';
  notas?: string;
}

export interface ArqueoCaja {
  caja_id: number;
  // Billetes
  billetes_2000: number;
  billetes_1000: number;
  billetes_500: number;
  billetes_200: number;
  billetes_100: number;
  billetes_50: number;
  // Monedas
  monedas_25: number;
  monedas_10: number;
  monedas_5: number;
  monedas_1: number;
  // Totales
  total_billetes: number;
  total_monedas: number;
  total_contado: number;
  total_esperado: number;
  diferencia: number;
  notas?: string;
}

export interface ResumenCaja {
  caja: Caja;
  movimientos: MovimientoCaja[];
  arqueo?: ArqueoCaja;
  total_ventas: number;           // efectivo + tarjeta (solo informativo)
  total_ventas_efectivo: number;  // solo ventas cobradas en efectivo
  total_ventas_tarjeta: number;   // solo ventas cobradas con tarjeta
  total_entradas: number;
  total_salidas: number;
  total_anulaciones: number;
  efectivo_disponible: number;    // monto_inicial + ventas_efectivo + entradas - salidas - anulaciones
}

// Tipos para crear
export type CrearCaja = Omit<Caja, 'id' | 'created_at' | 'updated_at'>;
export type CrearMovimientoCaja = Omit<MovimientoCaja, 'id' | 'created_at'>;
export type CrearArqueoCaja = ArqueoCaja;

// Estados de caja
export const ESTADOS_CAJA = [
  { valor: 'abierta', etiqueta: 'Abierta', color: 'green' },
  { valor: 'cerrada', etiqueta: 'Cerrada', color: 'gray' }
] as const;

// Tipos de movimiento
export const TIPOS_MOVIMIENTO = [
  { valor: 'entrada', etiqueta: 'Entrada', icono: 'fa-arrow-down', color: 'green' },
  { valor: 'salida', etiqueta: 'Salida', icono: 'fa-arrow-up', color: 'red' },
  { valor: 'venta',     etiqueta: 'Venta',     icono: 'fa-shopping-cart', color: 'blue'   },
  { valor: 'anulacion', etiqueta: 'Anulación', icono: 'fa-ban',           color: 'orange' }
] as const;

// Conceptos comunes
export const CONCEPTOS_ENTRADA = [
  'Depósito inicial',
  'Préstamo',
  'Devolución',
  'Ajuste positivo',
  'Otro'
] as const;

export const CONCEPTOS_SALIDA = [
  'Gastos operativos',
  'Pago a proveedor',
  'Servicios',
  'Mantenimiento',
  'Salarios',
  'Ajuste negativo',
  'Otro'
] as const;

// Denominaciones de billetes y monedas (RD$)
export const DENOMINACIONES = {
  billetes: [
    { valor: 2000, etiqueta: 'RD$2,000' },
    { valor: 1000, etiqueta: 'RD$1,000' },
    { valor: 500, etiqueta: 'RD$500' },
    { valor: 200, etiqueta: 'RD$200' },
    { valor: 100, etiqueta: 'RD$100' },
    { valor: 50, etiqueta: 'RD$50' }
  ],
  monedas: [
    { valor: 25, etiqueta: 'RD$25' },
    { valor: 10, etiqueta: 'RD$10' },
    { valor: 5, etiqueta: 'RD$5' },
    { valor: 1, etiqueta: 'RD$1' }
  ]
} as const;
