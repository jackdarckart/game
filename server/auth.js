import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const PASSWORD_KEY_LENGTH = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();

function normalizeHandle(handle) {
  return String(handle ?? '').trim();
}

export function validateHandle(handle) {
  const value = normalizeHandle(handle);
  return /^[A-Za-z0-9_]{3,24}$/.test(value);
}

export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 10 && password.length <= 200;
}

function passwordHash(password, salt = randomBytes(16)) {
  const derived = scryptSync(password, salt, PASSWORD_KEY_LENGTH, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024
  });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function hashPassword(password) {
  return passwordHash(password);
}

export function verifyPassword(password, storedHash) {
  try {
    const parts = String(storedHash).split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 32 * 1024 * 1024
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function cleanupSessions() {
  const now = Date.now();
  for (const [hash, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(hash);
  }
}

export function createSession(userId) {
  cleanupSessions();
  const token = randomBytes(32).toString('base64url');
  sessions.set(tokenHash(token), { userId, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
  return { token, maxAge: Math.floor(SESSION_TTL_MS / 1000) };
}

export function revokeSession(token) {
  if (token) sessions.delete(tokenHash(token));
}

export function getUserIdFromToken(token) {
  cleanupSessions();
  if (!token) return null;
  const session = sessions.get(tokenHash(token));
  if (!session || session.expiresAt <= Date.now()) return null;
  return session.userId;
}

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = '';
      }
    }
  }
  return cookies;
}

export function getSessionUserId(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return getUserIdFromToken(cookies.vault_session);
}

export function makeSessionCookie(token, maxAge, secure) {
  return `vault_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure) {
  return `vault_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function rateLimitLogin(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const maxAttempts = 12;
  const record = loginAttempts.get(ip);
  if (!record || now - record.startedAt >= windowMs) {
    loginAttempts.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  record.count += 1;
  return record.count <= maxAttempts;
}

export function newUser(handle, password) {
  return {
    id: randomUUID(),
    handle: normalizeHandle(handle),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export { SESSION_TTL_MS };
