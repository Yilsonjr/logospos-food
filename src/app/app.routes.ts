import { Routes } from '@angular/router';
// Módulo Restaurante
import { RestauranteComponent } from './pages/restaurante/restaurante.component';
import { KitchenDisplayComponent } from './pages/restaurante/kitchen-display/kitchen-display.component';
import { PrintersAdminComponent } from './pages/restaurante/printers-admin/printers-admin.component';
import { RestaurantAdminComponent } from './pages/restaurante/restaurant-admin/restaurant-admin.component';
import { ReportesRestauranteComponent } from './pages/restaurante/reportes-restaurante/reportes-restaurante.component';
import { Inventario } from './pages/inventario/inventario.component';
import { Dashboard } from './pages/dashboard/dashboard';
import { ProveedoresComponent } from './pages/inventario/proveedores/proveedores.component';
import { ComprasComponent } from './pages/compras/compras.component';
import { NuevaCompraComponent } from './pages/compras/nueva-compra/nueva-compra.component';
import { DetalleCompraComponent } from './pages/compras/detalle-compra/detalle-compra.component';
import { ClientesComponent } from './pages/clientes/clientes.component';
import { PosComponent } from './pages/ventas/pos/pos.component';
import { MesasComponent } from './pages/ventas/mesas/mesas.component';
import { HistorialVentasComponent } from './pages/ventas/historial/historial-ventas.component';
import { CuentasCobrarComponent } from './pages/cuentas-cobrar/cuentas-cobrar.component';
import { RecordatoriosComponent } from './pages/cuentas-cobrar/recordatorios/recordatorios';
import { CuentasPagarComponent } from './pages/cuentas-pagar/cuentas-pagar.component';
import { NuevaCuentaComponent } from './pages/cuentas-pagar/nueva-cuenta/nueva-cuenta.component';
import { DetalleCuentaPagarComponent } from './pages/cuentas-pagar/detalle/detalle-cuenta-pagar.component';
import { PlanPagosComponent } from './pages/cuentas-pagar/plan-pagos/plan-pagos.component';
import { AperturaCajaComponent } from './pages/caja/apertura/apertura-caja.component';
import { CierreCajaComponent } from './pages/caja/cierre/cierre-caja.component';
import { MovimientoCajaComponent } from './pages/caja/movimiento/movimiento-caja.component';
import { ArqueoCajaComponent } from './pages/caja/arqueo/arqueo-caja.component';
import { HistorialCajaComponent } from './pages/caja/historial/historial-caja.component';

// Componentes de Autenticación
import { LoginComponent } from './pages/auth/login/login.component';
import { PerfilComponent } from './pages/auth/perfil/perfil.component';
import { UsuariosComponent } from './pages/admin/usuarios/usuarios.component';
import { RolesComponent } from './pages/admin/roles/roles.component';
import { SistemaComponent } from './pages/admin/sistema/sistema.component';
import { ConfiguracionFiscalComponent } from './pages/admin/configuracion-fiscal/configuracion-fiscal.component';
import { DeveloperNegociosComponent } from './pages/admin/developer-negocios/developer-negocios.component';
import { IdentidadNegocioComponent } from './pages/admin/negocio/identidad-negocio.component';

// Componentes de Reportes
import { ReportesVentasComponent } from './pages/reportes/ventas/reportes-ventas.component';
import { ReportesInventarioComponent } from './pages/reportes/inventario/reportes-inventario.component';
import { ReportesCajaComponent } from './pages/reportes/caja/reportes-caja.component';
import { ReportesClientesComponent } from './pages/reportes/clientes/reportes-clientes.component';

// Guards
import { AuthGuard } from './guards/auth.guard';
import { PermissionGuard } from './guards/permission.guard';
import { ModuloGuard } from './guards/modulo.guard'; // 💡 Nuevo Guard

export const routes: Routes = [
    // Ruta de Login (sin protección)
    { path: 'login', component: LoginComponent },


    // Rutas protegidas con autenticación
    {
        path: 'dashboard',
        component: Dashboard,
        canActivate: [AuthGuard, PermissionGuard],
        data: { permissions: ['dashboard.ver'] }
    },

    // Inventario
    {
        path: 'inventario',
        component: Inventario,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['inventario.ver'], modulo: 'inventario' }
    },
    {
        path: 'inventario/proveedores',
        component: ProveedoresComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['proveedores.ver'], modulo: 'proveedores' }
    },

    // Compras
    {
        path: 'compras',
        component: ComprasComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['inventario.ver'], modulo: 'compras' }
    },
    {
        path: 'compras/nueva',
        component: NuevaCompraComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['inventario.crear'], modulo: 'compras' }
    },
    {
        path: 'compras/:id',
        component: DetalleCompraComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['inventario.ver'], modulo: 'compras' }
    },

    // Clientes
    {
        path: 'clientes',
        component: ClientesComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['clientes.ver'], modulo: 'clientes' }
    },

    // Ventas
    {
        path: 'ventas/nueva',
        component: PosComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['ventas.crear'], modulo: 'ventas' }
    },
    {
        path: 'ventas/mesas',
        component: MesasComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['ventas.crear'], modulo: 'mesas' }
    },
    {
        path: 'ventas/historial',
        component: HistorialVentasComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['ventas.historial'], modulo: 'ventas' }
    },

    // Caja
    {
        path: 'caja/apertura',
        component: AperturaCajaComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['caja.abrir'], modulo: 'caja' }
    },
    {
        path: 'caja/cierre',
        component: CierreCajaComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['caja.cerrar'], modulo: 'caja' }
    },
    {
        path: 'caja/entrada-efectivo',
        component: MovimientoCajaComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['caja.movimientos'], modulo: 'caja' }
    },
    {
        path: 'caja/salida-efectivo',
        component: MovimientoCajaComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['caja.movimientos'], modulo: 'caja' }
    },
    {
        path: 'caja/arqueo',
        component: ArqueoCajaComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['caja.arqueo'], modulo: 'caja' }
    },
    {
        path: 'caja/historial',
        component: HistorialCajaComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['caja.historial'], modulo: 'caja' }
    },

    // Cuentas por Cobrar
    {
        path: 'cuentas-cobrar',
        component: CuentasCobrarComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['cuentas.ver'], modulo: 'cuentas_cobrar' }
    },
    {
        path: 'cuentas-cobrar/recordatorios',
        component: RecordatoriosComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['cuentas.recordatorios'], modulo: 'cuentas_cobrar' }
    },

    // Cuentas por Pagar
    {
        path: 'cuentas-pagar',
        component: CuentasPagarComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['cuentas.ver'], modulo: 'cuentas_pagar' }
    },
    {
        path: 'cuentas-pagar/nueva',
        component: NuevaCuentaComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['cuentas.crear'], modulo: 'cuentas_pagar' }
    },
    {
        path: 'cuentas-pagar/editar/:id',
        component: NuevaCuentaComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['cuentas.editar'], modulo: 'cuentas_pagar' }
    },
    {
        path: 'cuentas-pagar/detalle/:id',
        component: DetalleCuentaPagarComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['cuentas.ver'], modulo: 'cuentas_pagar' }
    },
    {
        path: 'cuentas-pagar/plan-pagos',
        component: PlanPagosComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['cuentas.ver'], modulo: 'cuentas_pagar' }
    },

    // Perfil de Usuario
    {
        path: 'perfil',
        component: PerfilComponent,
        canActivate: [AuthGuard]
    },

    // Reportes
    {
        path: 'reportes/ventas',
        component: ReportesVentasComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['reportes.ventas'], modulo: 'reportes' }
    },
    {
        path: 'reportes/inventario',
        component: ReportesInventarioComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['reportes.inventario'], modulo: 'reportes' }
    },
    {
        path: 'reportes/caja',
        component: ReportesCajaComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['reportes.caja'], modulo: 'reportes' }
    },
    {
        path: 'reportes/clientes',
        component: ReportesClientesComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['reportes.clientes'], modulo: 'reportes' }
    },
    {
        path: 'reportes',
        redirectTo: 'reportes/ventas',
        pathMatch: 'full'
    },

    // Administración
    {
        path: 'admin/usuarios',
        component: UsuariosComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['usuarios.ver'], modulo: 'usuarios' }
    },
    {
        path: 'admin/roles',
        component: RolesComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['roles.ver'], modulo: 'usuarios' }
    },
    {
        path: 'admin/sistema',
        component: SistemaComponent,
        canActivate: [AuthGuard, PermissionGuard],
        data: { permissions: ['config.general'] }
    },
    {
        path: 'admin/fiscal',
        component: ConfiguracionFiscalComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['config.general'], modulo: 'fiscal' }
    },
    {
        path: 'admin/negocio',
        component: IdentidadNegocioComponent,
        canActivate: [AuthGuard, PermissionGuard],
        data: { permissions: ['config.general'] }
    },
    {
        path: 'admin/developer/negocios',
        component: DeveloperNegociosComponent,
        canActivate: [AuthGuard, PermissionGuard],
        data: { permissions: ['config.general'] }
    },

    // ---- MÓDULO RESTAURANTE ----
    {
        path: 'restaurante',
        component: RestauranteComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['restaurante.mesas'], modulo: 'restaurante' }
    },
    {
        path: 'restaurante/cocina',
        component: KitchenDisplayComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['restaurante.cocina'], modulo: 'cocina' }
    },
    {
        path: 'restaurante/impresoras',
        component: PrintersAdminComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['restaurante.admin'], modulo: 'restaurante' }
    },
    {
        path: 'restaurante/admin',
        component: RestaurantAdminComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['restaurante.admin'], modulo: 'restaurante' }
    },
    {
        path: 'restaurante/reportes',
        component: ReportesRestauranteComponent,
        canActivate: [AuthGuard, PermissionGuard, ModuloGuard],
        data: { permissions: ['restaurante.admin'], modulo: 'restaurante' }
    },

    // Redirecciones
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    { path: '**', redirectTo: 'dashboard' }
];
