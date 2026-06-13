export interface Usuario {
  id?: number;
  nombre: string;
  apellido: string;
  email: string;
  username: string;
  password?: string; // Solo para creación/actualización
  telefono?: string;
  avatar?: string;
  rol_id: number;
  rol?: Rol; // Para mostrar en UI
  negocio_id: string; // ID del negocio al que pertenece (UUID)
  negocio?: { id: string; nombre: string }; // Join con negocios para mostrar en UI
  activo: boolean;
  ultimo_acceso?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Rol {
  id?: number;
  nombre: string;
  descripcion: string;
  permisos: string[]; // Array de permisos como JSON
  color: string; // Color para mostrar en UI
  activo: boolean;
  negocio_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Sesion {
  id?: number;
  usuario_id: number;
  token: string;
  fecha_inicio: string;
  fecha_expiracion: string;
  ip_address?: string;
  user_agent?: string;
  activa: boolean;
}

// Tipos para crear/actualizar
export type CrearUsuario = Omit<Usuario, 'id' | 'created_at' | 'updated_at' | 'rol' | 'ultimo_acceso'>;
export type ActualizarUsuario = Partial<Omit<Usuario, 'id' | 'created_at' | 'updated_at' | 'rol'>>;
export type CrearRol = Omit<Rol, 'id' | 'created_at' | 'updated_at'>;

// Permisos del sistema
export const PERMISOS_SISTEMA = {
  // Dashboard
  'dashboard.ver': 'Ver Dashboard',

  // Inventario
  'inventario.ver': 'Ver Inventario',
  'inventario.crear': 'Crear Productos',
  'inventario.editar': 'Editar Productos',
  'inventario.eliminar': 'Eliminar Productos',
  'inventario.exportar': 'Exportar Inventario',

  // Proveedores
  'proveedores.ver': 'Ver Proveedores',
  'proveedores.crear': 'Crear Proveedores',
  'proveedores.editar': 'Editar Proveedores',
  'proveedores.eliminar': 'Eliminar Proveedores',

  // Clientes
  'clientes.ver': 'Ver Clientes',
  'clientes.crear': 'Crear Clientes',
  'clientes.editar': 'Editar Clientes',
  'clientes.eliminar': 'Eliminar Clientes',

  // Ventas
  'ventas.ver': 'Ver Ventas',
  'ventas.crear': 'Realizar Ventas',
  'ventas.cancelar': 'Cancelar Ventas',
  'ventas.historial': 'Ver Historial de Ventas',
  'ventas.exportar': 'Exportar Ventas',

  // Caja
  'caja.ver': 'Ver Caja',
  'caja.abrir': 'Abrir Caja',
  'caja.cerrar': 'Cerrar Caja',
  'caja.movimientos': 'Gestionar Movimientos',
  'caja.arqueo': 'Realizar Arqueo',
  'caja.historial': 'Ver Historial de Caja',

  // Cuentas por Cobrar
  'cuentas.ver': 'Ver Cuentas por Cobrar',
  'cuentas.pagos': 'Registrar Pagos',
  'cuentas.recordatorios': 'Gestionar Recordatorios',
  'cuentas.exportar': 'Exportar Cuentas',

  // Usuarios y Roles
  'usuarios.ver': 'Ver Usuarios',
  'usuarios.crear': 'Crear Usuarios',
  'usuarios.editar': 'Editar Usuarios',
  'usuarios.eliminar': 'Eliminar Usuarios',
  'roles.ver': 'Ver Roles',
  'roles.crear': 'Crear Roles',
  'roles.editar': 'Editar Roles',
  'roles.eliminar': 'Eliminar Roles',

  // Reportes
  'reportes.ventas': 'Reportes de Ventas',
  'reportes.inventario': 'Reportes de Inventario',
  'reportes.caja': 'Reportes de Caja',
  'reportes.clientes': 'Reportes de Clientes',

  // Restaurante — acceso general
  'restaurante.mesas': 'Ver Mapa de Mesas',
  'restaurante.ordenes': 'Gestionar Órdenes de Mesa',
  'restaurante.cobrar': 'Cobrar y Procesar Pagos',
  'restaurante.anular': 'Anular Cobros de Órdenes',
  'restaurante.cocina': 'Pantalla de Cocina (KDS)',
  'restaurante.admin': 'Acceder a Configuración del Restaurante',
  'restaurante.inventario': 'Inventario del Restaurante (Insumos, Recetas)',
  'restaurante.compras': 'Registrar Compras de Insumos',
  'restaurante.reportes': 'Reportes del Restaurante',
  // Restaurante — tabs del admin (control granular)
  'restaurante.admin.zonas': 'Configurar Zonas del Restaurante',
  'restaurante.admin.mesas': 'Configurar Mesas del Restaurante',
  'restaurante.admin.categorias': 'Configurar Categorías del Menú',
  'restaurante.admin.platos': 'Configurar Platos del Menú',
  'restaurante.admin.inventario': 'Gestionar Inventario de Insumos',
  'restaurante.admin.compras': 'Registrar Compras de Insumos (Admin)',
  'restaurante.admin.ordenes': 'Ver Historial de Órdenes',
  'restaurante.admin.impresoras': 'Configurar Impresoras del Restaurante',

  // Configuración
  'config.general': 'Configuración General',
  'config.backup': 'Backup y Restauración',
  'config.logs': 'Ver Logs del Sistema'
} as const;

// Roles predefinidos
export const ROLES_PREDEFINIDOS = [
  {
    nombre: 'Super Administrador',
    descripcion: 'Acceso completo al sistema',
    color: '#dc2626', // red-600
    permisos: Object.keys(PERMISOS_SISTEMA),
    activo: true
  },
  {
    nombre: 'Administrador',
    descripcion: 'Gestión completa excepto usuarios y configuración',
    color: '#ea580c', // orange-600
    permisos: [
      'dashboard.ver',
      'inventario.ver', 'inventario.crear', 'inventario.editar', 'inventario.exportar',
      'proveedores.ver', 'proveedores.crear', 'proveedores.editar',
      'clientes.ver', 'clientes.crear', 'clientes.editar',
      'ventas.ver', 'ventas.crear', 'ventas.cancelar', 'ventas.historial', 'ventas.exportar',
      'caja.ver', 'caja.abrir', 'caja.cerrar', 'caja.movimientos', 'caja.arqueo', 'caja.historial',
      'cuentas.ver', 'cuentas.pagos', 'cuentas.recordatorios', 'cuentas.exportar',
      'reportes.ventas', 'reportes.inventario', 'reportes.caja', 'reportes.clientes'
    ],
    activo: true
  },
  {
    nombre: 'Cajero',
    descripcion: 'Operaciones de caja y ventas',
    color: '#2563eb', // blue-600
    permisos: [
      'dashboard.ver',
      'inventario.ver',
      'clientes.ver', 'clientes.crear',
      'ventas.ver', 'ventas.crear', 'ventas.historial',
      'caja.ver', 'caja.abrir', 'caja.cerrar', 'caja.movimientos', 'caja.arqueo',
      'cuentas.ver', 'cuentas.pagos'
    ],
    activo: true
  },
  {
    nombre: 'Vendedor',
    descripcion: 'Solo ventas y consultas básicas',
    color: '#16a34a', // green-600
    permisos: [
      'dashboard.ver',
      'inventario.ver',
      'clientes.ver', 'clientes.crear',
      'ventas.ver', 'ventas.crear',
      'cuentas.ver'
    ],
    activo: true
  },
  {
    nombre: 'Solo Lectura',
    descripcion: 'Solo consultas, sin modificaciones',
    color: '#6b7280',
    permisos: [
      'dashboard.ver',
      'inventario.ver',
      'clientes.ver',
      'ventas.ver', 'ventas.historial',
      'caja.ver', 'caja.historial',
      'cuentas.ver'
    ],
    activo: true
  },
  // ── ROLES ESPECÍFICOS DEL MÓDULO RESTAURANTE ──────────────────────────────
  {
    nombre: 'Gerente Restaurante',
    descripcion: 'Gestión completa del restaurante: mesas, menú, inventario, cobros, compras y reportes',
    color: '#7c3aed',
    permisos: [
      'dashboard.ver',
      'restaurante.mesas', 'restaurante.ordenes', 'restaurante.cobrar', 'restaurante.anular',
      'restaurante.cocina', 'restaurante.admin', 'restaurante.inventario',
      'restaurante.compras', 'restaurante.reportes',
      // Acceso completo a todas las tabs del admin
      'restaurante.admin.zonas', 'restaurante.admin.mesas',
      'restaurante.admin.categorias', 'restaurante.admin.platos',
      'restaurante.admin.inventario', 'restaurante.admin.compras',
      'restaurante.admin.ordenes', 'restaurante.admin.impresoras',
      'caja.ver', 'caja.abrir', 'caja.cerrar', 'caja.movimientos', 'caja.arqueo', 'caja.historial',
      'reportes.ventas', 'reportes.caja',
      'clientes.ver', 'clientes.crear',
      'usuarios.ver', 'roles.ver'
    ],
    activo: true
  },
  {
    nombre: 'Cajero Restaurante',
    descripcion: 'Toma de órdenes, cobro en mesa, apertura/cierre de caja y reportes básicos',
    color: '#0891b2',
    permisos: [
      'dashboard.ver',
      'restaurante.mesas', 'restaurante.ordenes', 'restaurante.cobrar',
      'restaurante.reportes',
      // Solo puede ver historial de órdenes en el admin
      'restaurante.admin', 'restaurante.admin.ordenes',
      'caja.ver', 'caja.abrir', 'caja.cerrar', 'caja.movimientos', 'caja.arqueo',
      'clientes.ver', 'clientes.crear'
    ],
    activo: true
  },
  {
    nombre: 'Mesero',
    descripcion: 'Apertura y gestión de órdenes en mesa, sin acceso a cobros ni configuración',
    color: '#059669',
    permisos: [
      'dashboard.ver',
      'restaurante.mesas', 'restaurante.ordenes',
      'clientes.ver'
    ],
    activo: true
  },
  {
    nombre: 'Cocinero',
    descripcion: 'Acceso exclusivo a la pantalla de cocina (KDS) para gestionar pedidos',
    color: '#d97706',
    permisos: [
      'dashboard.ver',
      'restaurante.cocina'
    ],
    activo: true
  }
] as const;

// Datos de login
export interface LoginCredentials {
  username: string;
  password: string;
  recordar?: boolean;
}

export interface LoginResponse {
  usuario: Usuario;
  token: string;
  expiracion: string;
}

// Estado de autenticación
export interface AuthState {
  isAuthenticated: boolean;
  usuario: Usuario | null;
  token: string | null;
  permisos: string[];
}