import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { Negocio } from '../models/negocio.model';
import { ROLES_PREDEFINIDOS } from '../models/usuario.model';
import * as bcrypt from 'bcryptjs';

// =============================================
// Tipos de negocio soportados por la plataforma
// =============================================
export type TipoNegocio = 'general' | 'restaurante' | 'bar' | 'billar' | 'cafeteria' | 'tienda' | 'food_truck';

// =============================================
// Módulos del sistema
// =============================================
export type ModuloSistema =
    | 'ventas'
    | 'inventario'
    | 'caja'
    | 'clientes'
    | 'mesas'                  // Mesas genéricas (billar, bar) → /ventas/mesas
    | 'restaurante'            // Módulo restaurante completo (mapa, órdenes, menú) → /restaurante
    | 'cocina'                 // Pantalla KDS → negocios con cocina real
    | 'restaurante_inventario' // Inventario de insumos y recetas del restaurante
    | 'cuentas_cobrar'
    | 'cuentas_pagar'
    | 'compras'
    | 'proveedores'
    | 'fiscal'
    | 'reportes'
    | 'usuarios'
    | 'identidad'
    | 'roles'
    | 'sistema'
    | 'dashboard';

// =============================================
// Módulos por defecto según tipo de negocio
// =============================================
export const MODULOS_POR_TIPO: Record<TipoNegocio, ModuloSistema[]> = {
    // ── POS: tienen 'ventas' e 'inventario' general ──────────────────────────
    general:    ['ventas', 'caja', 'clientes', 'inventario', 'reportes', 'usuarios', 'identidad', 'roles', 'sistema', 'dashboard'],
    tienda:     ['ventas', 'caja', 'clientes', 'inventario', 'cuentas_cobrar', 'proveedores', 'compras', 'fiscal', 'reportes', 'usuarios', 'identidad', 'roles', 'sistema', 'dashboard'],
    billar:     ['ventas', 'caja', 'clientes', 'mesas', 'inventario', 'cuentas_cobrar', 'reportes', 'usuarios', 'identidad', 'roles', 'sistema', 'dashboard'],

    // ── RESTAURANTE: sin 'ventas' POS ni 'inventario' general ────────────────
    bar:        ['caja', 'clientes', 'mesas', 'restaurante', 'restaurante_inventario', 'cuentas_cobrar', 'reportes', 'usuarios', 'identidad', 'roles', 'sistema', 'dashboard'],
    restaurante:['caja', 'clientes', 'mesas', 'restaurante', 'cocina', 'restaurante_inventario', 'fiscal', 'reportes', 'usuarios', 'identidad', 'roles', 'sistema', 'dashboard'],
    cafeteria:  ['caja', 'clientes', 'mesas', 'restaurante', 'restaurante_inventario', 'reportes', 'usuarios', 'identidad', 'roles', 'sistema', 'dashboard'],
    food_truck: ['caja', 'clientes', 'restaurante', 'restaurante_inventario', 'fiscal', 'reportes', 'usuarios', 'identidad', 'roles', 'sistema', 'dashboard']
};

// =============================================
// Etiquetas legibles
// =============================================
export const TIPOS_NEGOCIO_LABELS: Record<TipoNegocio, string> = {
    general: 'General',
    tienda: 'Tienda / Colmado',
    bar: 'Bar / Licorería',
    billar: 'Billar / Centro de Juegos',
    restaurante: 'Restaurante',
    cafeteria: 'Cafetería',
    food_truck: 'Food Truck / Comida Rápida'
};

export const MODULOS_LABELS: Record<ModuloSistema, string> = {
    ventas: 'Ventas / POS',
    inventario: 'Inventario General (POS)',
    caja: 'Caja Registradora',
    clientes: 'Gestión de Clientes',
    mesas: 'Mesas (Billar / Bar)',
    restaurante: 'Restaurante (Mapa, Órdenes, Menú)',
    cocina: 'Pantalla de Cocina (KDS)',
    restaurante_inventario: 'Inventario Restaurante (Insumos y Recetas)',
    cuentas_cobrar: 'Cuentas por Cobrar',
    cuentas_pagar: 'Cuentas por Pagar',
    compras: 'Compras (a Proveedores)',
    proveedores: 'Gestión de Proveedores',
    fiscal: 'Facturación Fiscal (DGII)',
    reportes: 'Reportes y Estadísticas',
    usuarios: 'Gestión de Usuarios',
    identidad: 'Identidad del Negocio',
    roles: 'Gestión de Roles',
    sistema: 'Ajustes del Sistema',
    dashboard: 'Dashboard / Resumen'
};

@Injectable({
    providedIn: 'root'
})
export class NegociosService {
    private negocioSubject = new BehaviorSubject<Negocio | null>(null);
    public negocio$ = this.negocioSubject.asObservable();

    constructor(private supabaseService: SupabaseService) { }

    /**
     * Obtener todos los negocios (Solo para SuperAdmin)
     */
    async obtenerTodos(): Promise<Negocio[]> {
        const { data, error } = await this.supabaseService.client
            .from('negocios')
            .select('*')
            .order('nombre', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    /**
     * Obtener detalle de un negocio específico con Resiliencia
     */
    async obtenerPorId(id: string): Promise<Negocio | null> {
        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout de base de datos')), 10000)
            );

            const queryPromise = this.supabaseService.client
                .from('negocios')
                .select('*')
                .eq('id', id)
                .maybeSingle(); // 💡 Evita el error 406 si no hay resultados

            const result: any = await Promise.race([queryPromise, timeoutPromise]);
            
            if (result.error) {
                console.warn('⚠️ Negocio no encontrado o inaccesible:', result.error);
                return null;
            }
            
            return result.data;
        } catch (error) {
            console.error('💥 Error crítico al obtener negocio:', error);
            return null;
        }
    }

    /**
     * Registrar un nuevo negocio (Onboarding Completo)
     * Crea el negocio, sus roles por defecto y el primer administrador
     */
    async crearNegocio(negocio: Partial<Negocio>, adminData?: any): Promise<Negocio> {
        // 1. Configurar módulos por defecto si no vienen
        if (negocio.tipo_negocio && (!negocio.modulos_activos || negocio.modulos_activos.length === 0)) {
            negocio.modulos_activos = [...MODULOS_POR_TIPO[negocio.tipo_negocio]];
        }

        // 2. Insertar Negocio
        const { data: nuevoNegocio, error: errorNegocio } = await this.supabaseService.client
            .from('negocios')
            .insert([negocio])
            .select()
            .single();

        if (errorNegocio) throw errorNegocio;

        // 3. Si vienen datos de administrador, crear estructura inicial
        if (adminData && adminData.email && adminData.password) {
            try {
                console.log('🏗️ Generando estructura inicial para el nuevo negocio...');
                
                // A. Crear Roles por defecto para este negocio
                let idRolAdmin = 0;
                
                for (const rolDef of ROLES_PREDEFINIDOS) {
                    const { data: nuevoRol, error: errorRol } = await this.supabaseService.client
                        .from('roles')
                        .upsert([{
                            nombre: rolDef.nombre,
                            descripcion: rolDef.descripcion,
                            permisos: [...rolDef.permisos],
                            color: rolDef.color,
                            activo: true,
                            negocio_id: nuevoNegocio.id
                        }], { onConflict: 'nombre,negocio_id', ignoreDuplicates: false })
                        .select()
                        .single();

                    if (!errorRol && nuevoRol && rolDef.nombre === 'Super Administrador') {
                        idRolAdmin = nuevoRol.id;
                    }
                }

                // B. Crear Usuario Administrador primario
                const passwordHasheada = await bcrypt.hash(adminData.password, 10);
                
                const { error: errorUsuario } = await this.supabaseService.client
                    .from('usuarios')
                    .insert([{
                        nombre: adminData.nombre || 'Administrador',
                        apellido: adminData.apellido || nuevoNegocio.nombre,
                        email: adminData.email,
                        username: adminData.username || adminData.email.split('@')[0],
                        password: passwordHasheada,
                        rol_id: idRolAdmin,
                        negocio_id: nuevoNegocio.id,
                        activo: true
                    }]);

                if (errorUsuario) {
                    console.error('❌ Error al crear usuario administrador inicial:', errorUsuario);
                    // No lanzamos error para no revertir la creación del negocio, el admin puede crearlo manual
                } else {
                    console.log('✅ Estructura de onboarding completada.');
                }

            } catch (err) {
                console.error('❌ Error en proceso de onboarding:', err);
            }
        }

        return nuevoNegocio;
    }

    /**
     * Actualizar plan o estado de licencia
     */
    async actualizarLicencia(id: string, cambios: Partial<Negocio>): Promise<void> {
        const { error } = await this.supabaseService.client
            .from('negocios')
            .update(cambios)
            .eq('id', id);

        if (error) throw error;
    }

    /**
     * Cargar el negocio actual en el estado
     */
    async cargarNegocioActual(id: string): Promise<void> {
        // El usuario dev de plataforma no pertenece a ningún negocio
        if (!id || id === '00000000-0000-0000-0000-000000000000') {
            this.negocioSubject.next(null);
            return;
        }
        const negocio = await this.obtenerPorId(id);
        if (!negocio) {
            console.warn(`🛑 El negocio ID ${id} no existe. Limpiando ID huérfano.`);
            localStorage.removeItem('logos_negocio_id');
        }
        this.negocioSubject.next(negocio);
    }

    async cargarNegocio(): Promise<Negocio | null> {
        if (!this.negocioSubject.value) {
            const savedId = localStorage.getItem('logos_negocio_id');
            if (savedId) {
                await this.cargarNegocioActual(savedId);
            }
        }
        return this.negocioSubject.value;
    }

    async actualizarNegocio(cambios: Partial<Negocio>): Promise<void> {
        let negocioActual = this.negocioSubject.value;
        
        // 💡 Si no hay negocio cargado, intentamos recuperarlo antes de fallar
        if (!negocioActual) {
            negocioActual = await this.cargarNegocio();
        }

        if (!negocioActual) {
            throw new Error('No hay negocio cargado para actualizar. Por favor, reinicie sesión.');
        }

        const { error } = await this.supabaseService.client
            .from('negocios')
            .update(cambios)
            .eq('id', negocioActual.id);

        if (error) throw error;

        this.negocioSubject.next({ ...negocioActual, ...cambios });
    }

    tieneModulo(modulo: ModuloSistema): boolean {
        const negocio = this.negocioSubject.value;
        if (!negocio) return false;
        return negocio.modulos_activos?.includes(modulo) ?? false;
    }

    get modulosActivos(): ModuloSistema[] {
        return this.negocioSubject.value?.modulos_activos || [];
    }

    get tipoNegocio(): TipoNegocio {
        return this.negocioSubject.value?.tipo_negocio || 'general';
    }
}
