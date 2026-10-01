const form = document.querySelector('#authForm');
const handleInput = document.querySelector('#handle');
const passwordInput = document.querySelector('#password');
const message = document.querySelector('#message');
const submitButton = document.querySelector('#submitButton');
const loginTab = document.querySelector('#loginTab');
const registerTab = document.querySelector('#registerTab');
let mode = 'login';

function showMessage(text, isError = true) {
  message.textContent = text;
  message.className = `mt-5 rounded-lg border px-4 py-3 text-sm ${isError
    ? 'border-red-400/30 bg-red-400/10 text-red-200'
    : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}`;
}

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === 'register';
  submitButton.textContent = registering ? 'ACCOUNT ERSTELLEN' : 'VAULT ÖFFNEN';
  passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
  loginTab.className = registering
    ? 'flex-1 rounded-lg px-4 py-3 bg-slate-900 border border-slate-700 text-slate-400'
    : 'flex-1 rounded-lg px-4 py-3 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200';
  registerTab.className = registering
    ? 'flex-1 rounded-lg px-4 py-3 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200'
    : 'flex-1 rounded-lg px-4 py-3 bg-slate-900 border border-slate-700 text-slate-400';
  message.classList.add('hidden');
}

loginTab.addEventListener('click', () => setMode('login'));
registerTab.addEventListener('click', () => setMode('register'));

form.addEventListener('submit', async event => {
  event.preventDefault();
  submitButton.disabled = true;
  try {
    const response = await fetch(`/api/${mode === 'register' ? 'register' : 'login'}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: handleInput.value, password: passwordInput.value })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Anmeldung fehlgeschlagen.');
    window.location.replace('/game.html');
  } catch (error) {
    showMessage(error.message || 'Server derzeit nicht erreichbar.');
  } finally {
    submitButton.disabled = false;
  }
});

fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' })
  .then(response => response.json())
  .then(data => {
    if (data.success && data.authenticated) window.location.replace('/game.html');
  })
  .catch(() => {});
