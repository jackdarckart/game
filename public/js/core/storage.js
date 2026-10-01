import { events } from './events.js';

let engineRef = null;
let timer = null;
let saveInProgress = false;
let saveQueued = false;

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export async function loadVaultState() {
  const response = await fetch('/api/vault', {
    credentials: 'same-origin',
    cache: 'no-store'
  });
  if (response.status === 401) {
    window.location.replace('/');
    return null;
  }
  if (!response.ok) throw new Error('Vault konnte nicht geladen werden.');
  const data = await response.json();
  if (!data.success || !data.vault) throw new Error('Ungültige Vault-Antwort.');
  return data.vault;
}

export function initStorage(engine) {
  engineRef = engine;
  if (timer) clearInterval(timer);
  timer = window.setInterval(() => saveVaultState(), 10000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendBeaconSave();
  });
  window.addEventListener('beforeunload', sendBeaconSave);
}

export async function saveVaultState(options = {}) {
  if (!engineRef) return false;
  if (saveInProgress) {
    saveQueued = true;
    return false;
  }
  saveInProgress = true;
  const state = cloneState(engineRef.state);
  try {
    const response = await fetch('/api/vault', {
      method: 'PUT',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: Boolean(options.keepalive),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    if (response.status === 401) {
      window.location.replace('/');
      return false;
    }
    if (!response.ok) throw new Error('Speichern fehlgeschlagen.');
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Speichern fehlgeschlagen.');
    events.emit('vault:saved', data.vault);
    return true;
  } catch (error) {
    events.emit('vault:error', error);
    return false;
  } finally {
    saveInProgress = false;
    if (saveQueued) {
      saveQueued = false;
      queueMicrotask(() => saveVaultState());
    }
  }
}

function sendBeaconSave() {
  if (!engineRef || !navigator.sendBeacon) return;
  try {
    const state = cloneState(engineRef.state);
    const blob = new Blob([JSON.stringify({ state })], { type: 'application/json' });
    navigator.sendBeacon('/api/vault', blob);
  } catch {
    // Normaler fetch-Autosave bleibt die Hauptspeicherung.
  }
}
