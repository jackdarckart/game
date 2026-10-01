import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearSessionCookie,
  createSession,
  getSessionUserId,
  makeSessionCookie,
  newUser,
  rateLimitLogin,
  revokeSession,
  validateHandle,
  validatePassword,
  verifyPassword
} from './auth.js';
import { defaultGameState, getVault, saveVault } from './vault.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const PRODUCTION = process.env.NODE_ENV === 'production';
const MAX_BODY_BYTES = 256 * 1024;
let usersCache = null;
let userWriteQueue = Promise.resolve();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function ensureDataDir() {
  mkdirSync(DATA_DIR, { recursive: true });
}

function loadUsers() {
  if (usersCache) return usersCache;
  ensureDataDir();
  if (!existsSync(USERS_FILE)) {
    usersCache = [];
    return usersCache;
  }
  const parsed = JSON.parse(readFileSync(USERS_FILE, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('users.json ist ungültig.');
  usersCache = parsed;
  return usersCache;
}

function queueUserWrite() {
  const snapshot = JSON.stringify(usersCache ?? [], null, 2);
  userWriteQueue = userWriteQueue.then(async () => {
    ensureDataDir();
    const temp = `${USERS_FILE}.${process.pid}.tmp`;
    writeFileSync(temp, snapshot, { encoding: 'utf8', mode: 0o600 });
    renameSync(temp, USERS_FILE);
  });
  return userWriteQueue;
}

function findUserByHandle(handle) {
  const wanted = String(handle ?? '').trim().toLowerCase();
  return loadUsers().find(user => String(user.handle).toLowerCase() === wanted) ?? null;
}

function findUserById(id) {
  return loadUsers().find(user => user.id === id) ?? null;
}

function getClientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

function sendText(res, status, text, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    ...headers
  });
  res.end(text);
}

function setCommonSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (PRODUCTION) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

function originIsAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readBody(req) {
  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function requireAuth(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    sendJson(res, 401, { success: false, error: 'Nicht authentifiziert.' });
    return null;
  }
  const user = findUserById(userId);
  if (!user) {
    sendJson(res, 401, { success: false, error: 'Sitzung ungültig.' });
    return null;
  }
  return user;
}

function sanitizeGameState(input, handle) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('INVALID_STATE');
  }
  const jsonSize = Buffer.byteLength(JSON.stringify(input), 'utf8');
  if (jsonSize > 200 * 1024) throw new Error('STATE_TOO_LARGE');
  const clone = structuredClone(input);
  clone.version = 1;
  clone.handle = handle;
  return clone;
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { success: true, service: 'singularity-arcade', status: 'online' });
  }

  if (req.method === 'GET' && url.pathname === '/api/session') {
    const userId = getSessionUserId(req);
    const user = userId ? findUserById(userId) : null;
    return sendJson(res, 200, user
      ? { success: true, authenticated: true, user: { handle: user.handle } }
      : { success: true, authenticated: false });
  }

  if (req.method === 'POST' && url.pathname === '/api/register') {
    if (!originIsAllowed(req)) return sendJson(res, 403, { success: false, error: 'Ungültige Herkunft.' });
    let body;
    try { body = await readBody(req); } catch (error) {
      return sendJson(res, error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, { success: false, error: 'Ungültige Anfrage.' });
    }
    const handle = String(body.handle ?? '').trim();
    const password = body.password;
    if (!validateHandle(handle)) return sendJson(res, 400, { success: false, error: 'Der Accountname muss 3–24 Zeichen lang sein und darf nur Buchstaben, Zahlen und _ enthalten.' });
    if (!validatePassword(password)) return sendJson(res, 400, { success: false, error: 'Das Passwort muss 10–200 Zeichen lang sein.' });
    if (findUserByHandle(handle)) return sendJson(res, 409, { success: false, error: 'Dieser Accountname ist bereits vergeben.' });
    const user = newUser(handle, password);
    loadUsers().push(user);
    await queueUserWrite();
    const session = createSession(user.id);
    return sendJson(res, 201, { success: true, user: { handle: user.handle } }, {
      'Set-Cookie': makeSessionCookie(session.token, session.maxAge, PRODUCTION)
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (!originIsAllowed(req)) return sendJson(res, 403, { success: false, error: 'Ungültige Herkunft.' });
    if (!rateLimitLogin(getClientIp(req))) return sendJson(res, 429, { success: false, error: 'Zu viele Loginversuche. Bitte später erneut versuchen.' });
    let body;
    try { body = await readBody(req); } catch (error) {
      return sendJson(res, error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, { success: false, error: 'Ungültige Anfrage.' });
    }
    const user = findUserByHandle(body.handle);
    if (!user || !verifyPassword(String(body.password ?? ''), user.passwordHash)) {
      return sendJson(res, 401, { success: false, error: 'Accountname oder Passwort ist falsch.' });
    }
    const session = createSession(user.id);
    return sendJson(res, 200, { success: true, user: { handle: user.handle } }, {
      'Set-Cookie': makeSessionCookie(session.token, session.maxAge, PRODUCTION)
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    if (!originIsAllowed(req)) return sendJson(res, 403, { success: false, error: 'Ungültige Herkunft.' });
    const cookies = req.headers.cookie || '';
    const match = cookies.match(/(?:^|;\s*)vault_session=([^;]*)/);
    if (match) revokeSession(decodeURIComponent(match[1]));
    return sendJson(res, 200, { success: true }, { 'Set-Cookie': clearSessionCookie(PRODUCTION) });
  }

  if (url.pathname === '/api/vault' && (req.method === 'GET' || req.method === 'PUT' || req.method === 'POST')) {
    const user = requireAuth(req, res);
    if (!user) return;
    if (req.method === 'GET') {
      const vault = getVault(user.id, user.handle);
      return sendJson(res, 200, { success: true, vault });
    }
    if (!originIsAllowed(req)) return sendJson(res, 403, { success: false, error: 'Ungültige Herkunft.' });
    let body;
    try { body = await readBody(req); } catch (error) {
      return sendJson(res, error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, { success: false, error: 'Ungültige Anfrage.' });
    }
    try {
      const state = sanitizeGameState(body.state ?? body, user.handle);
      const vault = await saveVault(user.id, user.handle, state);
      return sendJson(res, 200, { success: true, vault });
    } catch (error) {
      const status = error.message === 'STATE_TOO_LARGE' ? 413 : 400;
      return sendJson(res, status, { success: false, error: 'Der Spielstand ist ungültig oder zu groß.' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
    const users = loadUsers();
    const entries = [];
    for (const user of users) {
      try {
        const vault = getVault(user.id, user.handle);
        const score = Number(vault.gameState?.vibeScore || 0);
        entries.push({ handle: user.handle, vibeScore: Number.isFinite(score) ? score : 0 });
      } catch {
        // A damaged individual vault is not allowed to break the public endpoint.
      }
    }
    entries.sort((a, b) => b.vibeScore - a.vibeScore);
    return sendJson(res, 200, { success: true, leaderboard: entries.slice(0, 20) });
  }

  return sendJson(res, 404, { success: false, error: 'API-Endpunkt nicht gefunden.' });
}

async function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendText(res, 400, 'Bad Request');
  }
  if (pathname === '/') pathname = '/index.html';
  const candidate = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (candidate !== PUBLIC_DIR && !candidate.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    return sendText(res, 403, 'Forbidden');
  }
  let filePath = candidate;
  try {
    const stat = await import('node:fs/promises').then(fs => fs.stat(filePath));
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    const content = readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const cache = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': content.length,
      'Cache-Control': cache
    });
    return res.end(content);
  } catch {
    return sendText(res, 404, 'Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  setCommonSecurityHeaders(res);
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method Not Allowed');
    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { success: false, error: 'Interner Serverfehler.' });
    else res.end();
  }
});

ensureDataDir();
loadUsers();

server.listen(PORT, HOST, () => {
  console.log(`Singularity Arcade läuft auf http://${HOST}:${PORT}`);
  console.log('Account-Vault: serverseitig, verschlüsselt und pro Account getrennt.');
});
