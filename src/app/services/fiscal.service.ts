import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ConfiguracionFiscal, SecuenciaNCF, TipoComprobante } from '../models/fiscal.model';
import { BehaviorSubject, Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
    providedIn: 'root'
})
export class FiscalService {
    private configSubject = new BehaviorSubject<ConfiguracionFiscal | null>(null);
    public config$ = this.configSubject.asObservable();

    constructor(
        private supabaseService: SupabaseService,
        private authService: AuthService
    ) {
        this.cargarConfiguracion();
    }

    // Cargar configuración fiscal
    async cargarConfiguracion() {
        try {
            const { data, error } = await this.supabaseService.client
                .from('configuracion_fiscal')
                .select('*')
                .maybeSingle();

            if (data) {
                this.configSubject.next(data);
            }
        } catch (error) {
            console.error('Error cargando config fiscal:', error);
        }
    }

    // Actualizar configuración
    async actualizarConfiguracion(config: Partial<ConfiguracionFiscal>): Promise<void> {
        try {
            const current = this.configSubject.value;
            const { data, error } = await this.supabaseService.client
                .from('configuracion_fiscal')
                .upsert({
                    id: current?.id || 1,
                    ...config,
                    negocio_id: this.authService.getNegocioId() // Multi-tenant support
                })
                .select()
                .single();

            if (error) throw error;
            this.configSubject.next(data);
        } catch (error) {
            console.error('Error actualizando config fiscal:', error);
            throw error;
        }
    }

    // Obtener secuencias NCF
    async obtenerSecuencias(): Promise<SecuenciaNCF[]> {
        const { data, error } = await this.supabaseService.client
            .from('secuencias_ncf')
            .select('*')
            .order('tipo_ncf');

        if (error) throw error;
        return data || [];
    }

    // Crear o actualizar secuencia
    async guardarSecuencia(secuencia: Partial<SecuenciaNCF>): Promise<SecuenciaNCF> {
        const { data, error } = await this.supabaseService.client
            .from('secuencias_ncf')
            .upsert({
                ...secuencia,
                negocio_id: this.authService.getNegocioId() // Multi-tenant support
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // Generar siguiente NCF (Llamada a función DB)
    async generarNCF(tipo: string): Promise<string> {
        // Si no está en modo fiscal, retornar vacío o generar ID interno
        if (!this.configSubject.value?.modo_fiscal) {
            return '';
        }

        try {
            const { data, error } = await this.supabaseService.client
                .rpc('obtener_siguiente_ncf', {
                    tipo_solicitado: tipo,
                    p_negocio_id: this.authService.getNegocioId() // Pass negocio_id to RPC
                });

            if (error) throw error;
            // Forzar mayúsculas según estándar NCF dominicano (Bxx...)
            return (data as string).toUpperCase();
        } catch (error) {
            console.error('Error generando NCF:', error);
            throw error;
        }
    }
}
