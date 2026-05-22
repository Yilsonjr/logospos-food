import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FloorMapComponent } from './floor-map/floor-map.component';
import { OrderModalComponent } from './order-modal/order-modal.component';
import { BillSplitComponent } from './bill-split/bill-split.component';
import { RestaurantTablesService } from '../../services/restaurant-tables.service';
import { RestaurantOrdersService } from '../../services/restaurant-orders.service';
import { AuthService } from '../../services/auth.service';
import { TableWithOrder, TipoOrden, RestaurantOrder } from '../../models/restaurant.models';

@Component({
  selector: 'app-restaurante',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, FloorMapComponent, OrderModalComponent, BillSplitComponent],
  styles: [`
    .rest-header {
      background: #fff; border-radius: 16px; padding: 1rem 1.5rem;
      border: 1px solid #f0f0f0; box-shadow: 0 1px 6px rgba(0,0,0,.05);
    }
    .rest-title { font-size: 1.25rem; font-weight: 800; color: #111827; margin: 0; }
    .rest-subtitle { font-size: 0.75rem; color: #9ca3af; margin: 0; }
    .btn-kds {
      background: linear-gradient(135deg, #1e1e2d 0%, #374151 100%);
      color: #fff; border: none; border-radius: 10px; padding: .55rem 1.1rem;
      font-size: .83rem; font-weight: 700; display: flex; align-items: center;
      gap: 6px; text-decoration: none; transition: box-shadow .2s, transform .2s;
      box-shadow: 0 3px 10px rgba(0,0,0,.18);
    }
    .btn-kds:hover { color: #fff; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,.22); }
    .btn-kds .kds-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #22c55e;
      animation: kds-pulse 2s ease-in-out infinite;
    }
    @keyframes kds-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.5); }
      50% { box-shadow: 0 0 0 4px rgba(34,197,94,0); }
    }
    /* ── Tabs ── */
    .rest-tabs {
      display: flex; gap: 4px; background: #f3f4f6; padding: 4px;
      border-radius: 12px; width: fit-content;
    }
    .rest-tab {
      padding: .5rem 1.2rem; border: none; background: transparent;
      border-radius: 9px; font-size: .83rem; font-weight: 600;
      color: #6b7280; cursor: pointer; transition: all .15s; display: flex;
      align-items: center; gap: 6px; white-space: nowrap;
    }
    .rest-tab.active { background: #fff; color: #111827; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
    .rest-tab .tab-badge {
      background: #ef4444; color: #fff; border-radius: 10px;
      font-size: .65rem; padding: 1px 5px; min-width: 18px; text-align: center;
    }
    /* ── Section card ── */
    .section-card {
      background: #fff; border-radius: 16px; padding: 1.25rem 1.5rem;
      border: 1px solid #f0f0f0; box-shadow: 0 1px 6px rgba(0,0,0,.04);
    }
    .section-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 1.25rem;
    }
    .section-title-text { font-size: 1rem; font-weight: 700; color: #111827; margin: 0; }
    /* ── Order queue grid ── */
    .orden-queue-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px;
    }
    .orden-queue-card {
      background: #f9fafb; border: 1.5px solid #e5e7eb; border-radius: 12px;
      padding: 14px; cursor: pointer; transition: all .15s;
    }
    .orden-queue-card:hover {
      border-color: #6366f1; background: #fff;
      box-shadow: 0 4px 14px rgba(99,102,241,.15); transform: translateY(-1px);
    }
    .oq-numero { font-size: 1.05rem; font-weight: 800; color: #111827; }
    .oq-sub { font-size: .78rem; color: #6b7280; margin-top: 3px; }
    .oq-total { font-size: .95rem; font-weight: 700; color: #059669; }
    .oq-actions { margin-top: 10px; display: flex; justify-content: flex-end; }
    /* ── Form llevar ── */
    .form-llevar {
      background: #fff; border: 2px solid #6366f1; border-radius: 16px;
      padding: 1.25rem 1.5rem; margin-bottom: 1.5rem;
    }
    .form-llevar-title { font-size: .95rem; font-weight: 700; color: #4f46e5; margin-bottom: 1rem; }
    .tipo-toggle { display: flex; border-radius: 10px; overflow: hidden; border: 1.5px solid #e5e7eb; }
    .tipo-toggle-btn {
      flex: 1; padding: .45rem .75rem; border: none; background: #f9fafb;
      font-size: .82rem; font-weight: 600; color: #6b7280; cursor: pointer;
      transition: all .15s; display: flex; align-items: center; justify-content: center; gap: 5px;
    }
    .tipo-toggle-btn.active-llevar { background: #fef3c7; color: #92400e; }
    .tipo-toggle-btn.active-delivery { background: #e0f2fe; color: #0369a1; }
    /* ── Empty state ── */
    .empty-queue {
      text-align: center; padding: 3rem 1rem; color: #9ca3af;
    }
    .empty-queue i { font-size: 2.5rem; display: block; margin-bottom: .75rem; opacity: .4; }
  `],
  template: `
    <div class="container-fluid py-3">

      <!-- Page header -->
      <div class="rest-header d-flex align-items-center justify-content-between mb-4">
        <div class="d-flex align-items-center gap-3">
          <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#4f46e5);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="bi bi-grid-3x3-gap-fill text-white fs-5"></i>
          </div>
          <div>
            <p class="rest-title">Módulo Restaurante</p>
            <p class="rest-subtitle">Gestión de mesas, barra y pedidos</p>
          </div>
        </div>
        <div class="d-flex gap-2">
          @if (tienePermiso('restaurante.reportes')) {
            <a routerLink="/restaurante/reportes" class="btn-kds" style="background:linear-gradient(135deg,#4f46e5,#6366f1)">
              <i class="bi bi-bar-chart-fill"></i> Reportes
            </a>
          }
          @if (tienePermiso('restaurante.admin')) {
            <a routerLink="/restaurante/admin" class="btn-kds" style="background:linear-gradient(135deg,#374151,#1f2937)">
              <i class="bi bi-gear-fill"></i> Configurar
            </a>
          }
          @if (tienePermiso('restaurante.cocina')) {
            <a routerLink="/restaurante/cocina" class="btn-kds">
              <span class="kds-dot"></span>
              <i class="bi bi-fire"></i> Pantalla Cocina
            </a>
          }
        </div>
      </div>

      <!-- Tabs -->
      <div class="d-flex align-items-center gap-3 mb-4">
        <div class="rest-tabs">
          <button class="rest-tab" [class.active]="tabActiva === 'mesa'" (click)="cambiarTab('mesa')">
            <i class="bi bi-grid-3x3-gap"></i> Mesas
          </button>
          <button class="rest-tab" [class.active]="tabActiva === 'barra'" (click)="cambiarTab('barra')">
            <i class="bi bi-lightning-fill"></i> Venta Rápida
            @if (ordenesBarra.length > 0) {
              <span class="tab-badge">{{ ordenesBarra.length }}</span>
            }
          </button>
          <button class="rest-tab" [class.active]="tabActiva === 'llevar'" (click)="cambiarTab('llevar')">
            <i class="bi bi-bag-fill"></i> Para Llevar / Delivery
            @if (ordenesLlevar.length > 0) {
              <span class="tab-badge">{{ ordenesLlevar.length }}</span>
            }
          </button>
        </div>
      </div>

      <!-- ═══ TAB: MESAS ═══ -->
      @if (tabActiva === 'mesa') {
        <app-floor-map (mesaSeleccionada)="abrirOrden($event)"></app-floor-map>
      }

      <!-- ═══ TAB: VENTA RÁPIDA / BARRA ═══ -->
      @if (tabActiva === 'barra') {
        <div class="section-card">
          <div class="section-header">
            <div>
              <p class="section-title-text">
                <i class="bi bi-lightning-fill text-warning me-2"></i>Venta Rápida
              </p>
              <small class="text-muted">Clientes en mostrador — sin asignación de mesa</small>
            </div>
            <button class="btn btn-primary fw-semibold" (click)="nuevaVentaRapida()">
              <i class="bi bi-plus-lg me-1"></i>Nueva Venta
            </button>
          </div>

          @if (cargandoBarra) {
            <div class="text-center py-4"><span class="spinner-border text-primary"></span></div>
          } @else if (ordenesBarra.length === 0) {
            <div class="empty-queue">
              <i class="bi bi-lightning"></i>
              <p class="fw-semibold">Sin ventas activas en barra</p>
              <p class="small">Haz clic en <strong>Nueva Venta</strong> para comenzar</p>
            </div>
          } @else {
            <div class="orden-queue-grid">
              @for (orden of ordenesBarra; track orden.id) {
                <div class="orden-queue-card" (click)="abrirOrdenBarra(orden)">
                  <div class="d-flex justify-content-between align-items-start mb-1">
                    <span class="oq-numero">
                      @if (orden.numero_pedido_dia) { Pedido #{{ orden.numero_pedido_dia }} }
                      @else { #{{ orden.id.slice(-6).toUpperCase() }} }
                    </span>
                    <span class="badge bg-{{ getEstadoColor(orden.estado) }}">{{ orden.estado }}</span>
                  </div>
                  <div class="oq-sub">{{ getItemsCount(orden) }} item(s)</div>
                  <div class="d-flex justify-content-between align-items-center mt-2">
                    <span class="oq-total">RD$ {{ orden.total | number:'1.2-2' }}</span>
                    <span class="small text-muted">{{ orden.created_at | date:'HH:mm' }}</span>
                  </div>
                  <div class="oq-actions">
                    <button class="btn btn-sm btn-outline-primary" (click)="$event.stopPropagation(); abrirOrdenBarra(orden)">
                      <i class="bi bi-pencil-square me-1"></i>Gestionar
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- ═══ TAB: PARA LLEVAR / DELIVERY ═══ -->
      @if (tabActiva === 'llevar') {
        <div class="section-card">
          <div class="section-header">
            <div>
              <p class="section-title-text">
                <i class="bi bi-bag-fill text-success me-2"></i>Para Llevar / Delivery
              </p>
              <small class="text-muted">Cola de pedidos activos</small>
            </div>
            <button class="btn btn-success fw-semibold" (click)="abrirFormLlevar()">
              <i class="bi bi-plus-lg me-1"></i>Nuevo Pedido
            </button>
          </div>

          <!-- Formulario nuevo pedido -->
          @if (mostrarFormLlevar) {
            <div class="form-llevar">
              <p class="form-llevar-title"><i class="bi bi-bag me-2"></i>Nuevo Pedido</p>
              <div class="row g-3">
                <div class="col-12">
                  <label class="form-label small fw-semibold text-muted">Tipo de pedido</label>
                  <div class="tipo-toggle">
                    <button class="tipo-toggle-btn" [class.active-llevar]="formTipo === 'llevar'" (click)="formTipo = 'llevar'">
                      <i class="bi bi-bag"></i> Para Llevar
                    </button>
                    <button class="tipo-toggle-btn" [class.active-delivery]="formTipo === 'delivery'" (click)="formTipo = 'delivery'">
                      <i class="bi bi-bicycle"></i> Delivery
                    </button>
                  </div>
                </div>
                <div class="col-md-6">
                  <label class="form-label small fw-semibold text-muted">Nombre del cliente *</label>
                  <input type="text" class="form-control" [(ngModel)]="formNombre" placeholder="Ej: Juan Martínez" autofocus>
                </div>
                <div class="col-md-6">
                  <label class="form-label small fw-semibold text-muted">Teléfono</label>
                  <input type="tel" class="form-control" [(ngModel)]="formTelefono" placeholder="Ej: 809-000-0000">
                </div>
                @if (formTipo === 'delivery') {
                  <div class="col-12">
                    <label class="form-label small fw-semibold text-muted">Dirección de entrega</label>
                    <textarea class="form-control" rows="2" [(ngModel)]="formDireccion" placeholder="Calle, número, sector, referencia…"></textarea>
                  </div>
                }
              </div>
              <div class="d-flex justify-content-end gap-2 mt-3">
                <button class="btn btn-outline-secondary btn-sm" (click)="cerrarFormLlevar()">Cancelar</button>
                <button class="btn btn-primary btn-sm fw-semibold" [disabled]="!formNombre.trim() || (formTipo === 'delivery' && !formDireccion.trim())" (click)="confirmarFormLlevar()">
                  <i class="bi bi-arrow-right me-1"></i>Abrir Orden
                </button>
              </div>
            </div>
          }

          @if (cargandoLlevar) {
            <div class="text-center py-4"><span class="spinner-border text-success"></span></div>
          } @else if (ordenesLlevar.length === 0 && !mostrarFormLlevar) {
            <div class="empty-queue">
              <i class="bi bi-bag"></i>
              <p class="fw-semibold">Sin pedidos activos</p>
              <p class="small">Haz clic en <strong>Nuevo Pedido</strong> para registrar uno</p>
            </div>
          } @else {
            <div class="orden-queue-grid">
              @for (orden of ordenesLlevar; track orden.id) {
                <div class="orden-queue-card" (click)="abrirOrdenLlevar(orden)">
                  <div class="d-flex justify-content-between align-items-start mb-1">
                    <span class="badge text-dark" [class.bg-warning]="orden.tipo_orden === 'llevar'" [class.bg-info]="orden.tipo_orden === 'delivery'">
                      @if (orden.tipo_orden === 'delivery') { <i class="bi bi-bicycle me-1"></i>Delivery }
                      @else { <i class="bi bi-bag me-1"></i>Para Llevar }
                    </span>
                    <span class="badge bg-{{ getEstadoColor(orden.estado) }}">{{ orden.estado }}</span>
                  </div>
                  <div class="oq-numero mt-1">
                    {{ orden.cliente_nombre || 'Sin nombre' }}
                    @if (orden.numero_pedido_dia) {
                      <small class="text-muted fw-normal ms-1">#{{ orden.numero_pedido_dia }}</small>
                    }
                  </div>
                  @if (orden.cliente_telefono) {
                    <div class="oq-sub"><i class="bi bi-telephone me-1"></i>{{ orden.cliente_telefono }}</div>
                  }
                  @if (orden.direccion_entrega) {
                    <div class="oq-sub text-truncate" style="max-width:220px">
                      <i class="bi bi-geo-alt me-1"></i>{{ orden.direccion_entrega }}
                    </div>
                  }
                  <div class="d-flex justify-content-between align-items-center mt-2">
                    <span class="oq-total">RD$ {{ orden.total | number:'1.2-2' }}</span>
                    <span class="small text-muted">{{ orden.created_at | date:'HH:mm' }}</span>
                  </div>
                  <div class="oq-actions">
                    <button class="btn btn-sm btn-outline-success" (click)="$event.stopPropagation(); abrirOrdenLlevar(orden)">
                      <i class="bi bi-pencil-square me-1"></i>Gestionar
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Modal de orden — Mesa -->
      @if (mesaActiva) {
        <app-order-modal
          [mesa]="mesaActiva"
          [tipoOrden]="'mesa'"
          (cerrar)="cerrarOrden()"
          (ordenActualizada)="onOrdenActualizada()"
          (cobrar)="abrirPago($event)">
        </app-order-modal>
      }

      <!-- Modal de orden — Barra / Llevar / Delivery -->
      @if (modalTipoOrden && !mesaActiva) {
        <app-order-modal
          [mesa]="null"
          [tipoOrden]="modalTipoOrden || 'barra'"
          [orderId]="modalOrdenId"
          [clienteNombre]="modalClienteNombre"
          [clienteTelefono]="modalClienteTelefono"
          [direccionEntrega]="modalDireccionEntrega"
          (cerrar)="cerrarModal()"
          (ordenActualizada)="onModalOrdenActualizada()"
          (cobrar)="abrirPago($event)">
        </app-order-modal>
      }

      <!-- Modal de pago dividido -->
      @if (ordenParaPagar) {
        <app-bill-split
          [orderId]="ordenParaPagar"
          (cerrar)="cerrarPago()"
          (ordenPagada)="onOrdenPagada()">
        </app-bill-split>
      }
    </div>
  `
})
export class RestauranteComponent implements OnInit {

  tabActiva: 'mesa' | 'barra' | 'llevar' = 'mesa';

  // Mesa
  mesaActiva: TableWithOrder | null = null;
  ordenParaPagar: string | null = null;

  // Modal barra/llevar/delivery
  modalTipoOrden: TipoOrden | null = null;
  modalOrdenId: string | undefined;
  modalClienteNombre = '';
  modalClienteTelefono = '';
  modalDireccionEntrega = '';

  // Barra queue
  ordenesBarra: RestaurantOrder[] = [];
  cargandoBarra = false;

  // Llevar/Delivery queue
  ordenesLlevar: RestaurantOrder[] = [];
  cargandoLlevar = false;
  mostrarFormLlevar = false;
  formTipo: 'llevar' | 'delivery' = 'llevar';
  formNombre = '';
  formTelefono = '';
  formDireccion = '';

  constructor(
    private tablesService: RestaurantTablesService,
    private ordersService: RestaurantOrdersService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  tienePermiso(permiso: string): boolean {
    return this.authService.tienePermiso(permiso);
  }

  async ngOnInit(): Promise<void> {}

  cambiarTab(tab: 'mesa' | 'barra' | 'llevar'): void {
    this.tabActiva = tab;
    if (tab === 'barra') this.cargarBarra();
    else if (tab === 'llevar') this.cargarLlevar();
  }

  // ── Mesa ──────────────────────────────────────────────

  abrirOrden(mesa: TableWithOrder): void {
    this.mesaActiva = mesa;
  }

  cerrarOrden(): void {
    this.mesaActiva = null;
  }

  onOrdenActualizada(): void {}

  abrirPago(orderId: string): void {
    this.mesaActiva = null;
    this.modalTipoOrden = null;
    this.ordenParaPagar = orderId;
    this.cdr.detectChanges();
  }

  cerrarPago(): void {
    this.ordenParaPagar = null;
  }

  onOrdenPagada(): void {
    this.ordenParaPagar = null;
    if (this.tabActiva === 'barra') this.cargarBarra();
    else if (this.tabActiva === 'llevar') this.cargarLlevar();
    this.cdr.detectChanges();
  }

  // ── Barra ─────────────────────────────────────────────

  async cargarBarra(): Promise<void> {
    this.cargandoBarra = true;
    try {
      this.ordenesBarra = await this.ordersService.cargarOrdenesPendientes(['barra']);
      this.cdr.detectChanges();
    } catch (e: any) {
      console.error('[Restaurante] Error cargando órdenes barra:', e?.message);
    } finally { this.cargandoBarra = false; this.cdr.detectChanges(); }
  }

  nuevaVentaRapida(): void {
    this.modalOrdenId = undefined;
    this.modalClienteNombre = '';
    this.modalClienteTelefono = '';
    this.modalDireccionEntrega = '';
    this.modalTipoOrden = 'barra';
  }

  abrirOrdenBarra(orden: RestaurantOrder): void {
    this.modalOrdenId = orden.id;
    this.modalClienteNombre = orden.cliente_nombre || '';
    this.modalClienteTelefono = orden.cliente_telefono || '';
    this.modalDireccionEntrega = orden.direccion_entrega || '';
    this.modalTipoOrden = 'barra';
  }

  cerrarModal(): void {
    this.modalTipoOrden = null;
    this.modalOrdenId = undefined;
    if (this.tabActiva === 'barra') this.cargarBarra();
    else if (this.tabActiva === 'llevar') this.cargarLlevar();
    this.cdr.detectChanges();
  }

  onModalOrdenActualizada(): void {
    if (this.tabActiva === 'barra') this.cargarBarra();
    else if (this.tabActiva === 'llevar') this.cargarLlevar();
  }

  // ── Llevar / Delivery ─────────────────────────────────

  async cargarLlevar(): Promise<void> {
    this.cargandoLlevar = true;
    try {
      this.ordenesLlevar = await this.ordersService.cargarOrdenesPendientes(['llevar', 'delivery']);
      this.cdr.detectChanges();
    } catch (e: any) {
      console.error('[Restaurante] Error cargando órdenes llevar/delivery:', e?.message);
    } finally { this.cargandoLlevar = false; this.cdr.detectChanges(); }
  }

  abrirFormLlevar(): void {
    this.formTipo = 'llevar';
    this.formNombre = '';
    this.formTelefono = '';
    this.formDireccion = '';
    this.mostrarFormLlevar = true;
  }

  cerrarFormLlevar(): void {
    this.mostrarFormLlevar = false;
  }

  confirmarFormLlevar(): void {
    this.modalOrdenId = undefined;
    this.modalClienteNombre = this.formNombre;
    this.modalClienteTelefono = this.formTelefono;
    this.modalDireccionEntrega = this.formDireccion;
    this.modalTipoOrden = this.formTipo;
    this.mostrarFormLlevar = false;
  }

  abrirOrdenLlevar(orden: RestaurantOrder): void {
    this.modalOrdenId = orden.id;
    this.modalClienteNombre = orden.cliente_nombre || '';
    this.modalClienteTelefono = orden.cliente_telefono || '';
    this.modalDireccionEntrega = orden.direccion_entrega || '';
    this.modalTipoOrden = (orden.tipo_orden as TipoOrden) || 'llevar';
  }

  // ── Helpers ───────────────────────────────────────────

  getItemsCount(orden: any): number {
    return orden.items?.filter((i: any) => i.estado !== 'cancelado').length || 0;
  }

  getEstadoColor(estado: string): string {
    const map: Record<string, string> = {
      abierta: 'secondary',
      en_cocina: 'warning',
      lista: 'success',
      pagando: 'info'
    };
    return map[estado] || 'secondary';
  }
}
