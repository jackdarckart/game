export async function loadLeaderboard() {
  const target = document.querySelector('#leaderboard');
  try {
    const response = await fetch('/api/leaderboard', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Leaderboard unavailable');
    const data = await response.json();
    if (!data.success || !Array.isArray(data.leaderboard)) throw new Error('Invalid leaderboard');
    if (!data.leaderboard.length) {
      target.textContent = 'Noch keine öffentlichen Einträge.';
      return;
    }
    target.innerHTML = data.leaderboard.map((entry, index) => `
      <div class="flex items-center justify-between rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-2">
        <span class="text-slate-300">${index + 1}. ${escapeHtml(entry.handle)}</span>
        <span class="text-cyan-300">${Number(entry.vibeScore || 0).toLocaleString('de-DE')}</span>
      </div>`).join('');
  } catch {
    target.textContent = 'Leaderboard derzeit nicht verfügbar.';
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}
