import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { UsuariosService } from '../../../services/usuarios.service';
import { AuthService } from '../../../services/auth.service';
import { Usuario, Rol, CrearUsuario, ActualizarUsuario } from '../../../models/usuario.model';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios.component.html',
  styleUrls: ['./usuarios.component.css']
})
export class UsuariosComponent implements OnInit, OnDestroy {
  usuarios: Usuario[] = [];
  roles: Rol[] = [];
  usuariosFiltrados: Usuario[] = [];

  // Filtros y búsqueda
  filtroTexto = '';
  filtroRol = '';
  filtroEstado = 'todos';
  filtroNegocio = '';
  negociosDisponibles: { id: string; nombre: string }[] = [];
  vistaActual: 'tarjetas' | 'tabla' = 'tarjetas';
  menuAbiertoId: number | null = null;

  // Modal
  mostrarModal = false;
  modoModal: 'crear' | 'editar' = 'crear';
  usuarioSeleccionado: Usuario | null = null;

  // Formulario
  formularioUsuario: CrearUsuario = {
    nombre: '',
    apellido: '',
    email: '',
    username: '',
    password: '',
    telefono: '',
    rol_id: 0,
    negocio_id: '',
    activo: true
  };

  // Estados
  isLoading = false;
  isSaving = false;
  subscriptions: Subscription[] = [];

  // Estadísticas
  estadisticas = {
    total: 0,
    activos: 0,
    inactivos: 0,
    negocios: 0,
    porRol: [] as { rol: string; cantidad: number; color: string }[]
  };

  constructor(
    private usuariosService: UsuariosService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit() {
    // Verificar permisos
    if (!this.authService.tienePermiso('usuarios.ver')) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // Suscribirse a los datos
    const usuariosSub = this.usuariosService.usuarios$.subscribe(usuarios => {
      this.usuarios = usuarios;
      // Construir lista única de negocios para el filtro
      const map = new Map<string, string>();
      usuarios.forEach(u => { if (u.negocio) map.set(u.negocio.id, u.negocio.nombre); });
      this.negociosDisponibles = [...map.entries()].map(([id, nombre]) => ({ id, nombre }));
      this.aplicarFiltros();
      this.actualizarEstadisticas();
      this.cdr.detectChanges();
    });
    this.subscriptions.push(usuariosSub);

    const rolesSub = this.usuariosService.roles$.subscribe(roles => {
      this.roles = roles.filter(r => r.activo);
      this.cdr.detectChanges();
    });
    this.subscriptions.push(rolesSub);

    // Cargar datos
    await this.cargarDatos();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async cargarDatos() {
    this.isLoading = true;
    this.cdr.detectChanges();
    try {
      await Promise.all([
        this.usuariosService.cargarUsuarios(),
        this.usuariosService.cargarRoles()
      ]);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      Swal.fire({
        title: '❌ Error',
        text: 'Error al cargar los datos',
        icon: 'error'
      });
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
      setTimeout(() => this.cdr.detectChanges(), 100);
    }
  }

  aplicarFiltros() {
    let filtrados = [...this.usuarios];

    // Filtro por texto
    if (this.filtroTexto.trim()) {
      const texto = this.filtroTexto.toLowerCase();
      filtrados = filtrados.filter(usuario =>
        usuario.nombre.toLowerCase().includes(texto) ||
        usuario.apellido.toLowerCase().includes(texto) ||
        usuario.email.toLowerCase().includes(texto) ||
        usuario.username.toLowerCase().includes(texto) ||
        usuario.rol?.nombre.toLowerCase().includes(texto)
      );
    }

    // Filtro por rol
    if (this.filtroRol) {
      filtrados = filtrados.filter(usuario =>
        usuario.rol_id.toString() === this.filtroRol
      );
    }

    // Filtro por estado
    if (this.filtroEstado !== 'todos') {
      const activo = this.filtroEstado === 'activos';
      filtrados = filtrados.filter(usuario => usuario.activo === activo);
    }

    // Filtro por negocio
    if (this.filtroNegocio) {
      filtrados = filtrados.filter(u => u.negocio_id === this.filtroNegocio);
    }

    this.usuariosFiltrados = filtrados;
    this.menuAbiertoId = null; // Cerrar menús al filtrar
    this.cdr.detectChanges();
  }

  // ==================== UI ACTIONS ====================

  toggleMenu(event: Event, id: number) {
    event.stopPropagation();
    if (this.menuAbiertoId === id) {
      this.menuAbiertoId = null;
    } else {
      this.menuAbiertoId = id;
    }
    this.cdr.detectChanges();
  }

  @HostListener('document:click')
  cerrarMenus() {
    this.menuAbiertoId = null;
    this.cdr.detectChanges();
  }

  cambiarVista(vista: 'tarjetas' | 'tabla') {
    this.vistaActual = vista;
    this.cdr.detectChanges();
  }

  actualizarEstadisticas() {
    this.estadisticas.total = this.usuarios.length;
    this.estadisticas.activos = this.usuarios.filter(u => u.activo).length;
    this.estadisticas.inactivos = this.estadisticas.total - this.estadisticas.activos;
    this.estadisticas.negocios = new Set(this.usuarios.map(u => u.negocio_id).filter(Boolean)).size;

    this.estadisticas.porRol = this.roles.map(rol => ({
      rol: rol.nombre,
      cantidad: this.usuarios.filter(u => u.rol_id === rol.id && u.activo).length,
      color: rol.color
    }));
  }

  // ==================== MODAL ====================

  abrirModalCrear() {
    if (!this.authService.tienePermiso('usuarios.crear')) {
      Swal.fire({
        title: '🚫 Sin Permisos',
        text: 'No tienes permisos para crear usuarios',
        icon: 'error'
      });
      return;
    }

    this.modoModal = 'crear';
    this.isSaving = false; // Reset saving state
    this.usuarioSeleccionado = null;
    this.formularioUsuario = {
      nombre: '',
      apellido: '',
      email: '',
      username: '',
      password: '',
      telefono: '',
      rol_id: this.roles.length > 0 ? this.roles[0].id! : 0,
      negocio_id: this.authService.getNegocioId() || '',
      activo: true
    };
    this.mostrarModal = true;
  }

  abrirModalEditar(usuario: Usuario) {
    if (!this.authService.tienePermiso('usuarios.editar')) {
      Swal.fire({
        title: '🚫 Sin Permisos',
        text: 'No tienes permisos para editar usuarios',
        icon: 'error'
      });
      return;
    }

    this.modoModal = 'editar';
    this.isSaving = false; // Reset saving state
    this.usuarioSeleccionado = usuario;
    this.formularioUsuario = {
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      username: usuario.username,
      password: '', // No mostrar contraseña actual
      telefono: usuario.telefono || '',
      rol_id: usuario.rol_id,
      negocio_id: usuario.negocio_id || this.authService.getNegocioId() || '',
      activo: usuario.activo
    };
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.usuarioSeleccionado = null;
    this.isSaving = false;
  }

  async guardarUsuario() {
    if (!this.validarFormulario()) return;

    this.isSaving = true;
    this.cdr.detectChanges();

    try {
      if (this.modoModal === 'crear') {
        await this.usuariosService.crearUsuario(this.formularioUsuario);
      } else {
        const datosActualizar: ActualizarUsuario = { ...this.formularioUsuario };

        // Si no se cambió la contraseña, no enviarla
        if (!datosActualizar.password?.trim()) {
          delete datosActualizar.password;
        }

        await this.usuariosService.actualizarUsuario(
          this.usuarioSeleccionado!.id!,
          datosActualizar
        );
      }

      // Éxito — cerramos primero, luego notificamos
      this.isSaving = false;
      this.cerrarModal();
      this.cdr.detectChanges();

      Swal.fire({
        title: this.modoModal === 'crear' ? '✅ Usuario Creado' : '✅ Usuario Actualizado',
        text: this.modoModal === 'crear'
          ? 'El usuario ha sido creado exitosamente'
          : 'Los datos del usuario han sido actualizados',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });

    } catch (error: any) {
      console.error('Error al guardar usuario:', error);

      // Error — igual cerramos el modal y mostramos el error
      this.isSaving = false;
      this.cerrarModal();
      this.cdr.detectChanges();

      Swal.fire({
        title: '❌ Error al Guardar',
        text: error.message || 'No se pudo guardar el usuario. Intenta nuevamente.',
        icon: 'error'
      });
    }
  }

  validarFormulario(): boolean {
    if (!this.formularioUsuario.nombre.trim()) {
      Swal.fire('⚠️ Campo Requerido', 'El nombre es obligatorio', 'warning');
      return false;
    }
    if (!this.formularioUsuario.apellido.trim()) {
      Swal.fire('⚠️ Campo Requerido', 'El apellido es obligatorio', 'warning');
      return false;
    }
    if (!this.formularioUsuario.email.trim()) {
      Swal.fire('⚠️ Campo Requerido', 'El email es obligatorio', 'warning');
      return false;
    }
    if (!this.formularioUsuario.username.trim()) {
      Swal.fire('⚠️ Campo Requerido', 'El nombre de usuario es obligatorio', 'warning');
      return false;
    }
    if (this.modoModal === 'crear' && !this.formularioUsuario.password?.trim()) {
      Swal.fire('⚠️ Campo Requerido', 'La contraseña es obligatoria', 'warning');
      return false;
    }
    if (!this.formularioUsuario.rol_id) {
      Swal.fire('⚠️ Campo Requerido', 'Debes seleccionar un rol', 'warning');
      return false;
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.formularioUsuario.email)) {
      Swal.fire('⚠️ Email Inválido', 'Por favor ingresa un email válido', 'warning');
      return false;
    }

    return true;
  }

  // ==================== ACCIONES ====================

  async cambiarEstadoUsuario(usuario: Usuario) {
    const accion = usuario.activo ? 'desactivar' : 'activar';
    const permiso = usuario.activo ? 'usuarios.eliminar' : 'usuarios.editar';

    if (!this.authService.tienePermiso(permiso)) {
      Swal.fire({
        title: '🚫 Sin Permisos',
        text: `No tienes permisos para ${accion} usuarios`,
        icon: 'error'
      });
      return;
    }

    const result = await Swal.fire({
      title: `¿${accion.charAt(0).toUpperCase() + accion.slice(1)} Usuario?`,
      text: `¿Estás seguro de ${accion} a ${usuario.nombre} ${usuario.apellido}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: accion.charAt(0).toUpperCase() + accion.slice(1),
      cancelButtonText: 'Cancelar',
      confirmButtonColor: usuario.activo ? '#ef4444' : '#10b981'
    });

    if (result.isConfirmed) {
      try {
        if (usuario.activo) {
          await this.usuariosService.desactivarUsuario(usuario.id!);
        } else {
          await this.usuariosService.activarUsuario(usuario.id!);
        }

        Swal.fire({
          title: `✅ Usuario ${accion.charAt(0).toUpperCase() + accion.slice(1)}do`,
          text: `El usuario ha sido ${accion}do exitosamente`,
          icon: 'success',
          timer: 2000,
          showConfirmButton: false
        });
      } catch (error: any) {
        console.error(`Error al ${accion} usuario:`, error);
        Swal.fire({
          title: '❌ Error',
          text: error.message || `Error al ${accion} el usuario`,
          icon: 'error'
        });
      }
    }
  }

  async resetearContrasena(usuario: Usuario) {
    if (!this.authService.tienePermiso('usuarios.editar')) {
      Swal.fire({
        title: '🚫 Sin Permisos',
        text: 'No tienes permisos para resetear contraseñas',
        icon: 'error'
      });
      return;
    }

    const { value: nuevaContrasena } = await Swal.fire({
      title: 'Resetear Contraseña',
      text: `Ingresa la nueva contraseña para ${usuario.nombre} ${usuario.apellido}`,
      input: 'password',
      inputPlaceholder: 'Nueva contraseña',
      showCancelButton: true,
      confirmButtonText: 'Resetear',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value || value.length < 6) {
          return 'La contraseña debe tener al menos 6 caracteres';
        }
        return null;
      }
    });

    if (nuevaContrasena) {
      try {
        await this.usuariosService.resetearContrasena(usuario.id!, nuevaContrasena);

        Swal.fire({
          title: '✅ Contraseña Reseteada',
          text: 'La contraseña ha sido actualizada. El usuario deberá iniciar sesión nuevamente.',
          icon: 'success'
        });
      } catch (error: any) {
        console.error('Error al resetear contraseña:', error);
        Swal.fire({
          title: '❌ Error',
          text: error.message || 'Error al resetear la contraseña',
          icon: 'error'
        });
      }
    }
  }

  // ==================== UTILIDADES ====================

  obtenerNombreRol(rolId: number): string {
    const rol = this.roles.find(r => r.id === rolId);
    return rol?.nombre || 'Sin rol';
  }

  obtenerColorRol(rolId: number): string {
    const rol = this.roles.find(r => r.id === rolId);
    return rol?.color || '#6b7280';
  }

  formatearFecha(fecha: string | undefined): string {
    if (!fecha) return 'Nunca';
    return new Date(fecha).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}