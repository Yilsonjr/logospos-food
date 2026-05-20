import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FloorMapComponent } from './floor-map/floor-map.component';
import { OrderModalComponent } from './order-modal/order-modal.component';
import { BillSplitComponent } from './bill-split/bill-split.component';
import { RestaurantTablesService } from '../../services/restaurant-tables.service';
import { TableWithOrder } from '../../models/restaurant.models';

@Component({
  selector: 'app-restaurante',
  standalone: true,
  imports: [CommonModule, RouterModule, FloorMapComponent, OrderModalComponent, BillSplitComponent],
  styles: [`
    .rest-header {
      background: #fff;
      border-radius: 16px;
      padding: 1rem 1.5rem;
      border: 1px solid #f0f0f0;
      box-shadow: 0 1px 6px rgba(0,0,0,.05);
    }
    .rest-title { font-size: 1.25rem; font-weight: 800; color: #111827; margin: 0; }
    .rest-subtitle { font-size: 0.75rem; color: #9ca3af; margin: 0; }
    .btn-kds {
      background: linear-gradient(135deg, #1e1e2d 0%, #374151 100%);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 0.55rem 1.1rem;
      font-size: 0.83rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      transition: box-shadow .2s, transform .2s;
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
    .barra-section {
      background: #fff;
      border-radius: 12px;
      padding: 0.6rem 1rem;
      border: 1px solid #e5e7eb;
      box-shadow: 0 1px 4px rgba(0,0,0,.04);
    }
    .barra-btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 0.35rem 0.9rem; border-radius: 20px; font-size: 0.82rem; font-weight: 600;
      border: 2px solid #0d6efd; background: #fff; color: #0d6efd; cursor: pointer;
      transition: all .15s;
    }
    .barra-btn:hover { background: #0d6efd; color: #fff; }
    .barra-btn.ocupada { border-color: #f59e0b; color: #92400e; background: #fef3c7; }
    .barra-btn.ocupada:hover { background: #f59e0b; color: #fff; border-color: #f59e0b; }
    .barra-tip {
      font-size: 0.75rem; color: #9ca3af;
    }
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
            <p class="rest-title">Mapa de Mesas</p>
            <p class="rest-subtitle">Módulo Restaurante</p>
          </div>
        </div>
        <div class="d-flex gap-2">
          <a routerLink="/restaurante/reportes" class="btn-kds" style="background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%)">
            <i class="bi bi-bar-chart-fill"></i> Reportes
          </a>
          <a routerLink="/restaurante/admin" class="btn-kds" style="background:linear-gradient(135deg,#374151 0%,#1f2937 100%)">
            <i class="bi bi-gear-fill"></i> Configurar
          </a>
          <a routerLink="/restaurante/cocina" class="btn-kds">
            <span class="kds-dot"></span>
            <i class="bi bi-fire"></i> Pantalla Cocina
          </a>
        </div>
      </div>

      <!-- Venta Rápida / Barra -->
      @if (mesasRapidas.length > 0) {
        <div class="barra-section mb-3">
          <div class="d-flex align-items-center gap-3 flex-wrap">
            <span class="fw-bold small text-muted">
              <i class="bi bi-lightning-fill text-warning me-1"></i>Venta Rápida:
            </span>
            @for (m of mesasRapidas; track m.id) {
              <button class="barra-btn" [class.ocupada]="!!m.orden_activa" (click)="abrirOrden(m)">
                <i class="bi bi-cup-straw"></i>
                {{ m.nombre_mesa || 'Barra ' + m.numero_mesa }}
                @if (m.orden_activa) {
                  <span class="badge bg-warning text-dark ms-1" style="font-size:.6rem">EN USO</span>
                }
              </button>
            }
          </div>
        </div>
      } @else {
        <!-- Tip si no hay zona Barra configurada -->
        <div class="barra-section mb-3 d-flex align-items-center gap-2">
          <i class="bi bi-info-circle text-muted"></i>
          <span class="barra-tip">
            Para activar <strong>Venta Rápida</strong>, ve a
            <a routerLink="/restaurante/admin" class="text-primary text-decoration-none fw-semibold">Configurar</a>
            → Zonas → crea una zona llamada <strong>"Barra"</strong> y agrégale mesas.
          </span>
        </div>
      }

      <!-- Mapa de mesas -->
      <app-floor-map (mesaSeleccionada)="abrirOrden($event)"></app-floor-map>

      <!-- Modal de orden (cuando se selecciona una mesa) -->
      @if (mesaActiva) {
        <app-order-modal
          [mesa]="mesaActiva"
          (cerrar)="cerrarOrden()"
          (ordenActualizada)="onOrdenActualizada()"
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

  mesaActiva: TableWithOrder | null = null;
  ordenParaPagar: string | null = null;
  mesasRapidas: TableWithOrder[] = [];

  constructor(
    private tablesService: RestaurantTablesService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.cargarMesasRapidas();
  }

  async cargarMesasRapidas(): Promise<void> {
    try {
      const todas = await this.tablesService.cargarMesasConOrden();
      this.mesasRapidas = todas.filter(m =>
        m.zona?.nombre?.toLowerCase().includes('barra') ||
        m.zona?.nombre?.toLowerCase().includes('bar') ||
        m.nombre_mesa?.toLowerCase().includes('barra') ||
        m.nombre_mesa?.toLowerCase().includes('mostrador')
      );
      this.cdr.detectChanges();
    } catch { /* silencioso */ }
  }

  abrirOrden(mesa: TableWithOrder): void {
    this.mesaActiva = mesa;
  }

  cerrarOrden(): void {
    this.mesaActiva = null;
  }

  onOrdenActualizada(): void {
    // FloorMap se actualiza vía Realtime automáticamente
  }

  abrirPago(orderId: string): void {
    this.mesaActiva = null;
    this.ordenParaPagar = orderId;
    this.cdr.detectChanges();
  }

  cerrarPago(): void {
    this.ordenParaPagar = null;
  }

  onOrdenPagada(): void {
    this.ordenParaPagar = null;
    this.cargarMesasRapidas();
  }
}
