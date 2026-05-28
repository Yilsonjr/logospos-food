// ============================================================
// LOGOSPOS — Edge Function: auth-login
// Verifica credenciales server-side y devuelve JWT firmado
// con el secret de Supabase para que las políticas RLS funcionen.
//
// Variables de entorno disponibles automáticamente en Supabase:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as bcrypt from 'npm:bcryptjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── JWT HS256 usando Web Crypto (sin dependencias externas) ──
async function firmarJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const b64url = (data: string) =>
    btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const header  = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body    = b64url(JSON.stringify(payload))
  const mensaje = `${header}.${body}`

  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(mensaje))
  const firmaB64 = b64url(String.fromCharCode(...new Uint8Array(firma)))

  return `${mensaje}.${firmaB64}`
}

// ── Handler principal ────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405)
  }

  try {
    const { username, password, recordar = false } = await req.json()

    if (!username?.trim() || !password?.trim()) {
      return json({ error: 'Usuario y contraseña requeridos' }, 400)
    }

    // Cliente con service_role — nunca sale del servidor
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── 1. Buscar usuario ────────────────────────────────────
    const { data: usuario, error: errUsuario } = await supabase
      .from('usuarios')
      .select('*, rol:roles(*)')
      .or(`username.eq.${username},email.eq.${username}`)
      .eq('activo', true)
      .single()

    if (errUsuario || !usuario) {
      return json({ error: 'Usuario no encontrado o inactivo' }, 401)
    }

    // ── 2. Verificar contraseña (server-side, hash nunca sale) ──
    const passwordValida: boolean = await bcrypt.compare(password, usuario.password)
    if (!passwordValida) {
      return json({ error: 'Contraseña incorrecta' }, 401)
    }

    // ── 3. empresa_id (Phase 3 — multisucursal, columna aún no existe) ────
    // TODO: cuando se agregue la columna ejecutar:
    //   ALTER TABLE negocios ADD COLUMN IF NOT EXISTS empresa_id UUID DEFAULT NULL;
    // y cambiar la siguiente línea por una query real.
    const empresa_id: string | null = null

    const isSuperAdmin = ['Super Admin', 'Desarrollador', 'Developer', 'Super Administrador'].includes(
      usuario.rol?.nombre ?? ''
    )

    // ── 4. Crear sesión en BD ─────────────────────────────────
    const sessionToken  = crypto.randomUUID()
    const horasSession  = recordar ? 24 * 7 : 8
    const expiracion    = new Date()
    expiracion.setHours(expiracion.getHours() + horasSession)

    const { error: errSesion } = await supabase.from('sesiones').insert({
      usuario_id:       usuario.id,
      token:            sessionToken,
      fecha_inicio:     new Date().toISOString(),
      fecha_expiracion: expiracion.toISOString(),
      activa:           true,
    })
    if (errSesion) console.error('[auth-login] Error insertando sesión:', errSesion)

    const { error: errUpdate } = await supabase.from('usuarios')
      .update({ ultimo_acceso: new Date().toISOString() })
      .eq('id', usuario.id)
    if (errUpdate) console.error('[auth-login] Error actualizando ultimo_acceso:', errUpdate)

    // ── 5. Firmar JWT con el secret de Supabase ───────────────
    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET')!
    console.log('[auth-login] jwtSecret presente:', !!jwtSecret)
    const ahora     = Math.floor(Date.now() / 1000)

    const jwt = await firmarJWT({
      // Claims estándar PostgREST
      iss:  'supabase',
      sub:  String(usuario.id),
      role: 'authenticated',          // activa políticas RLS "authenticated"
      iat:  ahora,
      exp:  ahora + horasSession * 3600,

      // Claims personalizados para RLS multi-tenant
      negocio_id:     usuario.negocio_id,
      empresa_id:     empresa_id,  // Phase 3: null hasta implementar multisucursal
      usuario_id:     usuario.id,
      rol_nombre:     usuario.rol?.nombre ?? '',
      is_super_admin: isSuperAdmin,
    }, jwtSecret)

    // ── 6. Respuesta — sin exponer el password ────────────────
    const { password: _pw, ...usuarioSeguro } = usuario

    return json({
      jwt,
      token:      sessionToken,
      expiracion: expiracion.toISOString(),
      usuario:    usuarioSeguro,
    }, 200)

  } catch (err: any) {
    console.error('[auth-login] Error:', err?.message ?? err)
    console.error('[auth-login] Stack:', err?.stack ?? 'sin stack')
    return json({ error: 'Error interno del servidor', detalle: err?.message ?? String(err) }, 500)
  }
})

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
