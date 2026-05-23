import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { CuentaPorCobrar } from '../../models/cuentas-cobrar.model';
import { CuentasCobrarService } from '../../services/cuentas-cobrar.service';
import { ModalPagoComponent } from './modal-pago/modal-pago.component';
import { HistorialPagosComponent } from './historial-pagos/historial-pagos.component';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-cuentas-cobrar',
  imports: [CommonModule, FormsModule, RouterModule, ModalPagoComponent, HistorialPagosComponent],
  templateUrl: './cuentas-cobrar.component.html',
  styleUrl: './cuentas-cobrar.component.css'
})
export class CuentasCobrarComponent implements OnInit, OnDestroy {
  cuentas: CuentaPorCobrar[] = [];
  cuentasFiltradas: CuentaPorCobrar[] = [];
  filtroEstado: string = 'todas';
  busqueda: string = '';
  isLoading = true;
  vistaActual: 'tarjetas' | 'tabla' = 'tarjetas';
  isModalPagoOpen = false;
  isHistorialOpen = false;
  cuentaSeleccionada?: CuentaPorCobrar;
  cuentaIdHistorial?: number;
  menuAbiertoId: number | null = null;
  private cuentasSubscription?: Subscription;
  private subscriptions: Subscription[] = [];

  constructor(
    private cuentasService: CuentasCobrarService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) { }

  ngOnInit() {
    console.log('🔄 Cuentas por Cobrar: Iniciando componente...');

    // Suscribirse al observable de cuentas
    const cuentasSub = this.cuentasService.cuentas$.subscribe(cuentas => {
      console.log('💰 Cuentas recibidas:', cuentas.length);
      this.cuentas = cuentas;
      this.aplicarFiltros();
      this.isLoading = false;
      this.cdr.detectChanges();
    });
    this.subscriptions.push(cuentasSub);

    // Escuchar cambios de navegación para recargar si es necesario
    const navSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        if (this.router.url === '/cuentas-cobrar') {
          this.cargarCuentas();
        }
      });
    this.subscriptions.push(navSub);

    // Primera carga
    this.cargarCuentas();
  }

  ngOnDestroy() {
    if (this.cuentasSubscription) {
      this.cuentasSubscription.unsubscribe();
    }
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async cargarCuentas() {
    if (this.isLoading && this.cuentas.length > 0) return; // Evitar si ya está cargando

    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      console.log('📦 CuentasCobrar: Cargando desde el servicio...');
      await this.cuentasService.cargarCuentas();
      console.log('📦 CuentasCobrar: Datos cargados');
    } catch (error) {
      console.error('📦 CuentasCobrar: Error al cargar:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();

      // Delay de seguridad para sincronizar UI
      setTimeout(() => this.cdr.detectChanges(), 100);
    }
  }

  aplicarFiltros() {
    let resultado = this.cuentas;

    // Filtrar por estado
    if (this.filtroEstado !== 'todas') {
      resultado = resultado.filter(c => c.estado === this.filtroEstado);
    }

    // Filtrar por búsqueda
    if (this.busqueda.trim()) {
      const busquedaLower = this.busqueda.toLowerCase();
      resultado = resultado.filter(c =>
        c.cliente_nombre?.toLowerCase().includes(busquedaLower) ||
        c.id?.toString().includes(busquedaLower)
      );
    }

    this.cuentasFiltradas = resultado;
    this.menuAbiertoId = null; // Cerrar menús al filtrar
  }

  // ==================== UI ACTIONS ====================

  toggleMenu(event: Event, id: number) {
    event.stopPropagation();
    if (this.menuAbiertoId === id) {
      this.menuAbiertoId = null;
    } else {
      this.menuAbiertoId = id;
    }
  }

  @HostListener('document:click')
  cerrarMenus() {
    this.menuAbiertoId = null;
  }

  onBusquedaChange() {
    this.aplicarFiltros();
  }

  cambiarFiltro(estado: string) {
    this.filtroEstado = estado;
    this.aplicarFiltros();
  }

  abrirModalPago(cuenta: CuentaPorCobrar) {
    this.cuentaSeleccionada = cuenta;
    this.isModalPagoOpen = true;
  }

  cerrarModalPago() {
    this.isModalPagoOpen = false;
    this.cuentaSeleccionada = undefined;
  }

  abrirHistorial(cuenta: CuentaPorCobrar) {
    this.cuentaIdHistorial = cuenta.id;
    this.isHistorialOpen = true;
  }

  cerrarHistorial() {
    this.isHistorialOpen = false;
    this.cuentaIdHistorial = undefined;
  }

  onPagoRegistrado() {
    console.log('✅ Pago registrado');
    this.cerrarModalPago();
  }

  get totalPendiente(): number {
    return this.cuentas
      .filter(c => c.estado !== 'pagada')
      .reduce((sum, c) => sum + c.monto_pendiente, 0);
  }

  get totalVencido(): number {
    return this.cuentas
      .filter(c => c.estado === 'vencida')
      .reduce((sum, c) => sum + c.monto_pendiente, 0);
  }

  get cuentasVencidas(): number {
    return this.cuentas.filter(c => c.estado === 'vencida').length;
  }

  get cuentasPendientes(): number {
    return this.cuentas.filter(c => c.estado === 'pendiente' || c.estado === 'parcial').length;
  }

  getEstadoBadgeClass(estado: string): string {
    const base = 'badge rounded-pill ';
    switch (estado) {
      case 'pagada': return base + 'bg-success-subtle text-success border border-success-subtle';
      case 'pendiente': return base + 'bg-warning-subtle text-warning-emphasis border border-warning-subtle';
      case 'parcial': return base + 'bg-info-subtle text-info-emphasis border border-info-subtle';
      case 'vencida': return base + 'bg-danger-subtle text-danger border border-danger-subtle';
      default: return base + 'bg-secondary-subtle text-secondary border border-secondary-subtle';
    }
  }

  formatearFecha(fecha: string | null | undefined): string {
    if (!fecha) return '—';
    return new Date(fecha).toLocaleDateString('es-DO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  diasVencimiento(fechaVencimiento: string | null | undefined): number {
    if (!fechaVencimiento) return 0;
    const hoy = new Date();
    const vencimiento = new Date(fechaVencimiento);
    const diff = vencimiento.getTime() - hoy.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  exportarDatos() {
    if (this.cuentasFiltradas.length === 0) {
      alert('No hay cuentas para exportar');
      return;
    }

    const datosExportar = this.cuentasFiltradas.map(cuenta => ({
      Cliente: cuenta.cliente_nombre || '',
      'Monto Total': cuenta.monto_total,
      'Monto Pagado': cuenta.monto_pagado,
      'Monto Pendiente': cuenta.monto_pendiente,
      'Fecha Venta': cuenta.fecha_venta,
      'Fecha Vencimiento': cuenta.fecha_vencimiento,
      Estado: cuenta.estado
    }));

    const headers = Object.keys(datosExportar[0]).join(',');
    const csvContent = datosExportar.map(row =>
      Object.values(row).map(val => `"${val}"`).join(',')
    ).join('\n');

    const csv = headers + '\n' + csvContent;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `cuentas_cobrar_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
