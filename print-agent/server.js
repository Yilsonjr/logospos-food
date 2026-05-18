/**
 * LogosPOS — Print Agent
 * Agente de impresión local para impresoras térmicas.
 * Soporta: Red/TCP (impresoras de red) y USB/Windows (puerto USB001, USB002, etc.)
 *
 * Instalación como servicio Windows (recomendado):
 *   Ejecutar instalar-servicio.bat como Administrador
 *
 * Ejecución manual:
 *   node server.js
 */

const http         = require('http');
const https        = require('https');
const net          = require('net');
const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

const PORT      = process.env.PRINT_AGENT_PORT || 3000;
const HTTPS_PORT = process.env.PRINT_AGENT_HTTPS_PORT || 3443;

// Certificado TLS para HTTPS (evita Mixed Content desde páginas HTTPS)
// Genera el cert con: node gen-cert.js
const CERT_DIR  = path.join(__dirname, 'certs');
const CERT_FILE = path.join(CERT_DIR, 'cert.pem');
const KEY_FILE  = path.join(CERT_DIR, 'key.pem');

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
  // Permite que páginas HTTPS accedan a este agente en red local (Chrome Private Network Access)
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
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
// Enviar bytes a impresora USB (puerto Windows: USB001, USB002, COM3...)
// Escribe ESC/POS raw directo al puerto del sistema operativo
// ============================================================

function printUsb(portName, bytes, copies = 1) {
  return new Promise((resolve, reject) => {
    const portPath = `\\\\.\\${portName}`; // ej: \\.\USB001
    const buffer   = Buffer.from(bytes);

    const writeNext = (remaining) => {
      if (remaining <= 0) { resolve(); return; }
      fs.writeFile(portPath, buffer, (err) => {
        if (err) { reject(new Error(`Error en puerto ${portName}: ${err.message}`)); return; }
        writeNext(remaining - 1);
      });
    };

    writeNext(copies);
  });
}

// ============================================================
// Listar impresoras disponibles en Windows (via PowerShell)
// ============================================================

function listarImpresoras() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-Printer | Select-Object Name,PortName,PrinterStatus | ConvertTo-Json -Compress"',
      { timeout: 5000, encoding: 'utf8', windowsHide: true }
    );
    const raw = JSON.parse(out.trim());
    // PowerShell puede devolver objeto único o array
    return Array.isArray(raw) ? raw : [raw];
  } catch (e) {
    return [];
  }
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
// Request handler compartido entre HTTP y HTTPS
// ============================================================

async function requestHandler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  // Pre-flight CORS + Private Network Access (Chrome 130+)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':          origin || '*',
      'Access-Control-Allow-Methods':         'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':         'Content-Type',
      'Access-Control-Allow-Private-Network': 'true',
    });
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

  // ── POST /print-usb ──────────────────────────────────────
  // Body: { port_name: "USB001", data: number[], copies?: number }
  if (req.method === 'POST' && req.url === '/print-usb') {
    let body;
    try { body = await readBody(req); }
    catch (e) { return json(res, 400, { error: e.message }); }

    const { port_name, data, copies = 1 } = body;
    if (!port_name || !Array.isArray(data)) {
      return json(res, 400, { error: 'Faltan campos: port_name, data (array de bytes)' });
    }

    console.log(`[USB] ${port_name} — ${data.length} bytes × ${copies} cop.`);
    try {
      await printUsb(port_name, data, parseInt(copies));
      return json(res, 200, { ok: true, bytes: data.length });
    } catch (e) {
      console.error(`[USB ERROR] ${e.message}`);
      return json(res, 502, { error: e.message });
    }
  }

  // ── GET /list-printers ───────────────────────────────────
  // Devuelve las impresoras instaladas en Windows (nombre + puerto)
  if (req.method === 'GET' && req.url === '/list-printers') {
    const impresoras = listarImpresoras();
    console.log(`[LIST] ${impresoras.length} impresoras encontradas`);
    return json(res, 200, { impresoras });
  }

  json(res, 404, { error: 'Ruta no encontrada' });
}

// ── Servidores HTTP y HTTPS usando el mismo handler ───────────
const server = http.createServer(requestHandler);

function printBanner(protocol, port, isAlt) {
  console.log(`\n🖨️  LogosPOS Print Agent — ${protocol.toUpperCase()} en ${protocol}://0.0.0.0:${port}`);
  if (isAlt) {
    console.log(`⚠️  Puerto principal ocupado. Usando ${port} en su lugar.`);
    console.log(`   Actualiza la URL del agente en la app a: ${protocol}://localhost:${port}\n`);
  }
}

// ── Servidor HTTP (fallback con puerto alternativo si está ocupado) ──
function startServer(port) {
  server.listen(port, '0.0.0.0', () => {
    printBanner('http', port, port !== Number(PORT));
    console.log(`   GET  /health        → Estado del agente`);
    console.log(`   POST /print         → { ip, puerto, data: number[], copies? }`);
    console.log(`   POST /ping          → { ip, puerto }`);
    console.log(`   POST /print-usb     → { port_name, data: number[], copies? }`);
    console.log(`   GET  /list-printers → Impresoras Windows instaladas\n`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const fallbackPort = Number(err.port || PORT) + 1;
    if (fallbackPort > Number(PORT) + 5) {
      console.error(`❌ No se pudo iniciar el agente: puertos ${PORT}–${fallbackPort - 1} ocupados.`);
      process.exit(1);
    }
    console.warn(`⚠️  Puerto ${err.port || PORT} ocupado, intentando ${fallbackPort}…`);
    startServer(fallbackPort);
  } else {
    console.error('Error del servidor:', err.message);
    process.exit(1);
  }
});

startServer(Number(PORT));

// ── Servidor HTTPS (para acceso desde apps en HTTPS sin Mixed Content) ──
// Requiere certificado: ejecuta  node gen-cert.js  para generarlo
if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
  try {
    const tlsOptions = {
      cert: fs.readFileSync(CERT_FILE),
      key:  fs.readFileSync(KEY_FILE)
    };
    const httpsServer = https.createServer(tlsOptions, requestHandler);
    httpsServer.listen(Number(HTTPS_PORT), '0.0.0.0', () => {
      printBanner('https', Number(HTTPS_PORT), false);
      console.log(`   ✅ Usa https://localhost:${HTTPS_PORT} en la app para evitar Mixed Content\n`);
    });
    httpsServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️  Puerto HTTPS ${HTTPS_PORT} ocupado — solo HTTP disponible.`);
      } else {
        console.error('Error HTTPS:', err.message);
      }
    });
  } catch (e) {
    console.warn('⚠️  No se pudo iniciar HTTPS:', e.message);
  }
} else {
  console.log(`ℹ️  HTTPS no configurado. Ejecuta  node gen-cert.js  para habilitarlo.`);
  console.log(`   Sin HTTPS, usa http://localhost:${PORT} (solo funciona desde el mismo PC).\n`);
}
