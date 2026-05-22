import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VentaCompleta } from '../../models/ventas.model';
import { PrintingService, TicketFormat } from '../../services/printing.service';
import { FormsModule } from '@angular/forms';
import { NegociosService } from '../../services/negocios.service';
import { Negocio } from '../../models/negocio.model';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-factura',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './factura.component.html',
    styleUrl: './factura.component.css'
})
export class FacturaComponent implements OnInit {
    @Input() venta!: VentaCompleta;
    @Input() simulation: boolean = true; // Si es true, se muestra como modal/simulación
    @Input() formato: TicketFormat = '80mm';
    @Output() cerrar = new EventEmitter<void>();

    negocio: Negocio | null = null;

    constructor(
        private negociosService: NegociosService,
        private printingService: PrintingService
    ) { 
        this.formato = this.printingService.currentFormat;
    }

    async ngOnInit() {
        if (!this.venta) {
            console.error('FacturaComponent: No se proporcionó una venta válida.');
        }
        this.negociosService.negocio$.subscribe((data: Negocio | null) => {
            this.negocio = data;
        });
    }

    cambiarFormato(nuevoFormato: any) {
        this.formato = nuevoFormato as TicketFormat;
        this.printingService.setFormat(this.formato);
    }

    formatearMoneda(valor: number | undefined): string {
        return new Intl.NumberFormat('es-DO', {
            style: 'currency',
            currency: 'DOP'
        }).format(valor || 0);
    }

    formatearFecha(fecha: string): string {
        return new Date(fecha).toLocaleString('es-DO', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    imprimir(): void {
        const ventana = window.open('', '_blank', 'width=480,height=720,scrollbars=yes');
        if (!ventana) {
            Swal.fire({
                icon: 'warning',
                title: 'Ventana bloqueada',
                text: 'El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.',
                confirmButtonText: 'Entendido'
            });
            return;
        }

        const isA4 = this.formato === 'a4';
        const fontBase = isA4 ? '13px' : '11px';
        const maxWidth = this.formato === '58mm' ? '58mm' : this.formato === '80mm' ? '80mm' : '190mm';
        const fontFamily = isA4
            ? "'Helvetica Neue', Arial, sans-serif"
            : "'Courier New', Courier, monospace";

        // Filas de items
        const itemsHtml = this.venta.detalles.map(item => `
            <tr>
                <td style="width:28px;font-weight:bold;vertical-align:top">${item.cantidad}x</td>
                <td style="padding:0 4px;vertical-align:top">${item.producto_nombre}</td>
                <td style="text-align:right;white-space:nowrap;vertical-align:top;font-weight:bold">${this.formatearMoneda(item.subtotal)}</td>
            </tr>
            ${item.cantidad > 1
                ? `<tr><td></td><td colspan="2" style="font-size:9px;color:#555;padding-bottom:3px">c/u ${this.formatearMoneda(item.precio_unitario)}</td></tr>`
                : ''}
        `).join('');

        const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Factura #${this.venta.numero_venta}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body {
      font-family: ${fontFamily};
      font-size: ${fontBase};
      color: #000;
      background: white;
    }
    body { padding: ${isA4 ? '15mm 20mm' : '3mm 4mm'}; }
    .wrap { width:100%; max-width:${maxWidth}; margin:0 auto; }
    .center { text-align:center; }
    .right  { text-align:right; }
    .bold   { font-weight:bold; }
    .upper  { text-transform:uppercase; }
    .sep    { border-bottom:1px dashed #000; margin:5px 0; }
    .sep2   { border-bottom:2px solid #000;  margin:5px 0; }
    table   { width:100%; border-collapse:collapse; }
    td      { padding:2px 0; vertical-align:top; }
    .biz-name  { font-size:${isA4 ? '18px' : '15px'}; font-weight:bold; text-transform:uppercase; letter-spacing:1px; margin:4px 0; }
    .biz-info  { font-size:${isA4 ? '12px' : '10px'}; margin:1px 0; }
    .title     { font-size:${isA4 ? '14px' : '12px'}; font-weight:bold; margin:5px 0; }
    .item-table thead th {
      text-align:left; padding-bottom:4px;
      border-bottom:1px solid #000; font-size:${isA4 ? '11px' : '9px'};
      text-transform:uppercase;
    }
    .item-table thead th:last-child { text-align:right; }
    .total-row td {
      font-size:${isA4 ? '15px' : '13px'}; font-weight:bold;
      border-top:2px solid #000; padding-top:5px; margin-top:4px;
    }
    .footer { text-align:center; margin-top:14px; font-size:${isA4 ? '11px' : '9px'}; }
    .lema   { font-weight:bold; font-style:italic; margin-bottom:3px; }
    .dev    { opacity:0.6; }
    @page   { size:auto; margin:0mm; }
    @media print { body { padding:${isA4 ? '10mm 15mm' : '2mm 3mm'}; } }
  </style>
</head>
<body>
<div class="wrap">

  <!-- ENCABEZADO -->
  <div class="center">
    ${this.negocio?.logo_url ? `<img src="${this.negocio.logo_url}" style="max-width:${isA4 ? '90px' : '65px'};height:auto;margin-bottom:6px">` : ''}
    <div class="biz-name">${this.negocio?.nombre || ''}</div>
    ${this.negocio?.rnc       ? `<div class="biz-info">RNC: ${this.negocio.rnc}</div>` : ''}
    ${this.negocio?.direccion ? `<div class="biz-info">${this.negocio.direccion}</div>` : ''}
    ${this.negocio?.telefono  ? `<div class="biz-info">Tel: ${this.negocio.telefono}</div>` : ''}
  </div>
  <div class="sep2"></div>
  <div class="center title">FACTURA DE VENTA</div>
  <div class="sep"></div>

  <!-- DATOS FACTURA -->
  <table>
    <tr><td>FACTURA:</td>       <td class="right bold">${this.venta.numero_venta}</td></tr>
    <tr><td>FECHA:</td>         <td class="right">${this.formatearFecha(this.venta.created_at || '')}</td></tr>
    ${this.venta.ncf ? `<tr><td>NCF:</td><td class="right bold">${this.venta.ncf}</td></tr>` : ''}
    <tr><td>CLIENTE:</td>       <td class="right">${this.venta.cliente_nombre || 'CONSUMIDOR FINAL'}</td></tr>
  </table>
  <div class="sep"></div>

  <!-- ITEMS -->
  <table class="item-table">
    <thead>
      <tr>
        <th colspan="2">Cant. Descripción</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="sep"></div>

  <!-- TOTALES -->
  <table>
    <tr><td>SUBTOTAL:</td>  <td class="right">${this.formatearMoneda(this.venta.subtotal)}</td></tr>
    ${(this.venta.descuento || 0) > 0 ? `<tr><td>DESCUENTO:</td><td class="right">-${this.formatearMoneda(this.venta.descuento)}</td></tr>` : ''}
    ${(this.venta.impuestos || 0) > 0 ? `<tr><td>ITBIS (18%):</td><td class="right">${this.formatearMoneda(this.venta.impuestos)}</td></tr>` : ''}
    <tr class="total-row"><td>TOTAL A PAGAR:</td><td class="right">${this.formatearMoneda(this.venta.total)}</td></tr>
  </table>
  <div class="sep"></div>

  <!-- PAGO -->
  <table>
    <tr><td>MÉTODO PAGO:</td><td class="right upper">${this.venta.metodo_pago}</td></tr>
    ${(this.venta.monto_efectivo || 0) > 0 ? `<tr><td>EFECTIVO:</td><td class="right">${this.formatearMoneda(this.venta.monto_efectivo)}</td></tr>` : ''}
    ${(this.venta.cambio || 0) > 0 ? `<tr><td>CAMBIO:</td><td class="right">${this.formatearMoneda(this.venta.cambio)}</td></tr>` : ''}
  </table>

  <!-- PIE -->
  <div class="footer">
    <div class="sep"></div>
    ${this.negocio?.lema ? `<div class="lema">${this.negocio.lema}</div>` : ''}
    <div class="dev">Desarrollado por LogosPOS</div>
  </div>

</div>
</body>
</html>`;

        ventana.document.write(html);
        ventana.document.close();
        setTimeout(() => {
            ventana.focus();
            ventana.print();
            ventana.close();
        }, 600);
    }

    onCerrar() {
        this.cerrar.emit();
    }
}
