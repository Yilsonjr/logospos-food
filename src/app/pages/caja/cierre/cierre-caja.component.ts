import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { CajaService } from '../../../services/caja.service';
import { Caja, ArqueoCaja, DENOMINACIONES } from '../../../models/caja.model';
import Swal from 'sweetalert2';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { TicketCierreComponent, DatosCierreTicket } from '../../../shared/ticket-cierre/ticket-cierre.component';

@Component({
  selector: 'app-cierre-caja',
  standalone: true,
  imports: [CommonModule, FormsModule, TicketCierreComponent],
  templateUrl: './cierre-caja.component.html',
  styleUrl: './cierre-caja.component.css'
})
export class CierreCajaComponent implements OnInit, OnDestroy {
  cajaActual: Caja | null = null;

  // Ventas del día
  ventasEfectivo: number = 0;
  ventasTarjeta: number = 0;

  // Movimientos
  totalEntradas: number = 0;
  totalSalidas: number = 0;

  // Arqueo
  denominaciones = DENOMINACIONES;
  arqueo: { [key: string]: number } = {
    billetes_2000: 0, billetes_1000: 0, billetes_500: 0,
    billetes_200: 0, billetes_100: 0, billetes_50: 0,
    monedas_25: 0, monedas_10: 0, monedas_5: 0, monedas_1: 0
  };

  // Totales
  totalBilletes: number = 0;
  totalMonedas: number = 0;
  totalContado: number = 0;
  montoEsperado: number = 0;
  diferencia: number = 0;

  // UI
  notasCierre: string = '';
  usuario: string = 'admin';
  mostrarConfirmacion: boolean = false;
  mostrarArqueo: boolean = false;
  Math = Math;

  // Ticket de Cierre
  mostrarTicket: boolean = false;
  datosCierreTicket: DatosCierreTicket | null = null;

  private subscriptions: Subscription[] = [];

  constructor(
    private cajaService: CajaService,
    public router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit() {
    console.log('🔄 Cierre Caja: Iniciando...');

    // Cargar datos inmediatamente
    await this.cargarDatosCaja();

    // Recargar cuando se navega al cierre
    const navSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(async (event: any) => {
      if (event.url.includes('/caja/cierre')) {
        console.log('🔄 Recargando cierre por navegación...');
        await this.cargarDatosCaja();
      }
    });

    this.subscriptions.push(navSub);
    console.log('✅ Cierre Caja: Inicialización completada');
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async cargarDatosCaja() {
    try {
      console.log('🔄 Cierre: Verificando caja abierta...');

      // Forzar verificación fresca de la base de datos (sin cache)
      const caja = await this.cajaService.verificarCajaAbierta(true);
      this.cajaActual = caja;

      // Forzar detección de cambios
      this.cdr.detectChanges();

      if (!this.cajaActual) {
        console.log('⚠️ No hay caja abierta');
        await Swal.fire({
          title: 'Sin Caja Abierta',
          text: 'No hay una caja abierta para cerrar',
          icon: 'warning',
          confirmButtonText: 'Aceptar'
        });
        this.router.navigate(['/caja/apertura']);
        return;
      }

      console.log('✅ Caja encontrada:', {
        id: this.cajaActual.id,
        monto_inicial: this.cajaActual.monto_inicial,
        fecha_apertura: this.cajaActual.fecha_apertura
      });

      // Cargar ventas del día
      const ventas = await this.cajaService.calcularVentasDelDia(this.cajaActual.id!);
      this.ventasEfectivo = ventas.efectivo;
      this.ventasTarjeta = ventas.tarjeta;
      console.log('💰 Ventas cargadas:', { efectivo: ventas.efectivo, tarjeta: ventas.tarjeta });

      // Cargar movimientos
      const movimientos = await this.cajaService.obtenerMovimientos(this.cajaActual.id!);
      this.totalEntradas = movimientos
        .filter(m => m.tipo === 'entrada')
        .reduce((sum, m) => sum + m.monto, 0);
      this.totalSalidas = movimientos
        .filter(m => m.tipo === 'salida')
        .reduce((sum, m) => sum + m.monto, 0);
      console.log('📊 Movimientos cargados:', { entradas: this.totalEntradas, salidas: this.totalSalidas });

      // Calcular monto esperado
      this.calcularMontoEsperado();

      // Forzar detección de cambios final
      this.cdr.detectChanges();

      console.log('✅ Datos de cierre cargados completamente');
    } catch (error) {
      console.error('❌ Error al cargar datos de cierre:', error);
      this.cajaActual = null;
      this.cdr.detectChanges();
    }
  }

  calcularMontoEsperado() {
    if (!this.cajaActual) return;
    this.montoEsperado = this.cajaActual.monto_inicial +
      this.ventasEfectivo +
      this.ventasTarjeta +
      this.totalEntradas -
      this.totalSalidas;
  }

  calcularArqueo() {
    this.totalBilletes =
      (this.arqueo['billetes_2000'] * 2000) +
      (this.arqueo['billetes_1000'] * 1000) +
      (this.arqueo['billetes_500'] * 500) +
      (this.arqueo['billetes_200'] * 200) +
      (this.arqueo['billetes_100'] * 100) +
      (this.arqueo['billetes_50'] * 50);

    this.totalMonedas =
      (this.arqueo['monedas_25'] * 25) +
      (this.arqueo['monedas_10'] * 10) +
      (this.arqueo['monedas_5'] * 5) +
      (this.arqueo['monedas_1'] * 1);

    this.totalContado = this.totalBilletes + this.totalMonedas;
    this.diferencia = this.totalContado - this.montoEsperado;

    // Forzar detección de cambios
    this.cdr.detectChanges();
  }

  calcularDiferencia() {
    this.diferencia = this.totalContado - this.montoEsperado;
  }

  verDetalleArqueo() {
    this.mostrarArqueo = true;
  }

  aplicarArqueo() {
    this.calcularArqueo();
    this.mostrarArqueo = false;
  }

  confirmarCierre() {
    if (this.diferencia !== 0 && !this.notasCierre) {
      Swal.fire({
        title: 'Notas Requeridas',
        text: 'Debes agregar notas explicando la discrepancia antes de cerrar la caja',
        icon: 'warning',
        confirmButtonText: 'Entendido'
      });
      return;
    }
    this.mostrarConfirmacion = true;
  }

  async cerrarCaja() {
    if (!this.cajaActual) return;

    try {
      const arqueoData: ArqueoCaja = {
        caja_id: this.cajaActual.id!,
        billetes_2000: this.arqueo['billetes_2000'],
        billetes_1000: this.arqueo['billetes_1000'],
        billetes_500: this.arqueo['billetes_500'],
        billetes_200: this.arqueo['billetes_200'],
        billetes_100: this.arqueo['billetes_100'],
        billetes_50: this.arqueo['billetes_50'],
        monedas_25: this.arqueo['monedas_25'],
        monedas_10: this.arqueo['monedas_10'],
        monedas_5: this.arqueo['monedas_5'],
        monedas_1: this.arqueo['monedas_1'],
        total_billetes: this.totalBilletes,
        total_monedas: this.totalMonedas,
        total_contado: this.totalContado,
        total_esperado: this.montoEsperado,
        diferencia: this.diferencia,
        notas: this.notasCierre || undefined
      };

      await this.cajaService.guardarArqueo(arqueoData);

      await this.cajaService.cerrarCaja(this.cajaActual.id!, {
        monto_final: this.totalContado,
        total_ventas_efectivo: this.ventasEfectivo,
        total_ventas_tarjeta: this.ventasTarjeta,
        total_entradas: this.totalEntradas,
        total_salidas: this.totalSalidas,
        monto_esperado: this.montoEsperado,
        monto_real: this.totalContado,
        diferencia: this.diferencia,
        usuario_cierre: this.usuario,
        notas_cierre: this.notasCierre || undefined
      });

      this.mostrarConfirmacion = false;

      // Mostrar mensaje de éxito primero
      await Swal.fire({
        title: '✅ Caja Cerrada',
        html: `Monto contado: ${this.formatearMoneda(this.totalContado)}<br>A continuación verás el ticket de cierre para imprimir.`,
        icon: 'success',
        confirmButtonText: 'Ver Ticket'
      });

      // Generar datos para el ticket DESPUÉS de cerrar el swal
      this.datosCierreTicket = {
        id: this.cajaActual.id!,
        usuario_apertura: this.cajaActual.usuario_apertura,
        usuario_cierre: this.usuario,
        fecha_apertura: this.cajaActual.fecha_apertura,
        fecha_cierre: new Date().toISOString(),
        monto_inicial: this.cajaActual.monto_inicial,
        ventas_efectivo: this.ventasEfectivo,
        ventas_tarjeta: this.ventasTarjeta,
        ventas_credito: 0,
        ventas_mixto: 0,
        total_entradas: this.totalEntradas,
        total_salidas: this.totalSalidas,
        monto_esperado: this.montoEsperado,
        monto_real: this.totalContado,
        diferencia: this.diferencia,
        notas: this.notasCierre || undefined,
        arqueo: {
          billetes_2000: this.arqueo['billetes_2000'],
          billetes_1000: this.arqueo['billetes_1000'],
          billetes_500: this.arqueo['billetes_500'],
          billetes_200: this.arqueo['billetes_200'],
          billetes_100: this.arqueo['billetes_100'],
          billetes_50: this.arqueo['billetes_50'],
          monedas_25: this.arqueo['monedas_25'],
          monedas_10: this.arqueo['monedas_10'],
          monedas_5: this.arqueo['monedas_5'],
          monedas_1: this.arqueo['monedas_1'],
          total_billetes: this.totalBilletes,
          total_monedas: this.totalMonedas
        }
      };

      // Mostrar el ticket
      this.mostrarTicket = true;
      this.cdr.detectChanges();

    } catch (error) {
      console.error('Error al cerrar caja:', error);
      await Swal.fire({
        title: 'Error',
        text: 'Error al cerrar la caja',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
    }
  }

  formatearMoneda(valor: number): string {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP'
    }).format(valor);
  }

  formatearFecha(fecha: string): string {
    return new Date(fecha).toLocaleString('es-DO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatearHora(fecha: string): string {
    return new Date(fecha).toLocaleTimeString('es-DO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  onTicketCerrado() {
    this.mostrarTicket = false;
    this.router.navigate(['/dashboard']);
  }
}
