import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PrintingService, TicketFormat } from '../../services/printing.service';
import { NegociosService } from '../../services/negocios.service';
import { PrintService } from '../../services/print.service';
import { Negocio } from '../../models/negocio.model';

export interface DatosCierreTicket {
    id: number;
    fecha_apertura: string;
    fecha_cierre: string;
    monto_inicial: number;
    ventas_efectivo: number;
    ventas_tarjeta: number;
    ventas_credito: number;
    ventas_mixto: number;
    total_entradas: number;
    total_salidas: number;
    total_anulaciones?: number;
    monto_esperado: number;
    monto_real: number;
    diferencia: number;
    usuario_apertura: string;
    usuario_cierre?: string;
    notas?: string;
    arqueo?: any;
}

@Component({
    selector: 'app-ticket-cierre',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './ticket-cierre.component.html',
    styleUrl: './ticket-cierre.component.css'
})
export class TicketCierreComponent implements OnInit {
    @Input() datos!: DatosCierreTicket;
    @Output() cerrar = new EventEmitter<void>();
    @Input() showActions: boolean = true;
    @Input() formato: TicketFormat = '80mm';
    
    negocio: Negocio | null = null;

    constructor(
        private negociosService: NegociosService,
        private printingService: PrintingService,
        private printService: PrintService
    ) {
        this.formato = this.printingService.currentFormat;
    }

    async ngOnInit() {
        this.negociosService.negocio$.subscribe((data: Negocio | null) => {
            this.negocio = data;
        });

        if (!this.datos) {
            console.error('TicketCierreComponent: No se proporcionaron datos de cierre.');
            return;
        }

        // Imprimir automáticamente en térmica al mostrar el ticket
        this.imprimirTermica();
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

    async imprimir() {
        const imprimioTermica = await this.imprimirTermica();
        if (!imprimioTermica) {
            window.print();
        }
    }

    private async imprimirTermica(): Promise<boolean> {
        try {
            return await this.printService.imprimirCierreCaja({
                ...this.datos,
                negocioNombre: this.negocio?.nombre || 'LogosPOS'
            });
        } catch (e) {
            console.error('[TicketCierre] Error impresora térmica:', e);
            return false;
        }
    }

    onCerrar() {
        this.cerrar.emit();
    }
}
