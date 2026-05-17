import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FloorMapComponent } from './floor-map/floor-map.component';
import { OrderModalComponent } from './order-modal/order-modal.component';
import { BillSplitComponent } from './bill-split/bill-split.component';
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
          <a routerLink="/restaurante/admin" class="btn-kds" style="background:linear-gradient(135deg,#374151 0%,#1f2937 100%)">
            <i class="bi bi-gear-fill"></i> Configurar
          </a>
          <a routerLink="/restaurante/cocina" class="btn-kds">
            <span class="kds-dot"></span>
            <i class="bi bi-fire"></i> Pantalla Cocina
          </a>
        </div>
      </div>

      <!-- Mapa de mesas -->
      <app-floor-map (mesaSeleccionada)="abrirOrden($event)"></app-floor-map>

      <!-- Modal de orden (cuando se selecciona una mesa) -->
      @if (mesaActiva) {
        <app-order-modal
          [mesa]="mesaActiva"
          (cerrar)="cerrarOrden()"
          (ordenActualizada)="onOrdenActualizada()">
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
export class RestauranteComponent {

  mesaActiva: TableWithOrder | null = null;
  ordenParaPagar: string | null = null;

  abrirOrden(mesa: TableWithOrder): void {
    this.mesaActiva = mesa;
  }

  cerrarOrden(): void {
    this.mesaActiva = null;
  }

  onOrdenActualizada(): void {
    // El FloorMap se actualiza via Realtime automáticamente
  }

  abrirPago(orderId: string): void {
    this.mesaActiva = null;
    this.ordenParaPagar = orderId;
  }

  cerrarPago(): void {
    this.ordenParaPagar = null;
  }

  onOrdenPagada(): void {
    this.ordenParaPagar = null;
  }
}
