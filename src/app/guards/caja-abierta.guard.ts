import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { CajaService } from '../services/caja.service';
import { OfflineService } from '../services/offline.service';
import Swal from 'sweetalert2';

export const cajaAbiertaGuard = async () => {
  const cajaService    = inject(CajaService);
  const offlineService = inject(OfflineService);
  const router         = inject(Router);

  try {
    // Sin conexión: usar caché de localStorage
    if (!offlineService.isOnline) {
      const cached = localStorage.getItem('logos_caja_cache');
      if (cached) {
        const caja = JSON.parse(cached);
        cajaService['cajaActualSubject'].next(caja);
        console.log('📵 Guard caja: usando caché offline →', caja.id);
        return true;
      }
      // Sin caché — no se puede operar offline sin haber estado online antes
      await Swal.fire({
        title: 'Sin conexión',
        html: `<p>No hay conexión a internet y no tienes datos en caché.</p>
               <p class="text-muted small">Conéctate al menos una vez para activar el modo offline.</p>`,
        icon: 'warning',
        confirmButtonText: 'Ir al Dashboard'
      });
      router.navigate(['/dashboard']);
      return false;
    }

    // Online: verificación normal
    const caja = await cajaService.verificarCajaAbierta();

    if (!caja) {
      const result = await Swal.fire({
        title: 'Caja Cerrada',
        text: 'Debes abrir la caja antes de acceder al punto de venta',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Abrir Caja Ahora',
        cancelButtonText: 'Ir al Dashboard'
      });

      if (result.isConfirmed) {
        router.navigate(['/caja/apertura']);
      } else {
        router.navigate(['/dashboard']);
      }
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error al verificar caja:', error);

    // Si el error es de red, intentar con caché
    const cached = localStorage.getItem('logos_caja_cache');
    if (cached) {
      console.warn('⚠️ Guard caja: error de red, usando caché');
      return true;
    }

    router.navigate(['/dashboard']);
    return false;
  }
};
