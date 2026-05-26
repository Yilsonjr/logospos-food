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

const http                        = require('http');
const https                       = require('https');
const net                         = require('net');
const fs                          = require('fs');
const os                          = require('os');
const path                        = require('path');
const { execSync, spawnSync, exec } = require('child_process');

// Detectar si corre como ejecutable SEA (.exe) o como script node
let _base;
try { const { isSea } = require('node:sea'); _base = isSea() ? path.dirname(process.execPath) : __dirname; }
catch { _base = __dirname; }
const BASE_DIR = _base;

// ── Comando --gen-cert: genera certificado TLS y sale ─────────
if (process.argv.includes('--gen-cert')) {
  runGenCert();
  process.exit(0);
}

const PORT       = process.env.PRINT_AGENT_PORT       || 3000;
const HTTPS_PORT = process.env.PRINT_AGENT_HTTPS_PORT || 3443;

// Certificado TLS para HTTPS (evita Mixed Content desde páginas HTTPS)
// Genera el cert con: print-agent.exe --gen-cert
const CERT_DIR  = path.join(BASE_DIR, 'certs');
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
// Enviar bytes a impresora USB via Win32 Spooler API (OpenPrinter/WritePrinter)
// Acepta el NOMBRE de la impresora tal como aparece en Windows (ej: "POS-80").
// Usa PowerShell inline con P/Invoke — funciona con cualquier impresora
// instalada en Windows, con o sin compartir, con o sin driver TCP.
// ============================================================

function printUsb(printerName, bytes, copies = 1) {
  return new Promise((resolve, reject) => {
    // Escribir archivo temporal binario
    const tmpFile = path.join(os.tmpdir(), `logos_${Date.now()}.bin`);
    fs.writeFile(tmpFile, Buffer.from(bytes), (writeErr) => {
      if (writeErr) return reject(new Error(`Error archivo temporal: ${writeErr.message}`));

      const safeName = printerName.replace(/'/g, "''");
      const safeTmp  = tmpFile.replace(/\\/g, '\\\\');
      const n        = parseInt(copies);

      // System.Printing carga una DLL pre-compilada de Windows — sin compilación C#,
      // arranca en <1 segundo. AddJob con JobStream envía bytes RAW directamente al spooler.
      const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Printing
Add-Type -AssemblyName ReachFramework
$bytes = [System.IO.File]::ReadAllBytes('${safeTmp}')
$srv = New-Object System.Printing.LocalPrintServer
$pq  = $srv.GetPrintQueue('${safeName}')
for ($i = 0; $i -lt ${n}; $i++) {
  $job    = $pq.AddJob('LogosPOS')
  $stream = $job.JobStream
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Close()
}
Write-Output 'OK'
`.trim();

      exec(
        `powershell -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"')}"`,
        { windowsHide: true, timeout: 20000 },
        (err, stdout, stderr) => {
          try { fs.unlinkSync(tmpFile); } catch {}
          if (err || !(stdout || '').trim().endsWith('OK')) {
            const msg = (stderr || '').trim() || err?.message || 'Error desconocido';
            reject(new Error(`Error USB "${printerName}": ${msg}`));
          } else {
            resolve();
          }
        }
      );
    });
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
  // Body: { printer_name: "POS-80", data: number[], copies?: number }
  // Nota: también acepta port_name por retrocompatibilidad, pero
  // printer_name (nombre Windows) es más confiable vía spooler.
  if (req.method === 'POST' && req.url === '/print-usb') {
    let body;
    try { body = await readBody(req); }
    catch (e) { return json(res, 400, { error: e.message }); }

    const { printer_name, port_name, data, copies = 1 } = body;
    const target = printer_name || port_name;
    if (!target || !Array.isArray(data)) {
      return json(res, 400, { error: 'Faltan campos: printer_name, data (array de bytes)' });
    }

    console.log(`[USB] "${target}" — ${data.length} bytes × ${copies} cop.`);
    try {
      await printUsb(target, data, parseInt(copies));
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
  console.log(`ℹ️  HTTPS no configurado. Ejecuta:`);
  console.log(`   Como script:     node gen-cert.js`);
  console.log(`   Como ejecutable: print-agent.exe --gen-cert\n`);
}

// ============================================================
// --gen-cert: genera certificado TLS autofirmado
// Funciona tanto en modo script como en .exe SEA
// ============================================================
function runGenCert() {
  const certDir  = path.join(BASE_DIR, 'certs');
  const certFile = path.join(certDir, 'cert.pem');
  const keyFile  = path.join(certDir, 'key.pem');

  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

  console.log('\n🔐 Generando certificado TLS autofirmado...\n');

  const OPENSSL_PATHS = [
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
  ];

  let opensslBin = null;
  for (const p of OPENSSL_PATHS) {
    try {
      const r = spawnSync(p, ['version'], { encoding: 'utf8', windowsHide: true });
      if (r.status === 0 && r.stdout.includes('OpenSSL')) { opensslBin = p; break; }
    } catch {}
  }

  if (opensslBin) {
    console.log(`   Usando: ${opensslBin}`);
    execSync(
      `"${opensslBin}" req -x509 -newkey rsa:2048 -keyout "${keyFile}" -out "${certFile}" ` +
      `-days 825 -nodes -subj "/CN=localhost/O=LogosPOS/C=DO" ` +
      `-addext "subjectAltName=IP:127.0.0.1,DNS:localhost"`,
      { stdio: 'inherit', windowsHide: true }
    );
  } else {
    console.log('   OpenSSL no encontrado. Usando PowerShell...');
    const tmpPfx = path.join(certDir, '_tmp.pfx');
    const tmpPwd = 'logos_' + Date.now();

    const psCreate = `
      $cert = New-SelfSignedCertificate -Subject "CN=localhost" -DnsName "localhost" \`
        -KeyAlgorithm RSA -KeyLength 2048 -CertStoreLocation "Cert:\\CurrentUser\\My" \`
        -NotAfter (Get-Date).AddDays(825)
      $pwd = ConvertTo-SecureString "${tmpPwd}" -Force -AsPlainText
      Export-PfxCertificate -Cert $cert -FilePath "${tmpPfx.replace(/\\/g,'\\\\')}" -Password $pwd | Out-Null
      Remove-Item "Cert:\\CurrentUser\\My\\$($cert.Thumbprint)" -Force
      Write-Output "OK"`.trim();

    const r1 = spawnSync('powershell', ['-NoProfile', '-Command', psCreate], { encoding: 'utf8', windowsHide: true });
    if (!r1.stdout.includes('OK')) throw new Error(r1.stderr || 'PowerShell falló');

    const psExport = `
      $pwd = ConvertTo-SecureString "${tmpPwd}" -Force -AsPlainText
      $pfx = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
        "${tmpPfx.replace(/\\/g,'\\\\')}", $pwd,
        [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)
      $certB64 = [Convert]::ToBase64String($pfx.RawData, "InsertLineBreaks")
      Set-Content "${certFile.replace(/\\/g,'\\\\')}" "-----BEGIN CERTIFICATE-----\`n$certB64\`n-----END CERTIFICATE-----"
      $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($pfx)
      $keyB64 = [Convert]::ToBase64String($rsa.ExportRSAPrivateKey(), "InsertLineBreaks")
      Set-Content "${keyFile.replace(/\\/g,'\\\\')}" "-----BEGIN RSA PRIVATE KEY-----\`n$keyB64\`n-----END RSA PRIVATE KEY-----"
      Write-Output "DONE"`.trim();

    const r2 = spawnSync('powershell', ['-NoProfile', '-Command', psExport], { encoding: 'utf8', windowsHide: true });
    if (!r2.stdout.includes('DONE')) throw new Error(r2.stderr || 'Error exportando PEM');
    try { fs.unlinkSync(tmpPfx); } catch {}
  }

  console.log('\n✅ Certificado generado:');
  console.log(`   ${certFile}`);
  console.log(`   ${keyFile}`);
  console.log('\n📋 Próximos pasos:');
  console.log('   1. Reinicia el agente');
  console.log('   2. Abre https://localhost:3443 en Chrome → Avanzado → Continuar');
  console.log('   3. Configura https://localhost:3443 como URL del agente en la app\n');
}
