import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data');
const VAULT_FILE = path.join(DATA_DIR, 'vaults.enc');
const KEY_FILE = path.join(DATA_DIR, '.vault-key');
let cachedKey = null;
let vaultCache = null;
let writeQueue = Promise.resolve();

function ensureDataDir() {
  mkdirSync(DATA_DIR, { recursive: true });
}

function getKey() {
  if (cachedKey) return cachedKey;
  ensureDataDir();
  const envKey = process.env.VAULT_ENCRYPTION_KEY?.trim();
  if (envKey) {
    if (!/^[0-9a-fA-F]{64}$/.test(envKey)) {
      throw new Error('VAULT_ENCRYPTION_KEY muss genau 64 Hex-Zeichen enthalten.');
    }
    cachedKey = Buffer.from(envKey, 'hex');
    return cachedKey;
  }
  if (existsSync(KEY_FILE)) {
    const raw = readFileSync(KEY_FILE);
    if (raw.length !== 32) throw new Error('Der lokale Vault-Schlüssel ist beschädigt.');
    cachedKey = raw;
    return cachedKey;
  }
  cachedKey = randomBytes(32);
  writeFileSync(KEY_FILE, cachedKey, { mode: 0o600 });
  return cachedKey;
}

function encryptObject(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  });
}

function decryptObject(serialized) {
  const envelope = JSON.parse(serialized);
  if (envelope.version !== 1) throw new Error('Unbekannte Vault-Version.');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

function loadVaults() {
  if (vaultCache) return vaultCache;
  ensureDataDir();
  if (!existsSync(VAULT_FILE)) {
    vaultCache = {};
    return vaultCache;
  }
  try {
    vaultCache = decryptObject(readFileSync(VAULT_FILE, 'utf8'));
    if (!vaultCache || typeof vaultCache !== 'object' || Array.isArray(vaultCache)) {
      throw new Error('Vault-Datei enthält kein gültiges Objekt.');
    }
    return vaultCache;
  } catch (error) {
    throw new Error(`Vault konnte nicht gelesen werden: ${error.message}`);
  }
}

function queueWrite() {
  const snapshot = JSON.stringify(vaultCache ?? {});
  writeQueue = writeQueue.then(async () => {
    ensureDataDir();
    const encrypted = encryptObject(JSON.parse(snapshot));
    const tempFile = `${VAULT_FILE}.${process.pid}.tmp`;
    writeFileSync(tempFile, encrypted, { encoding: 'utf8', mode: 0o600 });
    renameSync(tempFile, VAULT_FILE);
  });
  return writeQueue;
}

export function defaultGameState(handle = '') {
  return {
    version: 1,
    handle,
    vibeScore: 0,
    fragments: 25,
    alloys: 5,
    upgrades: {
      resonance: 1,
      mining: 1,
      efficiency: 1
    },
    treeNodes: [],
    jukebox: {
      unlocked: false,
      track: 'VOID PULSE'
    },
    stats: {
      sessions: 0,
      fragmentsMined: 0,
      alloysForged: 0
    }
  };
}

export function getVault(userId, handle) {
  const vaults = loadVaults();
  if (!vaults[userId]) {
    vaults[userId] = {
      version: 1,
      handle,
      gameState: defaultGameState(handle),
      updatedAt: new Date().toISOString()
    };
  }
  return structuredClone(vaults[userId]);
}

export async function saveVault(userId, handle, gameState) {
  const vaults = loadVaults();
  vaults[userId] = {
    version: 1,
    handle,
    gameState,
    updatedAt: new Date().toISOString()
  };
  await queueWrite();
  return structuredClone(vaults[userId]);
}
