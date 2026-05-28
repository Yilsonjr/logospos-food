import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Usuario, Rol, LoginCredentials, LoginResponse, AuthState, Sesion } from '../models/usuario.model';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import * as bcrypt from 'bcryptjs';
import { NegociosService } from './negocios.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private authStateSubject = new BehaviorSubject<AuthState>({
    isAuthenticated: false,
    usuario: null,
    token: null,
    permisos: []
  });

  public authState$ = this.authStateSubject.asObservable();

  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
    private negociosService: NegociosService
  ) {
    this.initializeAuth();
  }

  // Inicializar autenticación al cargar la app
  private async initializeAuth() {
    try {
      // Intentar recuperar de localStorage o sessionStorage
      let token = localStorage.getItem('logos_token') || sessionStorage.getItem('logos_token');
      let usuarioData = localStorage.getItem('logos_usuario') || sessionStorage.getItem('logos_usuario');
      const jwt = localStorage.getItem('logos_jwt') || sessionStorage.getItem('logos_jwt');

      // Si hay sesión pero sin JWT (sesión legacy pre-Phase2), forzar re-login
      if (token && usuarioData && !jwt) {
        console.warn('[Auth] Sesión sin JWT — requiere re-autenticación para RLS.');
        this.limpiarStorage();
        return; // Redirigirá al login por AuthGuard
      }

      if (token && usuarioData) {
        const usuario = JSON.parse(usuarioData);

        // Esto permite que el AuthGuard pase inmediatamente y evita el redirect al login
        this.authStateSubject.next({
          isAuthenticated: true,
          usuario,
          token,
          permisos: [] // Se cargarán en el siguiente paso
        });

        // 2. Verificar validez en segundo plano
        const isValid = await this.verificarToken(token);

        if (isValid) {
          // Cargar permisos actualizados
          const permisos = await this.cargarPermisosUsuario(usuario.id);

          // Cargar información del rol si falta (importante para refrescos de página)
          if (!usuario.rol) {
            const { data: rol } = await this.supabaseService.client
              .from('roles')
              .select('*')
              .eq('id', usuario.rol_id)
              .single();
            if (rol) usuario.rol = rol;
          }

          // Cargar datos del negocio (Tenant)
          await this.negociosService.cargarNegocioActual(usuario.negocio_id);

          // Actualizar estado con permisos confirmados
          this.authStateSubject.next({
            isAuthenticated: true,
            usuario,
            token,
            permisos
          });
        } else {
          // Si el token no es válido, cerrar sesión
          console.warn('Token inválido o expirado durante inicialización');
          this.logout();
        }
      }
    } catch (error) {
      console.error('Error al inicializar autenticación:', error);
      this.logout();
    }
  }

  // ── LOGIN ──────────────────────────────────────────────────
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    // Sin conexión → login offline directamente
    if (!this.supabaseService.isOnline) {
      return this.loginOffline(credentials);
    }

    try {
      return await this.loginViaEdgeFunction(credentials);
    } catch (error: any) {
      console.error('Error en login:', error);

      // Si es error de red, intentar modo offline
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        console.log('📶 Sin conexión — intentando modo offline...');
        return this.loginOffline(credentials);
      }

      throw new Error(error.message || 'Error al iniciar sesión');
    }
  }

  // ── Login seguro: Edge Function firma JWT con service_role ──
  private async loginViaEdgeFunction(credentials: LoginCredentials): Promise<LoginResponse> {
    const url = `${this.supabaseService.supabaseUrl}/functions/v1/auth-login`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.supabaseService.supabaseAnonKey}`,
        'apikey':        this.supabaseService.supabaseAnonKey,
      },
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
        recordar: credentials.recordar ?? false,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      const error: any = new Error(err.error || 'Error de autenticación');
      error.status = res.status;
      throw error;
    }

    const { jwt, token, expiracion, usuario } = await res.json();

    // Aplicar JWT al cliente Supabase → todas las queries quedan bajo RLS correcto
    this.supabaseService.setJwt(jwt);

    // JWT siempre en localStorage — su propio exp controla la validez
    localStorage.setItem('logos_jwt', jwt);

    // Los datos de sesión respetan la opción "recordar"
    const storage = credentials.recordar ? localStorage : sessionStorage;
    storage.setItem('logos_token',   token);
    storage.setItem('logos_usuario', JSON.stringify(usuario));
    localStorage.setItem('logos_negocio_id', usuario.negocio_id);

    // Extraer permisos del rol que ya vino con el usuario (Edge Function hace SELECT *, rol:roles(*))
    // Esto evita una query extra a la BD que puede fallar si el RLS aún está propagándose.
    const permisosRol: string[] = usuario.rol?.permisos || [];
    const permisos = permisosRol.length > 0
      ? permisosRol
      : await this.cargarPermisosUsuario(usuario.id); // fallback por si el rol no trajo permisos

    // Cargar datos del negocio en paralelo con el cache offline
    await Promise.all([
      this.guardarUsuarioOffline(usuario, credentials.password, token, expiracion),
      this.negociosService.cargarNegocioActual(usuario.negocio_id)
    ]);

    this.authStateSubject.next({ isAuthenticated: true, usuario, token, permisos });

    console.log('🔐 Login seguro via Edge Function ✅', { permisos: permisos.length });
    return { usuario, token, expiracion };
  }

  // --- LOGICA OFFLINE (Dexie) ---

  private async guardarUsuarioOffline(usuario: Usuario, password_plana: string, token: string, fecha_expiracion: string) {
    const hashLocal = await bcrypt.hash(password_plana, 10);
    try {
      // 1. Guardar perfil de usuario
      await this.supabaseService.db.usuarios_offline.put({
        id: usuario.id!,
        username: usuario.username,
        email: usuario.email || '',
        password_hash: hashLocal,
        perfil_json: JSON.stringify(usuario),
        ultimo_login: new Date().toISOString()
      });

      // 2. Guardar sesión
      await this.supabaseService.db.sesiones_offline.put({
        token,
        usuario_id: usuario.id!,
        fecha_expiracion
      });

      console.log('💾 Usuario cacheado para uso offline');
    } catch (e) {
      console.error('Error al cachear usuario offline:', e);
    }
  }

  private async loginOffline(credentials: LoginCredentials): Promise<LoginResponse> {
    const usuarioOffline = await this.supabaseService.db.usuarios_offline
      .where('username').equalsIgnoreCase(credentials.username)
      .or('email').equalsIgnoreCase(credentials.username)
      .first();

    if (!usuarioOffline) {
      throw new Error('Usuario no encontrado en modo local. Inicie sesión online primero.');
    }

    const esValida = await bcrypt.compare(credentials.password, usuarioOffline.password_hash);

    if (!esValida) {
      throw new Error('Usuario o contraseña incorrectos');
    }

    const usuario = JSON.parse(usuarioOffline.perfil_json);
    const token = this.generarToken(); // Token local para esta sesión
    const expiracion = new Date();
    expiracion.setHours(expiracion.getHours() + 8);

    // Actualizar estado
    this.authStateSubject.next({
      isAuthenticated: true,
      usuario,
      token,
      permisos: usuario.rol?.permisos || []
    });

    // Guardar temporalmente en localStorage para que refrescos no saquen al usuario
    sessionStorage.setItem('logos_token', token);
    sessionStorage.setItem('logos_usuario', JSON.stringify(usuario));

    await Swal.fire({
      title: '📶 Modo Offline',
      text: 'Has iniciado sesión en modo local. Algunas funciones de sincronización no estarán disponibles.',
      icon: 'info',
      confirmButtonText: 'Aceptar'
    });

    return {
      usuario,
      token,
      expiracion: expiracion.toISOString()
    };
  }

  // Logout
  async logout() {
    try {
      const currentState = this.authStateSubject.value;

      if (currentState.token) {
        // Marcar sesión como inactiva
        await this.supabaseService.client
          .from('sesiones')
          .update({ activa: false })
          .eq('token', currentState.token);
      }

      // Limpiar almacenamiento (incluyendo JWT para RLS)
      this.limpiarStorage();

      // Actualizar estado
      this.authStateSubject.next({
        isAuthenticated: false,
        usuario: null,
        token: null,
        permisos: []
      });

      // Redirigir al login
      this.router.navigate(['/login']);

    } catch (error) {
      console.error('Error en logout:', error);
    }
  }

  /** Limpia todo el storage de sesión y resetea el cliente Supabase a anon. */
  private limpiarStorage(): void {
    localStorage.removeItem('logos_token');
    localStorage.removeItem('logos_usuario');
    localStorage.removeItem('logos_negocio_id');
    sessionStorage.removeItem('logos_token');
    sessionStorage.removeItem('logos_usuario');
    this.supabaseService.clearJwt(); // también limpia logos_jwt de localStorage
  }

  // Obtener negocio_id actual
  getNegocioId(): string | null {
    return this.authStateSubject.value.usuario?.negocio_id || localStorage.getItem('logos_negocio_id');
  }

  // Verificar si es el administrador global del sistema
  isSuperAdmin(): boolean {
    const negocioId = this.getNegocioId();
    return negocioId === '00000000-0000-0000-0000-000000000000';
  }
  /**
   * Verifica si el usuario tiene un permiso.
   * Soporta dos formatos:
   *   - Exacto:  "dashboard.ver" === "dashboard.ver"
   *   - Padre:   "dashboard" cubre "dashboard.ver", "dashboard.stats", etc.
   * Esto permite que los roles con permisos cortos ("dashboard") den acceso
   * a rutas que piden permisos granulares ("dashboard.ver").
   */
  tienePermiso(permiso: string): boolean {
    const currentState = this.authStateSubject.value;
    if (this.esRolAdmin(currentState)) return true;
    return this.matchPermiso(currentState.permisos, permiso);
  }

  // Verificar si el usuario tiene alguno de los permisos
  tieneAlgunPermiso(permisos: string[]): boolean {
    const currentState = this.authStateSubject.value;
    if (this.esRolAdmin(currentState)) return true;
    return permisos.some(p => this.matchPermiso(currentState.permisos, p));
  }

  // Verificar si el usuario tiene todos los permisos
  tieneTodosPermisos(permisos: string[]): boolean {
    const currentState = this.authStateSubject.value;
    if (this.esRolAdmin(currentState)) return true;
    return permisos.every(p => this.matchPermiso(currentState.permisos, p));
  }

  /**
   * Devuelve true si el permiso requerido está cubierto por alguno de los
   * permisos del usuario, ya sea por coincidencia exacta o por prefijo padre.
   * Ejemplo: usuario tiene ["dashboard"] → cubre "dashboard.ver", "dashboard.stats"
   */
  private matchPermiso(permisosUsuario: string[], permisoRequerido: string): boolean {
    return permisosUsuario.some(p =>
      p === permisoRequerido ||            // exacto: "dashboard.ver" === "dashboard.ver"
      permisoRequerido.startsWith(p + '.') // padre:  "dashboard" cubre "dashboard.ver"
    );
  }

  /** True si el rol es de tipo administrador con acceso total. */
  private esRolAdmin(state: AuthState): boolean {
    const roleName = (state.usuario?.rol?.nombre || '').toLowerCase().trim();
    return (
      state.usuario?.rol_id === 1 ||
      roleName === 'admin' ||
      roleName === 'super administrador' ||
      roleName === 'administrador' ||
      roleName === 'super admin'
    );
  }

  // Obtener usuario actual
  get usuarioActual(): Usuario | null {
    return this.authStateSubject.value.usuario;
  }

  // Verificar si está autenticado
  get isAuthenticated(): boolean {
    return this.authStateSubject.value.isAuthenticated;
  }

  // Cargar permisos del usuario
  private async cargarPermisosUsuario(usuarioId: number): Promise<string[]> {
    try {
      // Primero obtener el rol_id del usuario
      const { data: usuario, error: errorUsuario } = await this.supabaseService.client
        .from('usuarios')
        .select('rol_id')
        .eq('id', usuarioId)
        .single();

      if (errorUsuario || !usuario) {
        return [];
      }

      // Luego obtener los permisos del rol
      const { data: rol, error: errorRol } = await this.supabaseService.client
        .from('roles')
        .select('permisos')
        .eq('id', usuario.rol_id)
        .single();

      if (errorRol || !rol) {
        return [];
      }

      return rol.permisos || [];
    } catch (error) {
      console.error('Error al cargar permisos:', error);
      return [];
    }
  }

  // Verificar validez del token
  private async verificarToken(token: string): Promise<boolean> {
    try {
      const { data: sesion, error } = await this.supabaseService.client
        .from('sesiones')
        .select('fecha_expiracion, activa')
        .eq('token', token)
        .eq('activa', true)
        .single();

      if (error || !sesion) {
        return false;
      }

      const ahora = new Date();
      const expiracion = new Date(sesion.fecha_expiracion);

      return ahora < expiracion;
    } catch (error) {
      console.error('Error al verificar token:', error);
      return false;
    }
  }

  // Generar token único
  private generarToken(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return `logos_${timestamp}_${random}`;
  }

  // Cambiar contraseña
  async cambiarContrasena(contrasenaActual: string, contrasenaNueva: string): Promise<void> {
    try {
      const usuario = this.usuarioActual;
      if (!usuario) {
        throw new Error('No hay usuario autenticado');
      }

      // Verificar contraseña actual
      const { data: usuarioData, error } = await this.supabaseService.client
        .from('usuarios')
        .select('password')
        .eq('id', usuario.id)
        .single();

      if (error || usuarioData.password !== contrasenaActual) {
        throw new Error('Contraseña actual incorrecta');
      }

      // Hashear la nueva contraseña
      const passwordHasheada = await bcrypt.hash(contrasenaNueva, 10);

      // Actualizar contraseña
      await this.supabaseService.client
        .from('usuarios')
        .update({
          password: passwordHasheada
        })
        .eq('id', usuario.id);

      await Swal.fire({
        title: '✅ Contraseña Actualizada',
        text: 'Tu contraseña ha sido cambiada exitosamente',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });

    } catch (error: any) {
      console.error('Error al cambiar contraseña:', error);
      throw new Error(error.message || 'Error al cambiar contraseña');
    }
  }

  // Obtener sesiones activas del usuario
  async obtenerSesionesActivas(): Promise<Sesion[]> {
    try {
      const usuario = this.usuarioActual;
      if (!usuario) return [];

      const { data, error } = await this.supabaseService.client
        .from('sesiones')
        .select('*')
        .eq('usuario_id', usuario.id)
        .eq('activa', true)
        .order('fecha_inicio', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error al obtener sesiones:', error);
      return [];
    }
  }

  // Cerrar sesión específica
  async cerrarSesion(sesionId: number): Promise<void> {
    try {
      await this.supabaseService.client
        .from('sesiones')
        .update({ activa: false })
        .eq('id', sesionId);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      throw error;
    }
  }

  // Cerrar todas las sesiones excepto la actual
  async cerrarTodasLasSesiones(): Promise<void> {
    try {
      const usuario = this.usuarioActual;
      const tokenActual = this.authStateSubject.value.token;

      if (!usuario || !tokenActual) return;

      await this.supabaseService.client
        .from('sesiones')
        .update({ activa: false })
        .eq('usuario_id', usuario.id)
        .neq('token', tokenActual);

      await Swal.fire({
        title: 'Sesiones Cerradas',
        text: 'Se han cerrado todas las demás sesiones activas',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });

    } catch (error) {
      console.error('Error al cerrar sesiones:', error);
      throw error;
    }
  }
}