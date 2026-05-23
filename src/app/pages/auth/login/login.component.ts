import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { LoginCredentials } from '../../../models/usuario.model';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  credentials: LoginCredentials = {
    username: '',
    password: '',
    recordar: false
  };

  isLoading = false;
  showPassword = false;
  hasError = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Si ya está autenticado, redirigir según rol
    if (this.authService.isAuthenticated) {
      this.redirigirSegunRol();
    }
  }

  private redirigirSegunRol() {
    if (this.authService.isSuperAdmin()) {
      this.router.navigate(['/admin/developer/negocios']);
      return;
    }
    const rol = this.authService.usuarioActual?.rol?.nombre;
    if (rol === 'Cajero' || rol === 'Cajero Restaurante') {
      this.router.navigate(['/ventas/mesas']);
    } else if (rol === 'Mesero') {
      this.router.navigate(['/restaurante']);
    } else if (rol === 'Cocinero') {
      this.router.navigate(['/restaurante/cocina']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  async onSubmit() {
    this.hasError = false;

    if (!this.credentials.username.trim() || !this.credentials.password.trim()) {
      this.hasError = true;

      // Trigger shake animation
      setTimeout(() => this.hasError = false, 600);

      await Swal.fire({
        title: '⚠️ Campos Requeridos',
        text: 'Por favor ingresa tu usuario y contraseña',
        icon: 'warning',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    this.isLoading = true;

    try {
      await this.authService.login(this.credentials);

      await Swal.fire({
        title: '✅ Bienvenido',
        text: 'Has iniciado sesión exitosamente',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });

      this.redirigirSegunRol();

    } catch (error: any) {
      // Resetear el estado de loading ANTES de mostrar el error
      this.isLoading = false;
      this.hasError = true;

      // Forzar detección de cambios para actualizar la UI inmediatamente
      this.cdr.detectChanges();

      // Remove error state after animation
      setTimeout(() => this.hasError = false, 600);

      await Swal.fire({
        title: '❌ Error de Acceso',
        text: error.message || 'Credenciales incorrectas',
        icon: 'error',
        confirmButtonText: 'Intentar de Nuevo',
        confirmButtonColor: '#ef4444'
      });
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
}