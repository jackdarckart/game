import { events } from './events.js';
import { initStorage, loadVaultState, saveVaultState } from './storage.js';
import { createRenderer } from './renderer.js';
import { createVibeModule } from '../modules/vibe.js';
import { createMiningModule } from '../modules/mining.js';
import { createTreeModule } from '../modules/tree.js';
import { createJukeboxModule } from '../modules/jukebox.js';
import { loadLeaderboard } from '../modules/leaderboard.js';

const defaults = {
  version: 1,
  handle: '',
  vibeScore: 0,
  fragments: 25,
  alloys: 5,
  upgrades: { resonance: 1, mining: 1, efficiency: 1 },
  treeNodes: [],
  jukebox: { unlocked: false, track: 'VOID PULSE' },
  stats: { sessions: 0, fragmentsMined: 0, alloysForged: 0 }
};

export class GameEngine {
  constructor(state) {
    this.state = {
      ...defaults,
      ...state,
      upgrades: { ...defaults.upgrades, ...(state?.upgrades || {}) },
      jukebox: { ...defaults.jukebox, ...(state?.jukebox || {}) },
      stats: { ...defaults.stats, ...(state?.stats || {}) },
      treeNodes: Array.isArray(state?.treeNodes) ? [...state.treeNodes] : []
    };
    this.modules = {};
    this.renderer = null;
  }

  async start() {
    const canvas = document.querySelector('#gameCanvas');
    this.renderer = createRenderer(canvas, this);
    this.modules.vibe = createVibeModule(this);
    this.modules.mining = createMiningModule(this);
    this.modules.tree = createTreeModule(this);
    this.modules.jukebox = createJukeboxModule(this);

    this.modules.vibe.init();
    this.modules.mining.init();
    this.modules.tree.init();
    this.modules.jukebox.init();

    this.state.stats.sessions += 1;
    this.bindUi();
    initStorage(this);
    this.render();
    await loadLeaderboard();
    events.emit('engine:ready', this);
  }

  bindUi() {
    document.querySelector('#mineButton').addEventListener('click', () => this.modules.mining.mine());
    document.querySelector('#resonanceButton').addEventListener('click', () => this.modules.vibe.resonate());
    document.querySelector('#treeButton').addEventListener('click', () => this.modules.tree.unlockNext());
    document.querySelector('#jukeboxButton').addEventListener('click', () => this.modules.jukebox.toggle());
    document.querySelector('#saveButton').addEventListener('click', async () => {
      const button = document.querySelector('#saveButton');
      button.disabled = true;
      await saveVaultState();
      button.disabled = false;
    });
    document.querySelector('#logoutButton').addEventListener('click', async () => {
      await saveVaultState();
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
      window.location.replace('/');
    });
  }

  render() {
    const s = this.state;
    document.querySelector('#accountHandle').textContent = s.handle || 'ACCOUNT';
    document.querySelector('#vibeScore').textContent = Math.floor(s.vibeScore).toLocaleString('de-DE');
    document.querySelector('#fragments').textContent = Math.floor(s.fragments).toLocaleString('de-DE');
    document.querySelector('#alloys').textContent = Math.floor(s.alloys).toLocaleString('de-DE');
    document.querySelector('#resonance').textContent = s.upgrades.resonance;
    document.querySelector('#upgradeResonance').textContent = s.upgrades.resonance;
    document.querySelector('#upgradeMining').textContent = s.upgrades.mining;
    document.querySelector('#upgradeEfficiency').textContent = s.upgrades.efficiency;
    document.querySelector('#engineMessage').textContent = `${s.treeNodes.length} Nodes synchronisiert`;
    this.renderer?.render();
  }

  addVibe(amount) {
    this.state.vibeScore = Math.max(0, this.state.vibeScore + amount);
    this.render();
  }

  addFragments(amount) {
    this.state.fragments = Math.max(0, this.state.fragments + amount);
    this.state.stats.fragmentsMined += Math.max(0, amount);
    this.render();
  }

  addAlloys(amount) {
    this.state.alloys = Math.max(0, this.state.alloys + amount);
    this.state.stats.alloysForged += Math.max(0, amount);
    this.render();
  }
}

async function boot() {
  const vault = await loadVaultState();
  if (!vault) return;
  const engine = new GameEngine(vault.gameState);
  await engine.start();
  events.on('vault:saved', vaultData => {
    document.querySelector('#vaultStatus').textContent = 'VAULT GESPEICHERT';
    document.querySelector('#vaultStatus').className = 'rounded-full px-3 py-2 bg-emerald-400/10 text-emerald-300 border border-emerald-400/20';
    document.querySelector('#lastSaved').textContent = `Zuletzt gespeichert: ${new Date(vaultData.updatedAt).toLocaleString('de-DE')}`;
  });
  events.on('vault:error', () => {
    document.querySelector('#vaultStatus').textContent = 'VAULT FEHLER';
    document.querySelector('#vaultStatus').className = 'rounded-full px-3 py-2 bg-red-400/10 text-red-300 border border-red-400/20';
  });
}

boot().catch(error => {
  console.error(error);
  document.querySelector('#engineMessage').textContent = 'Startfehler — bitte neu laden.';
});
