/**
 * LogosPOS — Print Agent
 * Agente de impresión local para impresoras térmicas de red (ESC/POS sobre TCP).
 *
 * Instalación como servicio Windows (recomendado):
 *   Ejecutar instalar-servicio.bat como Administrador
 *
 * Ejecución manual (desarrollo):
 *   npm install
 *   node server.js
 */

const http = require('http');
const net  = require('net');

const PORT = process.env.PRINT_AGENT_PORT || 3000;

// Orígenes permitidos (la app Angular en producción y desarrollo)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',');

// ============================================================
// Helpers
// ============================================================

function setCors(res, origin) {
  const allow = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)
    ? (origin || '*')
    : '';
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end',  ()    => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error('Body JSON inválido')); }
    });
    req.on('error', reject);
  });
}

// ============================================================
// Enviar bytes a impresora via TCP raw
// ============================================================

function printRaw(ip, puerto, bytes, copies = 1) {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(bytes);
    const socket = new net.Socket();
    let sent = 0;

    socket.setTimeout(6000);

    socket.connect(puerto, ip, () => {
      const sendNext = () => {
        if (sent >= copies) {
          socket.end();
          return;
        }
        socket.write(buffer, () => { sent++; sendNext(); });
      };
      sendNext();
    });

    socket.on('close', resolve);
    socket.on('timeout', () => { socket.destroy(); reject(new Error(`Timeout conectando a ${ip}:${puerto}`)); });
    socket.on('error',  (err) => reject(new Error(`TCP error (${ip}:${puerto}): ${err.message}`)));
  });
}

// ============================================================
// Verificar si el puerto TCP está abierto (ping)
// ============================================================

function pingPrinter(ip, puerto) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.connect(puerto, ip, () => { socket.destroy(); resolve(true); });
    socket.on('error',   () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

// ============================================================
// Servidor HTTP
// ============================================================

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  // Pre-flight CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── GET /health ──────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { status: 'ok', agent: 'LogosPOS Print Agent', version: '1.0.0' });
  }

  // ── POST /print ──────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/print') {
    let body;
    try { body = await readBody(req); }
    catch (e) { return json(res, 400, { error: e.message }); }

    const { ip, puerto = 9100, data, copies = 1 } = body;

    if (!ip || !Array.isArray(data)) {
      return json(res, 400, { error: 'Faltan campos: ip, data (array de bytes)' });
    }

    console.log(`[PRINT] ${ip}:${puerto} — ${data.length} bytes × ${copies} cop.`);

    try {
      await printRaw(ip, parseInt(puerto), data, parseInt(copies));
      return json(res, 200, { ok: true, bytes: data.length });
    } catch (e) {
      console.error(`[PRINT ERROR] ${e.message}`);
      return json(res, 502, { error: e.message });
    }
  }

  // ── POST /ping ───────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/ping') {
    let body;
    try { body = await readBody(req); }
    catch (e) { return json(res, 400, { error: e.message }); }

    const { ip, puerto = 9100 } = body;
    if (!ip) return json(res, 400, { error: 'Falta el campo: ip' });

    const ok = await pingPrinter(ip, parseInt(puerto));
    console.log(`[PING] ${ip}:${puerto} → ${ok ? 'OK' : 'FAIL'}`);
    return json(res, ok ? 200 : 502, { ok, ip, puerto });
  }

  json(res, 404, { error: 'Ruta no encontrada' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🖨️  LogosPOS Print Agent corriendo en http://0.0.0.0:${PORT}`);
  console.log(`   Rutas disponibles:`);
  console.log(`   GET  /health   → Estado del agente`);
  console.log(`   POST /print    → { ip, puerto, data: number[], copies? }`);
  console.log(`   POST /ping     → { ip, puerto } → verifica si la impresora responde\n`);
});
