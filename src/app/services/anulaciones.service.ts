import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Anulacion, MotivoAnulacion } from '../models/anulaciones.model';

@Injectable({ providedIn: 'root' })
export class AnulacionesService {

  constructor(
    private supabaseService: SupabaseService,
    private authService: AuthService
  ) {}

  // ── Anulaciones ────────────────────────────────────────────

  async anularVenta(
    ventaId: number,
    motivoCategoria: MotivoAnulacion,
    motivoDetalle?: string
  ): Promise<{ ok: boolean; ncf_b04: string | null }> {
    const negocioId = this.authService.getNegocioId();

    const { data, error } = await this.supabaseService.client.rpc(
      'anular_venta_completa',
      {
        p_venta_id:          ventaId,
        p_motivo_categoria:  motivoCategoria,
        p_motivo_detalle:    motivoDetalle || null,
        p_usuario_id:        null,
        p_negocio_id:        negocioId
      }
    );

    if (error) throw new Error(error.message);
    return data as { ok: boolean; ncf_b04: string | null };
  }

  async anularOrden(
    paymentId: string,
    motivoCategoria: MotivoAnulacion,
    motivoDetalle?: string
  ): Promise<{ ok: boolean; ncf_b04: string | null }> {
    const negocioId = this.authService.getNegocioId();
    console.log('[anularOrden] paymentId:', paymentId, '| negocioId:', negocioId);

    const { data, error } = await this.supabaseService.client.rpc(
      'anular_orden_restaurante',
      {
        p_payment_id:        paymentId,
        p_motivo_categoria:  motivoCategoria,
        p_motivo_detalle:    motivoDetalle || null,
        p_usuario_id:        null,
        p_negocio_id:        negocioId
      }
    );

    if (error) throw new Error(error.message);
    return data as { ok: boolean; ncf_b04: string | null };
  }

  async obtenerAnulaciones(mes: number, anio: number): Promise<Anulacion[]> {
    const negocioId = this.authService.getNegocioId();
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const hasta = new Date(anio, mes, 1).toISOString().split('T')[0];

    const { data, error } = await this.supabaseService.client
      .from('anulaciones')
      .select('*')
      .eq('negocio_id', negocioId)
      .gte('created_at', desde)
      .lt('created_at', hasta)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data || []) as Anulacion[];
  }

  // ── Exportaciones DGII ─────────────────────────────────────

  async exportar607(mes: number, anio: number): Promise<void> {
    const negocioId = this.authService.getNegocioId();
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const hasta = new Date(anio, mes, 1).toISOString().split('T')[0];

    const { data, error } = await this.supabaseService.client
      .from('ventas')
      .select('numero_venta, ncf, tipo_ncf, rnc_cliente, nombre_cliente_fiscal, subtotal, impuestos, total, metodo_pago, created_at')
      .eq('negocio_id', negocioId)
      .eq('estado', 'completada')
      .not('ncf', 'is', null)
      .gte('created_at', desde)
      .lt('created_at', hasta)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    const filas = (data || []).map(v => [
      this.formatFechaDGII(v.created_at),
      v.ncf || '',
      v.tipo_ncf || '',
      v.rnc_cliente || '',
      v.nombre_cliente_fiscal || 'CONSUMIDOR FINAL',
      v.subtotal?.toFixed(2) || '0.00',
      v.impuestos?.toFixed(2) || '0.00',
      v.total?.toFixed(2) || '0.00',
    ].join('|'));

    const encabezado = 'FECHA|NCF|TIPO_NCF|RNC_CLIENTE|NOMBRE_CLIENTE|SUBTOTAL|ITBIS|TOTAL';
    this.descargarCSV(`607_${anio}${String(mes).padStart(2, '0')}.txt`, [encabezado, ...filas]);
  }

  async exportar608(mes: number, anio: number): Promise<void> {
    const anulaciones = await this.obtenerAnulaciones(mes, anio);

    const filas = anulaciones.map(a => [
      this.formatFechaDGII(a.created_at),
      a.ncf_original || '',
      a.tipo_ncf_original || '',
      a.ncf_nota_credito || '',
      a.motivo_categoria,
      a.motivo_detalle || '',
    ].join('|'));

    const encabezado = 'FECHA|NCF_ORIGINAL|TIPO_NCF|NCF_NOTA_CREDITO|MOTIVO|DETALLE';
    this.descargarCSV(`608_${anio}${String(mes).padStart(2, '0')}.txt`, [encabezado, ...filas]);
  }

  async exportar606(mes: number, anio: number): Promise<void> {
    const negocioId = this.authService.getNegocioId();
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const hasta = new Date(anio, mes, 1).toISOString().split('T')[0];

    const { data, error } = await this.supabaseService.client
      .from('compras')
      .select('ncf, tipo_ncf, proveedor_id, proveedores(nombre, rnc), subtotal, impuesto_monto, total, created_at')
      .eq('negocio_id', negocioId)
      .not('ncf', 'is', null)
      .gte('created_at', desde)
      .lt('created_at', hasta)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    const filas = (data || []).map((c: any) => [
      this.formatFechaDGII(c.created_at),
      c.ncf || '',
      c.tipo_ncf || '',
      c.proveedores?.rnc || '',
      c.proveedores?.nombre || '',
      c.subtotal?.toFixed(2) || '0.00',
      c.impuesto_monto?.toFixed(2) || '0.00',
      c.total?.toFixed(2) || '0.00',
    ].join('|'));

    const encabezado = 'FECHA|NCF|TIPO_NCF|RNC_PROVEEDOR|NOMBRE_PROVEEDOR|SUBTOTAL|ITBIS|TOTAL';
    this.descargarCSV(`606_${anio}${String(mes).padStart(2, '0')}.txt`, [encabezado, ...filas]);
  }

  // ── Helpers ────────────────────────────────────────────────

  private formatFechaDGII(iso?: string): string {
    if (!iso) return '';
    return iso.substring(0, 10).replace(/-/g, '');  // YYYYMMDD
  }

  private descargarCSV(nombre: string, filas: string[]): void {
    const blob = new Blob([filas.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }
}
