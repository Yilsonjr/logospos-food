import { Component, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RestaurantTablesService } from '../../../services/restaurant-tables.service';
import { OfflineService } from '../../../services/offline.service';
import {
  TableWithOrder, RestaurantZone,
  COLOR_ESTADO_MESA, LABEL_ESTADO_MESA, EstadoMesa
} from '../../../models/restaurant.models';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-floor-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './floor-map.component.html',
  styleUrl: './floor-map.component.css'
})
export class FloorMapComponent implements OnInit, OnDestroy {

  @Output() mesaSeleccionada = new EventEmitter<TableWithOrder>();

  mesas: TableWithOrder[] = [];
  mesasFiltradas: TableWithOrder[] = [];
  zonas: RestaurantZone[] = [];
  zonaSeleccionadaId = '';

  cargando = true;
  errorMsg = '';

  // Panel contextual
  mesaPanel: TableWithOrder | null = null;

  readonly colorEstado = COLOR_ESTADO_MESA;
  readonly labelEstado = LABEL_ESTADO_MESA;
  readonly estadosLeyenda: EstadoMesa[] = ['libre', 'ocupada', 'reservada', 'limpieza', 'bloqueada'];

  modoOffline = false;

  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private readonly POLLING_MS = 8_000;

  constructor(
    private tablesService: RestaurantTablesService,
    private offlineService: OfflineService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.cargarDatos();
    if (this.offlineService.isOnline) {
      this.tablesService.suscribirCambios(() => this.actualizarSilencioso());
      // Polling de respaldo por si Realtime no está habilitado en el proyecto
      this.pollingInterval = setInterval(() => this.actualizarSilencioso(), this.POLLING_MS);
    }
  }

  ngOnDestroy(): void {
    this.tablesService.desuscribir();
    if (this.pollingInterval) clearInterval(this.pollingInterval);
  }

  /** Recarga datos sin mostrar el spinner de carga completo */
  private async actualizarSilencioso(): Promise<void> {
    try {
      const [zonas, mesas] = await Promise.all([
        this.tablesService.cargarZonas(),
        this.tablesService.cargarMesasConOrden()
      ]);
      this.zonas = zonas;
      this.mesas = mesas;
      this.filtrarPorZona();
      this.cdr.detectChanges();
    } catch { /* ignorar errores silenciosos */ }
  }

  async cargarDatos(): Promise<void> {
    try {
      this.cargando = true;
      this.errorMsg = '';

      if (!this.offlineService.isOnline) {
        // Modo offline: cargar mesas desde caché local
        this.modoOffline = true;
        const negocioId = localStorage.getItem('logos_negocio_id') || '';
        const mesasLocal = await this.offlineService.obtenerMesasLocales(negocioId);
        if (mesasLocal.length) {
          this.mesas = mesasLocal as any[];
          // Reconstruir zonas únicas desde las mesas cacheadas
          const zonasMap = new Map<string, any>();
          mesasLocal.forEach(m => {
            if (m.zona && !zonasMap.has((m.zona as any).id)) {
              zonasMap.set((m.zona as any).id, m.zona);
            }
          });
          this.zonas = Array.from(zonasMap.values());
        } else {
          this.errorMsg = 'Sin conexión y sin datos en caché. Conéctate al menos una vez.';
        }
        this.filtrarPorZona();
        return;
      }

      this.modoOffline = false;
      [this.zonas, this.mesas] = await Promise.all([
        this.tablesService.cargarZonas(),
        this.tablesService.cargarMesasConOrden()
      ]);

      // Cachear mesas para uso offline futuro
      const negocioId = localStorage.getItem('logos_negocio_id') || '';
      this.offlineService.cachearMesas(negocioId, this.mesas as any).catch(() => {});

      this.filtrarPorZona();
    } catch (e: any) {
      this.errorMsg = e.message || 'Error al cargar mesas';
      console.error('[FloorMap]', e);
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  filtrarPorZona(): void {
    this.mesasFiltradas = this.zonaSeleccionadaId
      ? this.mesas.filter(m => m.zona_id === this.zonaSeleccionadaId)
      : this.mesas;
  }

  onZonaChange(zonaId: string): void {
    this.zonaSeleccionadaId = zonaId;
    this.filtrarPorZona();
  }

  seleccionarMesa(mesa: TableWithOrder): void {
    this.mesaPanel = mesa;
  }

  cerrarPanel(): void {
    this.mesaPanel = null;
  }

  abrirOrden(): void {
    if (!this.mesaPanel) return;
    const mesa = this.mesaPanel;
    this.cerrarPanel();
    this.mesaSeleccionada.emit(mesa);
  }

  async bloquearMesa(): Promise<void> {
    if (!this.mesaPanel) return;
    const mesa = this.mesaPanel;
    this.cerrarPanel();
    await this.cambiarEstado(mesa, 'bloqueada');
  }

  async liberarBloqueo(): Promise<void> {
    if (!this.mesaPanel) return;
    const mesa = this.mesaPanel;
    this.cerrarPanel();
    await this.cambiarEstado(mesa, 'libre');
  }

  async enviarLimpieza(): Promise<void> {
    if (!this.mesaPanel) return;
    const mesa = this.mesaPanel;
    this.cerrarPanel();
    await this.cambiarEstado(mesa, 'limpieza');
  }

  async marcarListaPanel(): Promise<void> {
    if (!this.mesaPanel) return;
    const mesa = this.mesaPanel;
    this.cerrarPanel();
    await this.cambiarEstado(mesa, 'libre');
  }

  async abrirReservaPanel(): Promise<void> {
    if (!this.mesaPanel) return;
    const mesa = this.mesaPanel;
    this.cerrarPanel();
    const fakeEvent = new Event('click');
    await this.abrirReserva(mesa, fakeEvent);
  }

  async cancelarReservaPanel(): Promise<void> {
    if (!this.mesaPanel) return;
    const mesa = this.mesaPanel;
    this.cerrarPanel();
    const fakeEvent = new Event('click');
    await this.cancelarReserva(mesa, fakeEvent);
  }

  async cambiarEstado(mesa: TableWithOrder, nuevoEstado: EstadoMesa): Promise<void> {
    try {
      await this.tablesService.actualizarEstadoMesa(mesa.id, nuevoEstado);
      mesa.estado = nuevoEstado;
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    }
  }

  async liberarMesa(mesa: TableWithOrder): Promise<void> {
    const { isConfirmed } = await Swal.fire({
      title: `¿Liberar Mesa ${mesa.numero_mesa}?`,
      text: 'Esta acción marcará la mesa como libre.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, liberar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#28a745'
    });
    if (isConfirmed) await this.cambiarEstado(mesa, 'libre');
  }

  async abrirReserva(mesa: TableWithOrder, event: Event): Promise<void> {
    event.stopPropagation();

    // Hora por defecto: próxima hora redonda
    const ahora = new Date();
    ahora.setHours(ahora.getHours() + 1, 0, 0, 0);
    const horaDefault = ahora.toTimeString().slice(0, 5);

    const { value: datos, isConfirmed } = await Swal.fire({
      title: `Reservar Mesa ${mesa.numero_mesa}`,
      html: `
        <div style="text-align:left">
          <label style="font-size:.85rem;font-weight:600;color:#374151;display:block;margin-bottom:4px">
            Nombre del cliente *
          </label>
          <input id="res-nombre" class="swal2-input" style="margin:0 0 12px 0;width:100%"
            placeholder="Ej: Juan Martínez" value="${mesa.reserva_nombre || ''}">

          <div style="display:flex;gap:12px;margin-bottom:12px">
            <div style="flex:1">
              <label style="font-size:.85rem;font-weight:600;color:#374151;display:block;margin-bottom:4px">
                Hora de llegada *
              </label>
              <input id="res-hora" type="time" class="swal2-input" style="margin:0;width:100%"
                value="${mesa.reserva_hora || horaDefault}">
            </div>
            <div style="flex:1">
              <label style="font-size:.85rem;font-weight:600;color:#374151;display:block;margin-bottom:4px">
                Personas
              </label>
              <input id="res-personas" type="number" class="swal2-input" style="margin:0;width:100%"
                min="1" max="50" placeholder="2" value="${mesa.reserva_personas || ''}">
            </div>
          </div>

          <label style="font-size:.85rem;font-weight:600;color:#374151;display:block;margin-bottom:4px">
            Notas (opcional)
          </label>
          <textarea id="res-notas" class="swal2-textarea" style="margin:0;width:100%;height:70px"
            placeholder="Cumpleaños, alergias, mesa preferida…">${mesa.reserva_notas || ''}</textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: '<i class="bi bi-calendar-check me-1"></i>Reservar',
      confirmButtonColor: '#f59e0b',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      didOpen: () => {
        (document.getElementById('res-nombre') as HTMLInputElement).focus();
      },
      preConfirm: () => {
        const nombre   = (document.getElementById('res-nombre') as HTMLInputElement).value.trim();
        const hora     = (document.getElementById('res-hora') as HTMLInputElement).value;
        const personas = (document.getElementById('res-personas') as HTMLInputElement).value;
        const notas    = (document.getElementById('res-notas') as HTMLTextAreaElement).value.trim();
        if (!nombre) { Swal.showValidationMessage('El nombre del cliente es requerido'); return false; }
        if (!hora)   { Swal.showValidationMessage('La hora de llegada es requerida'); return false; }
        return { nombre, hora, personas: personas ? +personas : null, notas: notas || null };
      }
    });

    if (!isConfirmed || !datos) return;

    try {
      await this.tablesService.reservarMesa(mesa.id, {
        reserva_nombre:   datos.nombre,
        reserva_hora:     datos.hora,
        reserva_personas: datos.personas,
        reserva_notas:    datos.notas
      });
      mesa.estado          = 'reservada';
      mesa.reserva_nombre  = datos.nombre;
      mesa.reserva_hora    = datos.hora;
      mesa.reserva_personas = datos.personas;
      mesa.reserva_notas   = datos.notas;
      this.cdr.detectChanges();
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    }
  }

  async cancelarReserva(mesa: TableWithOrder, event: Event): Promise<void> {
    event.stopPropagation();
    const { isConfirmed } = await Swal.fire({
      title: `¿Cancelar reserva de ${mesa.reserva_nombre}?`,
      text: 'La mesa volverá a estado Libre.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar reserva',
      cancelButtonText: 'No',
      confirmButtonColor: '#ef4444'
    });
    if (!isConfirmed) return;

    try {
      await this.tablesService.cancelarReserva(mesa.id);
      mesa.estado           = 'libre';
      mesa.reserva_nombre   = null;
      mesa.reserva_hora     = null;
      mesa.reserva_personas = null;
      mesa.reserva_notas    = null;
      this.cdr.detectChanges();
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    }
  }

  // Métricas rápidas
  get totalMesas(): number { return this.mesas.length; }
  get mesasLibres(): number { return this.mesas.filter(m => m.estado === 'libre').length; }
  get mesasOcupadas(): number { return this.mesas.filter(m => m.estado === 'ocupada').length; }
  get ocupacionPct(): number {
    if (!this.mesas.length) return 0;
    return Math.round((this.mesasOcupadas / this.mesas.length) * 100);
  }

  trackByMesa(_: number, m: TableWithOrder): string { return m.id; }
  trackByZona(_: number, z: RestaurantZone): string { return z.id; }
}
