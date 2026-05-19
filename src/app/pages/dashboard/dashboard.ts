import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { VentasService } from '../../services/ventas.service';
import { ComprasService } from '../../services/compras.service';
import { CajaService } from '../../services/caja.service';
import { CuentasCobrarService } from '../../services/cuentas-cobrar.service';
import { ProductosService } from '../../services/productos.service';
import { FiscalService } from '../../services/fiscal.service';
import { NegociosService, ModuloSistema } from '../../services/negocios.service';
import { SupabaseService } from '../../services/supabase.service';
import { Subscription } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import Swal from 'sweetalert2';

interface StatCard {
  title: string;
  value: string;
  change: string;
  isPositive: boolean;
  icon: string;
  iconBg: string;
  isUrgent?: boolean;
}

interface TopProduct {
  name: string;
  category: string;
  price: string;
  sales: string;
  initials: string;
}

interface Transaction {
  id: string;
  customer: string;
  customerInitials: string;
  date: string;
  status: 'completed' | 'pending';
  total: string;
}

interface ChartData {
  label: string;
  value: number;
  percentage: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {
  selectedPeriod: 'weekly' | 'monthly' | 'yearly' = 'weekly';
  activeTab: 'products' | 'transactions' | 'orders' = 'products';
  isLoading = true;

  stats: StatCard[] = [];
  topProducts: TopProduct[] = [];
  transactions: Transaction[] = [];
  ordenesActivas: any[] = [];
  chartData: ChartData[] = [];
  modoFiscalActivo = false;

  private subscriptions: Subscription[] = [];
  private moduloSubscriptions: Subscription[] = [];

  constructor(
    private ventasService: VentasService,
    private comprasService: ComprasService,
    private cajaService: CajaService,
    private cuentasCobrarService: CuentasCobrarService,
    private productosService: ProductosService,
    private fiscalService: FiscalService,
    public negociosService: NegociosService,
    private supabaseService: SupabaseService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  private limpiarSubscripcionesModulos() {
    this.moduloSubscriptions.forEach(sub => sub.unsubscribe());
    this.moduloSubscriptions = [];
  }

  private negocioResuelto = false;

  async ngOnInit() {
    console.log('🔄 Iniciando dashboard modular...');
    this.isLoading = true;

    // Disparar carga del negocio si aún no está en memoria
    if (!this.negociosService.modulosActivos.length) {
      this.negociosService.cargarNegocio().catch(() => {});
    }

    // Timeout de seguridad: si en 8s el negocio no resolvió, apagar el spinner
    setTimeout(() => {
      if (!this.negocioResuelto) {
        this.negocioResuelto = true;
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    }, 8000);

    // Suscribirse de manera reactiva a los cambios o carga del negocio
    const negocioSub = this.negociosService.negocio$.subscribe(async (negocio) => {
      console.log('💼 Negocio cargado o actualizado en dashboard:', negocio?.nombre || 'Ninguno');

      this.limpiarSubscripcionesModulos();

      if (!negocio) {
        // Solo apagar el loading si ya tuvimos una carga previa (negocio llegó y luego se anuló)
        if (this.negocioResuelto) {
          this.isLoading = false;
          this.cdr.detectChanges();
        }
        // Si aún no se ha resuelto, mantener isLoading=true para mostrar spinner
        return;
      }

      this.negocioResuelto = true;
      this.isLoading = true;
      this.cdr.detectChanges();

      // 1. Suscribirse al estado fiscal
      const fiscalSub = this.fiscalService.config$.subscribe(cfg => {
        this.modoFiscalActivo = (cfg?.modo_fiscal ?? false) && this.negociosService.tieneModulo('fiscal');
        this.cdr.detectChanges();
      });
      this.moduloSubscriptions.push(fiscalSub);

      // 2. Cargar datos según módulo disponible
      if (this.negociosService.tieneModulo('ventas')) {
        this.ventasService.cargarVentas().catch(err => console.warn('Error cargando ventas:', err));
        const ventasSub = this.ventasService.ventas$.subscribe(async (ventas) => {
          await this.actualizarVentasStats(ventas);
          this.actualizarTransacciones(ventas);
          this.actualizarChartDesdeVentas(ventas);
          this.isLoading = false;
          this.cdr.detectChanges();
        });
        this.moduloSubscriptions.push(ventasSub);
      } else if (this.negociosService.tieneModulo('restaurante')) {
        // Negocio tipo restaurante/bar: cargar datos propios del restaurante
        this.activeTab = 'orders';
        await this.cargarStatsRestaurante();
        await this.cargarDatosManuales();
        this.isLoading = false;
        this.cdr.detectChanges();
        return; // cargarDatosManuales ya fue llamado, salir temprano
      } else {
        this.isLoading = false;
        this.cdr.detectChanges();
      }

      // 3. Cargar datos frescos y suscribirse a Productos
      if (this.negociosService.tieneModulo('inventario')) {
        this.productosService.cargarProductos().catch(err => console.warn('Error cargando productos:', err));
        const productosSub = this.productosService.productos$.subscribe(productos => {
          this.actualizarProductosStats(productos);
          this.actualizarTopProductos(productos);
          this.cdr.detectChanges();
        });
        this.moduloSubscriptions.push(productosSub);
      }

      // 4. Datos de Caja y Cuentas
      await this.cargarDatosManuales();

      // 5. Verificar Onboarding
      this.verificarOnboarding();

      this.cdr.detectChanges();
    });
    this.subscriptions.push(negocioSub);

    // Recargar cuando se navega al dashboard
    const navSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(async (event: any) => {
        if (event.url === '/' || event.url === '/dashboard') {
          const tasks: Promise<any>[] = [];
          if (this.negociosService.tieneModulo('ventas')) tasks.push(this.ventasService.cargarVentas());
          if (this.negociosService.tieneModulo('inventario')) tasks.push(this.productosService.cargarProductos());
          if (this.negociosService.tieneModulo('compras')) tasks.push(this.comprasService.cargarCompras());
          if (this.negociosService.tieneModulo('restaurante')) tasks.push(this.cargarStatsRestaurante());
          tasks.push(this.cargarDatosManuales());
          await Promise.all(tasks);
        }
      });
    this.subscriptions.push(navSub);
  }

  /**
   * 💡 Muestra un asistente de bienvenida si los datos del negocio están totalmente vacíos
   */
  private verificarOnboarding() {
    // Si ya lo vio en esta sesión, no molestar
    if (localStorage.getItem('onboarding_visto') === 'true') return;

    this.negociosService.negocio$.pipe(
      take(1),
      filter(n => n !== null)
    ).subscribe(negocio => {
      // Solo mostrar si faltan los campos críticos de identidad (Teléfono Y RNC Y Logo)
      const incompleto = negocio && !negocio.telefono && !negocio.rnc && !negocio.logo_url;

      if (incompleto) {
        setTimeout(() => {
          Swal.fire({
            title: `¡Bienvenido a LogosPOS, ${negocio.nombre}! 🚀`,
            text: 'Tu ecosistema está listo. Completa la identidad de tu negocio cuando puedas para empezar a facturar profesionalmente.',
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: '🚀 Configurar identidad',
            cancelButtonText: 'Después',
            confirmButtonColor: '#3699ff',
            reverseButtons: true
          }).then((result) => {
            // Marcar como visto sin importar la elección
            localStorage.setItem('onboarding_visto', 'true');
            if (result.isConfirmed) {
              this.router.navigate(['/admin/negocio']);
            }
          });
        }, 1500);
      } else {
        // Si ya tiene datos, marcar como visto para no volver a evaluar
        localStorage.setItem('onboarding_visto', 'true');
      }
    });
  }

  private upsertStat(stat: StatCard) {
    const idx = this.stats.findIndex(s => s.title === stat.title);
    if (idx > -1) this.stats[idx] = stat;
    else this.stats.push(stat);
  }

  private actualizarChartRestaurante(pagos: { monto: number; created_at: string }[]) {
    const fechaInicio = new Date();
    fechaInicio.setDate(fechaInicio.getDate() - 7);
    const pagosPorDia = new Map<string, number>();

    pagos.filter(p => new Date(p.created_at) >= fechaInicio).forEach(p => {
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
      pagosPorDia.set(key, (pagosPorDia.get(key) || 0) + p.monto);
    });

    const maxVal = Math.max(...Array.from(pagosPorDia.values()), 1);
    this.chartData = Array.from(pagosPorDia.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, total]) => ({ label: this.formatearDia(fecha), value: total, percentage: (total / maxVal) * 100 }));
  }

  async cargarStatsRestaurante() {
    const negocioId = localStorage.getItem('logos_negocio_id') || '';
    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);

    // 1. Ventas del día desde pagos confirmados
    try {
      const { data: pagos } = await this.supabaseService.client
        .from('restaurant_order_payments')
        .select('monto, created_at')
        .eq('pagado', true)
        .gte('created_at', hoyInicio.toISOString());

      const totalHoy = pagos?.reduce((s, p) => s + p.monto, 0) || 0;
      this.upsertStat({
        title: 'Ventas de Hoy', value: this.formatearMoneda(totalHoy),
        change: 'Ingresos del día', isPositive: true,
        icon: 'fa-money-bill-wave', iconBg: 'bg-primary-subtle text-primary'
      });
      this.actualizarChartRestaurante(pagos || []);
    } catch (e) { console.warn('Error cargando pagos restaurante:', e); }

    // 2. Órdenes activas + historial reciente
    try {
      const { data: ordenes } = await this.supabaseService.client
        .from('restaurant_orders')
        .select('id, estado, total, hora_apertura, mesa:restaurant_tables(numero_mesa)')
        .eq('negocio_id', negocioId)
        .not('estado', 'in', '(cerrada,cancelada)')
        .order('hora_apertura', { ascending: false });

      const activas = ordenes?.length || 0;
      this.upsertStat({
        title: 'Órdenes Activas', value: `${activas}`,
        change: activas > 0 ? 'En proceso' : 'Sin órdenes activas',
        isPositive: true, icon: 'fa-utensils',
        iconBg: activas > 0 ? 'bg-warning-subtle text-warning' : 'bg-success-subtle text-success',
        isUrgent: false
      });
      this.ordenesActivas = ordenes?.slice(0, 10) || [];
    } catch (e) { console.warn('Error cargando órdenes activas:', e); }

    // 3. Mesas ocupadas vs total
    try {
      const { data: mesas } = await this.supabaseService.client
        .from('restaurant_tables')
        .select('id, estado')
        .eq('negocio_id', negocioId);

      const total = mesas?.length || 0;
      const ocupadas = mesas?.filter((m: any) => m.estado === 'ocupada').length || 0;
      this.upsertStat({
        title: 'Mesas Ocupadas', value: `${ocupadas} / ${total}`,
        change: ocupadas > 0 ? 'Con clientes' : 'Todas libres',
        isPositive: ocupadas < total, icon: 'fa-chair',
        iconBg: ocupadas > 0 ? 'bg-info-subtle text-info' : 'bg-success-subtle text-success'
      });
    } catch (e) { console.warn('Error cargando mesas:', e); }

    // 4. Efectivo en caja (si tiene módulo)
    if (this.negociosService.tieneModulo('caja')) {
      this.inicializarTarjetaSiFalta('Efectivo en Caja', 'fa-wallet', 'bg-success-subtle text-success');
    }
  }

  async cargarDatosManuales() {
    try {
      let efectivoCaja = 0;
      let cuentasPorCobrar = 0;
      if (this.negociosService.tieneModulo('caja')) efectivoCaja = await this.obtenerEfectivoCaja();
      if (this.negociosService.tieneModulo('cuentas_cobrar')) cuentasPorCobrar = await this.obtenerCuentasPorCobrar();

      this.stats = this.stats.map(s => {
        if (s.title === 'Efectivo en Caja') s.value = this.formatearMoneda(efectivoCaja);
        if (s.title === 'Cuentas por Cobrar') s.value = this.formatearMoneda(cuentasPorCobrar);
        return s;
      });
      this.cdr.detectChanges();
    } catch (e) {
      console.warn('Error cargando datos manuales:', e);
    }
  }

  async actualizarVentasStats(ventas: any[]) {
    if (!this.negociosService.tieneModulo('ventas')) return;
    const ahora = new Date();
    const hoy = `${ahora.getFullYear()}-${(ahora.getMonth() + 1).toString().padStart(2, '0')}-${ahora.getDate().toString().padStart(2, '0')}`;
    
    // 1. Total de ventas POS hoy
    const totalVentasHoyPOS = ventas
      .filter(v => {
        const fechaVenta = new Date(v.created_at);
        const fechaLocal = `${fechaVenta.getFullYear()}-${(fechaVenta.getMonth() + 1).toString().padStart(2, '0')}-${fechaVenta.getDate().toString().padStart(2, '0')}`;
        return fechaLocal === hoy && v.estado === 'completada';
      })
      .reduce((sum, v) => sum + v.total, 0);

    // 2. Total de pagos del Restaurante hoy (desde restaurant_order_payments)
    let totalVentasHoyRestaurante = 0;
    try {
      const inicioHoy = new Date();
      inicioHoy.setHours(0, 0, 0, 0);

      const { data: pagosRest } = await this.supabaseService.client
        .from('restaurant_order_payments')
        .select('monto')
        .eq('pagado', true)
        .gte('created_at', inicioHoy.toISOString());

      totalVentasHoyRestaurante = pagosRest?.reduce((sum, p) => sum + p.monto, 0) || 0;
    } catch (err) {
      console.warn('Error fetching restaurant payments for dashboard:', err);
    }

    const totalVentasHoy = totalVentasHoyPOS + totalVentasHoyRestaurante;

    const sIndex = this.stats.findIndex(s => s.title === 'Ventas de Hoy');
    const newStat = {
      title: 'Ventas de Hoy', value: this.formatearMoneda(totalVentasHoy),
      change: 'Calculado', isPositive: true, icon: 'fa-money-bill-wave', iconBg: 'bg-primary-subtle text-primary'
    };

    if (sIndex > -1) this.stats[sIndex] = newStat;
    else this.stats.push(newStat);

    if (this.negociosService.tieneModulo('caja')) this.inicializarTarjetaSiFalta('Efectivo en Caja', 'fa-wallet', 'bg-success-subtle text-success');
    if (this.negociosService.tieneModulo('cuentas_cobrar')) this.inicializarTarjetaSiFalta('Cuentas por Cobrar', 'fa-file-invoice-dollar', 'bg-warning-subtle text-warning');

    this.cdr.detectChanges();
  }

  actualizarProductosStats(productos: any[]) {
    if (!this.negociosService.tieneModulo('inventario')) return;
    const stockCritico = productos.filter(p => (p.stock_actual || 0) < (p.stock_minimo || 5)).length;
    const sIndex = this.stats.findIndex(s => s.title === 'Stock Crítico');
    const newStat = {
      title: 'Stock Crítico', value: `${stockCritico} items`, change: stockCritico > 0 ? 'Revisar' : 'OK',
      isPositive: stockCritico === 0, icon: 'fa-box-open', iconBg: stockCritico > 0 ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success', isUrgent: stockCritico > 0
    };
    if (sIndex > -1) this.stats[sIndex] = newStat;
    else this.stats.push(newStat);
  }

  private inicializarTarjetaSiFalta(title: string, icon: string, iconBg: string) {
    if (!this.stats.find(s => s.title === title)) {
      this.stats.push({ title, value: this.formatearMoneda(0), change: '0%', isPositive: true, icon, iconBg });
    }
  }

  actualizarTopProductos(productos: any[]) {
    if (!this.negociosService.tieneModulo('inventario')) return;
    this.topProducts = productos.slice(0, 5).map(p => ({
      name: p.nombre, category: p.categoria || 'Sin categoría', price: this.formatearMoneda(p.precio_venta),
      sales: `Stock: ${p.stock_actual}`, initials: this.obtenerIniciales(p.nombre)
    }));
  }

  actualizarTransacciones(ventas: any[]) {
    if (!this.negociosService.tieneModulo('ventas')) return;
    this.transactions = ventas.slice(0, 10).map(v => ({
      id: v.numero_venta, customer: v.cliente_nombre || 'Cliente General', customerInitials: this.obtenerIniciales(v.cliente_nombre || 'Cliente General'),
      date: this.formatearFecha(v.created_at), status: v.estado === 'completada' ? 'completed' : 'pending', total: this.formatearMoneda(v.total)
    }));
  }

  actualizarChartDesdeVentas(ventas: any[]) {
    if (!this.negociosService.tieneModulo('ventas')) return;
    const fechaFin = new Date();
    const fechaInicio = new Date();
    fechaInicio.setDate(fechaFin.getDate() - 7); 
    const ventasFiltradas = ventas.filter(v => new Date(v.created_at) >= fechaInicio && v.estado === 'completada');

    const ventasPorDia = new Map<string, number>();
    ventasFiltradas.forEach(venta => {
      const fechaVenta = new Date(venta.created_at);
      const fecha = `${fechaVenta.getFullYear()}-${(fechaVenta.getMonth() + 1).toString().padStart(2, '0')}-${fechaVenta.getDate().toString().padStart(2, '0')}`;
      ventasPorDia.set(fecha, (ventasPorDia.get(fecha) || 0) + venta.total);
    });

    const maxVenta = Math.max(...Array.from(ventasPorDia.values()), 1);

    this.chartData = Array.from(ventasPorDia.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, total]) => ({
        label: this.formatearDia(fecha), value: total, percentage: (total / maxVenta) * 100
      }));
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.limpiarSubscripcionesModulos();
  }

  async obtenerEfectivoCaja(): Promise<number> {
    try {
      // 1. Intentar obtener shift activo
      let { data, error } = await this.supabaseService.client
        .from('cajas')
        .select('monto_inicial, total_ventas_efectivo, total_entradas, total_salidas, estado')
        .eq('estado', 'abierta')
        .order('fecha_apertura', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 2. Si no hay activa, obtener la última cerrada para mantener la información del día
      if (!data) {
        const { data: ultimoCerrado } = await this.supabaseService.client
          .from('cajas')
          .select('monto_inicial, total_ventas_efectivo, total_entradas, total_salidas, estado, monto_cierre')
          .eq('estado', 'cerrada')
          .order('fecha_cierre', { ascending: false })
          .limit(1)
          .maybeSingle();
        data = ultimoCerrado;
      }

      if (error || !data) return 0;

      if (data.estado === 'cerrada') {
        return (data as any).monto_cierre || (data.monto_inicial + data.total_ventas_efectivo + data.total_entradas - data.total_salidas);
      }
      return data.monto_inicial + data.total_ventas_efectivo + data.total_entradas - data.total_salidas;
    } catch (error) { return 0; }
  }

  async obtenerCuentasPorCobrar(): Promise<number> {
    try {
      const { data, error } = await this.supabaseService.client.from('cuentas_por_cobrar').select('monto_pendiente').eq('estado', 'pendiente');
      if (error) return 0;
      return data?.reduce((sum, cuenta) => sum + cuenta.monto_pendiente, 0) || 0;
    } catch (error) { return 0; }
  }

  async setPeriod(period: 'weekly' | 'monthly' | 'yearly') {
    this.selectedPeriod = period;
    this.cdr.detectChanges();
  }

  exportReport() {
    if (this.transactions.length === 0) return;
    const csv = this.transactions.map(t => `${t.id},${t.customer},${t.date},${t.total}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'reporte.csv'; a.click();
  }

  viewAllItems() { this.router.navigate(['/inventario']); }

  formatearMoneda(valor: number): string { return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(valor); }

  formatearFecha(fecha: string): string {
    const date = new Date(fecha);
    return new Intl.DateTimeFormat('es-DO', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  }

  formatearDia(fecha: string): string {
    const [year, month, day] = fecha.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return dias[date.getDay()];
  }

  obtenerIniciales(nombre: string): string { return nombre.split(' ').map(p => p[0]).join('').toUpperCase().substring(0, 2); }

  async generarReporte607() { Swal.fire('Reporte 607', 'Generando formato fiscal para ventas...', 'info'); }
  async generarReporte606() { Swal.fire('Reporte 606', 'Generando formato fiscal para compras...', 'info'); }
}
