import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Caja, MovimientoCaja, ArqueoCaja, CrearCaja, CrearMovimientoCaja, ResumenCaja } from '../models/caja.model';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CajaService {
  private cajaActualSubject = new BehaviorSubject<Caja | null>(null);
  public cajaActual$ = this.cajaActualSubject.asObservable();

  private cajasSubject = new BehaviorSubject<Caja[]>([]);
  public cajas$ = this.cajasSubject.asObservable();

  private verificandoCaja = false;
  private promesaVerificacion: Promise<Caja | null> | null = null;

  constructor(
    private supabaseService: SupabaseService,
    private authService: AuthService
  ) {
    // Iniciar verificación y carga de historial al inicializar
    this.verificarCajaAbierta().catch(err => console.error('Error inicializando caja:', err));
    this.cargarHistorial().catch(err => console.error('Error cargando historial de caja:', err));
  }

  // Verificar si hay una caja abierta (evita llamadas duplicadas simultáneas)
  async verificarCajaAbierta(forzar: boolean = false): Promise<Caja | null> {
    try {
      // Si se fuerza, limpiar la promesa en curso
      if (forzar) {
        this.verificandoCaja = false;
        this.promesaVerificacion = null;
      }

      // Si ya hay una verificación en curso, retornar la misma promesa
      if (this.verificandoCaja && this.promesaVerificacion && !forzar) {
        console.log('⏳ Verificación en curso, esperando...');
        return await this.promesaVerificacion;
      }

      this.verificandoCaja = true;

      // Crear la promesa de verificación
      this.promesaVerificacion = (async () => {
        console.log('🔍 Verificando caja abierta en BD...');

        const usuarioActual = this.authService.usuarioActual;
        if (!usuarioActual) {
          console.warn('⚠️ No hay usuario autenticado al verificar caja');
          this.verificandoCaja = false;
          this.promesaVerificacion = null;
          return null;
        }

        const negocioId = this.authService.getNegocioId();

        // 1. Buscar caja propia del usuario
        const { data: cajaPropia, error: errorPropia } = await this.supabaseService.client
          .from('cajas')
          .select('*')
          .eq('estado', 'abierta')
          .eq('negocio_id', negocioId)
          .eq('usuario_apertura', usuarioActual.username)
          .order('fecha_apertura', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (errorPropia) {
          console.error('❌ Error al verificar caja propia:', errorPropia);
        }

        // 2. Si no tiene caja propia, usar cualquier caja abierta del negocio
        //    (meseros trabajan bajo la caja del cajero/admin)
        let cajaAbierta = cajaPropia || null;
        if (!cajaAbierta) {
          const { data: cajaNegocio, error: errorNegocio } = await this.supabaseService.client
            .from('cajas')
            .select('*')
            .eq('estado', 'abierta')
            .eq('negocio_id', negocioId)
            .order('fecha_apertura', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!errorNegocio) cajaAbierta = cajaNegocio || null;
        }

        this.verificandoCaja = false;
        this.promesaVerificacion = null;

        this.cajaActualSubject.next(cajaAbierta);
        console.log('✅ Verificación completada:', cajaAbierta ? `Caja #${cajaAbierta.id} (${cajaAbierta.usuario_apertura})` : 'Sin caja abierta');
        return cajaAbierta;
      })();

      return await this.promesaVerificacion;
    } catch (error) {
      this.verificandoCaja = false;
      this.promesaVerificacion = null;
      console.error('❌ Error al verificar caja abierta:', error);
      return null;
    }
  }

  // Obtener TODAS las cajas abiertas (para ADMIN)
  async obtenerTodasCajasAbiertas(): Promise<Caja[]> {
    try {
      const negocioId = this.authService.getNegocioId();
      const { data, error } = await this.supabaseService.client
        .from('cajas')
        .select('*')
        .eq('negocio_id', negocioId)
        .eq('estado', 'abierta')
        .order('fecha_apertura', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error al obtener todas las cajas abiertas:', error);
      return [];
    }
  }

  // Abrir caja
  async abrirCaja(caja: CrearCaja): Promise<Caja> {
    try {
      console.log('🔄 Abriendo caja...', caja);

      const usuarioActual = this.authService.usuarioActual;
      if (!usuarioActual) {
        throw new Error('No hay usuario autenticado para abrir caja');
      }

      // Usar el valor actual del subject en lugar de hacer otra llamada
      const cajaAbierta = this.cajaActualSubject.value;
      if (cajaAbierta) {
        throw new Error('Ya existe una caja abierta para este usuario. Debe cerrarla primero.');
      }

      // Forzar usuario actual
      const cajaNueva = {
        ...caja,
        usuario_apertura: usuarioActual.username,
        negocio_id: this.authService.getNegocioId() // Multi-tenant support
      };

      const { data, error } = await this.supabaseService.client
        .from('cajas')
        .insert([cajaNueva])
        .select()
        .single();

      if (error) {
        console.error('❌ Error de Supabase al insertar caja:', error);
        throw error;
      }

      if (!data) {
        throw new Error('No se recibieron datos después de insertar la caja');
      }

      console.log('✅ Caja abierta exitosamente:', data);
      this.cajaActualSubject.next(data);

      // Actualizar historial automáticamente
      this.cargarHistorial().catch(err => console.error('Error al actualizar historial tras abrir:', err));

      return data;
    } catch (error: any) {
      console.error('💥 Error al abrir caja:', error);
      console.error('💥 Detalles del error:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint
      });
      throw error;
    }
  }

  // Cerrar caja
  async cerrarCaja(cajaId: number, datosCierre: Partial<Caja>): Promise<Caja> {
    try {
      console.log('🔄 Cerrando caja...');

      const { data, error } = await this.supabaseService.client
        .from('cajas')
        .update({
          ...datosCierre,
          estado: 'cerrada',
          fecha_cierre: new Date().toISOString()
        })
        .eq('id', cajaId)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Caja cerrada exitosamente');
      this.cajaActualSubject.next(null);

      // Actualizar historial automáticamente
      this.cargarHistorial().catch(err => console.error('Error al actualizar historial tras cerrar:', err));

      return data;
    } catch (error) {
      console.error('💥 Error al cerrar caja:', error);
      throw error;
    }
  }

  // Registrar movimiento
  async registrarMovimiento(movimiento: CrearMovimientoCaja): Promise<MovimientoCaja> {
    try {
      console.log('🔄 Registrando movimiento...');

      const { data, error } = await this.supabaseService.client
        .from('movimientos_caja')
        .insert([{
          ...movimiento,
          negocio_id: this.authService.getNegocioId() // Multi-tenant support
        }])
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Movimiento registrado');
      return data;
    } catch (error) {
      console.error('💥 Error al registrar movimiento:', error);
      throw error;
    }
  }

  // Obtener movimientos de una caja
  async obtenerMovimientos(cajaId: number): Promise<MovimientoCaja[]> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('movimientos_caja')
        .select('*')
        .eq('caja_id', cajaId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error al obtener movimientos:', error);
      return [];
    }
  }

  // Guardar arqueo
  async guardarArqueo(arqueo: ArqueoCaja): Promise<void> {
    try {
      console.log('🔄 Guardando arqueo...');

      const { error } = await this.supabaseService.client
        .from('arqueos_caja')
        .insert([{
          ...arqueo,
          negocio_id: this.authService.getNegocioId() // Multi-tenant support
        }]);

      if (error) throw error;

      console.log('✅ Arqueo guardado');
    } catch (error) {
      console.error('💥 Error al guardar arqueo:', error);
      throw error;
    }
  }

  // Obtener arqueo de una caja
  async obtenerArqueo(cajaId: number): Promise<ArqueoCaja | null> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('arqueos_caja')
        .select('*')
        .eq('caja_id', cajaId)
        .maybeSingle();

      if (error) throw error;
      return data || null;
    } catch (error) {
      console.error('Error al obtener arqueo:', error);
      return null;
    }
  }

  // Obtener resumen completo de caja
  async obtenerResumenCaja(cajaId: number): Promise<ResumenCaja | null> {
    try {
      console.log('📡 [CajaService] Obteniendo resumen para caja:', cajaId);

      const { data: caja, error: errorCaja } = await this.supabaseService.client
        .from('cajas')
        .select('*')
        .eq('id', cajaId)
        .maybeSingle();

      if (errorCaja) {
        console.error('❌ Error al obtener datos de caja:', errorCaja);
        return null;
      }

      if (!caja) {
        console.warn('⚠️ No se encontró la caja con ID:', cajaId);
        return null;
      }

      const movimientos = await this.obtenerMovimientos(cajaId);
      const arqueo = await this.obtenerArqueo(cajaId);

      // Calcular totales
      const total_ventas = movimientos
        .filter(m => m.tipo === 'venta')
        .reduce((sum, m) => sum + m.monto, 0);

      const total_entradas = movimientos
        .filter(m => m.tipo === 'entrada')
        .reduce((sum, m) => sum + m.monto, 0);

      const total_salidas = movimientos
        .filter(m => m.tipo === 'salida')
        .reduce((sum, m) => sum + m.monto, 0);

      const efectivo_disponible = caja.monto_inicial + total_ventas + total_entradas - total_salidas;

      console.log('✅ [CajaService] Resumen generado exitosamente');

      return {
        caja,
        movimientos,
        arqueo: arqueo || undefined,
        total_ventas,
        total_entradas,
        total_salidas,
        efectivo_disponible
      };
    } catch (error) {
      console.error('💥 Error crítico al obtener resumen de caja:', error);
      return null;
    }
  }

  // Cargar historial de cajas
  async cargarHistorial(limite: number = 50): Promise<void> {
    try {
      console.log('🔄 Cargando historial de cajas...');

      const negocioId = this.authService.getNegocioId();
      const { data, error } = await this.supabaseService.client
        .from('cajas')
        .select('*')
        .eq('negocio_id', negocioId)
        .order('fecha_apertura', { ascending: false })
        .limit(limite);

      if (error) throw error;

      console.log('✅ Historial cargado:', data?.length || 0);
      this.cajasSubject.next(data || []);
    } catch (error) {
      console.error('💥 Error al cargar historial:', error);
      throw error;
    }
  }

  // Obtener cajas por rango de fechas
  async obtenerCajasPorFecha(fechaInicio: string, fechaFin: string): Promise<Caja[]> {
    try {
      const negocioId = this.authService.getNegocioId();
      const { data, error } = await this.supabaseService.client
        .from('cajas')
        .select('*')
        .eq('negocio_id', negocioId)
        .gte('fecha_apertura', fechaInicio)
        .lte('fecha_apertura', fechaFin)
        .order('fecha_apertura', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error al obtener cajas por fecha:', error);
      return [];
    }
  }

  // Calcular totales de ventas de la caja para el cierre
  async calcularVentasDelDia(cajaId: number): Promise<{ efectivo: number; tarjeta: number }> {
    try {
      console.log('📊 [CajaService] Calculando ventas para el cierre de la caja:', cajaId);

      // Obtener todos los movimientos de tipo 'venta' para esta caja
      const { data: movimientos, error } = await this.supabaseService.client
        .from('movimientos_caja')
        .select('concepto, monto')
        .eq('caja_id', cajaId)
        .eq('tipo', 'venta');

      if (error) throw error;

      let totalEfectivo = 0;
      let totalTarjeta = 0;

      // Desglosar por el concepto (que indica el método de pago)
      movimientos?.forEach(mov => {
        const concepto = mov.concepto.toLowerCase();
        if (concepto.includes('(efectivo)')) {
          totalEfectivo += mov.monto;
        } else if (concepto.includes('(tarjeta)')) {
          totalTarjeta += mov.monto;
        }
      });

      console.log(`✅ [CajaService] Ventas calculadas para caja #${cajaId}:`, { totalEfectivo, totalTarjeta });
      return { efectivo: totalEfectivo, tarjeta: totalTarjeta };

    } catch (error) {
      console.error('❌ [CajaService] Error al calcular ventas de la caja:', error);
      return { efectivo: 0, tarjeta: 0 };
    }
  }
}
