import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  RestaurantReportsService,
  PeriodoReporte, FiltroFecha,
  ResumenVentas, VentaPorDia, TopPlato,
  PagoPorMetodo, MargenPlato, ResumenInventario,
  GananciasResumen
} from '../../../services/restaurant-reports.service';

interface RendimientoCocina {
  tiempoPromedioMinutos: number;
  ordenesAtendidas: number;
  ordenesExcedidas: number;
}

@Component({
  selector: 'app-reportes-restaurante',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reportes-restaurante.component.html',
  styleUrl: './reportes-restaurante.component.css'
})
export class ReportesRestauranteComponent implements OnInit {

  periodo: PeriodoReporte = 'hoy';
  fechaDesde = '';
  fechaHasta = '';
  tabActiva: 'ventas' | 'platos' | 'pagos' | 'ganancias' | 'margenes' | 'inventario' | 'cocina' = 'ventas';
  cargando = false;

  // Datos
  resumen: ResumenVentas | null = null;
  ventasPorDia: VentaPorDia[] = [];
  topPlatos: TopPlato[] = [];
  pagosPorMetodo: PagoPorMetodo[] = [];
  margenes: MargenPlato[] = [];
  inventario: ResumenInventario | null = null;
  cocina: RendimientoCocina | null = null;
  ganancias: GananciasResumen | null = null;

  readonly periodos: { value: PeriodoReporte; label: string }[] = [
    { value: 'hoy',         label: 'Hoy' },
    { value: 'semana',      label: 'Esta semana' },
    { value: 'mes',         label: 'Este mes' },
    { value: 'personalizado', label: 'Personalizado' }
  ];

  readonly coloresPago: Record<string, string> = {
    efectivo:      '#22c55e',
    tarjeta:       '#3b82f6',
    transferencia: '#a855f7',
    cheque:        '#f59e0b',
    mixto:         '#64748b'
  };

  readonly labelPago: Record<string, string> = {
    efectivo:      'Efectivo',
    tarjeta:       'Tarjeta',
    transferencia: 'Transferencia',
    cheque:        'Cheque',
    mixto:         'Mixto'
  };

  constructor(
    private reportsService: RestaurantReportsService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Inicializar fechas personalizadas con hoy
    const hoy = new Date().toISOString().split('T')[0];
    this.fechaDesde = hoy;
    this.fechaHasta = hoy;
    this.cargarTodo();
  }

  regresar(): void {
    this.router.navigate(['/restaurante']);
  }

  async cambiarPeriodo(p: PeriodoReporte): Promise<void> {
    this.periodo = p;
    if (p !== 'personalizado') await this.cargarTodo();
  }

  async aplicarFechas(): Promise<void> {
    if (!this.fechaDesde || !this.fechaHasta) return;
    await this.cargarTodo();
  }

  get filtro(): FiltroFecha {
    return this.reportsService.filtroParaPeriodo(
      this.periodo,
      { desde: this.fechaDesde, hasta: this.fechaHasta }
    );
  }

  async cargarTodo(): Promise<void> {
    this.cargando = true;
    this.cdr.detectChanges();
    try {
      const f = this.filtro;
      const [resumen, dias, top, pagos, cocina, ganancias] = await Promise.all([
        this.reportsService.cargarResumenVentas(f),
        this.reportsService.cargarVentasPorDia(f),
        this.reportsService.cargarTopPlatos(f),
        this.reportsService.cargarPagosPorMetodo(f),
        this.reportsService.cargarRendimientoCocina(f),
        this.reportsService.cargarGanancias(f)
      ]);
      this.resumen        = resumen;
      this.ventasPorDia   = dias;
      this.topPlatos      = top;
      this.pagosPorMetodo = pagos;
      this.cocina         = cocina;
      this.ganancias      = ganancias;

      // Márgenes e inventario
      await this.cargarMargenes();
      await this.cargarInventario();
    } catch (e: any) {
      console.error('[Reportes]', e.message);
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  async cargarMargenes(): Promise<void> {
    this.margenes = await this.reportsService.cargarMargenesPorPlato();
  }

  async cargarInventario(): Promise<void> {
    this.inventario = await this.reportsService.cargarResumenInventario();
  }

  // ============================================================
  // HELPERS PARA GRÁFICOS CSS
  // ============================================================

  get maxVentaDia(): number {
    return Math.max(...this.ventasPorDia.map(d => d.total), 1);
  }

  barWidth(valor: number, maximo: number): string {
    return `${Math.round((valor / maximo) * 100)}%`;
  }

  get maxTopPlato(): number {
    return Math.max(...this.topPlatos.map(p => p.cantidad), 1);
  }

  colorMargen(pct: number): string {
    if (pct >= 60) return 'text-success';
    if (pct >= 35) return 'text-warning';
    return 'text-danger';
  }

  badgeMargen(pct: number): string {
    if (pct >= 60) return 'badge-margen-alto';
    if (pct >= 35) return 'badge-margen-medio';
    return 'badge-margen-bajo';
  }

  conicGradient(): string {
    if (!this.pagosPorMetodo.length) return 'conic-gradient(#e2e8f0 0% 100%)';
    let acum = 0;
    const partes = this.pagosPorMetodo.map(p => {
      const desde = acum;
      acum += p.porcentaje;
      const color = this.coloresPago[p.forma_pago] || '#94a3b8';
      return `${color} ${desde}% ${acum}%`;
    });
    return `conic-gradient(${partes.join(', ')})`;
  }

  formatMoneda(valor: number): string {
    return `RD$ ${valor.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  trackByFecha(_: number, d: VentaPorDia): string { return d.fecha; }
  trackByPlato(_: number, p: TopPlato): string { return p.menu_item_id; }
  trackByPago(_: number, p: PagoPorMetodo): string { return p.forma_pago; }
  trackByMargen(_: number, m: MargenPlato): string { return m.menu_item_id; }
  trackByGanancia(_: number, g: any): string { return g.menu_item_id; }

  colorGanancia(pct: number): string {
    if (pct >= 60) return 'text-success';
    if (pct >= 35) return 'text-warning';
    return 'text-danger';
  }

  badgeGanancia(pct: number): string {
    if (pct >= 60) return 'badge-margen-alto';
    if (pct >= 35) return 'badge-margen-medio';
    return 'badge-margen-bajo';
  }
}
