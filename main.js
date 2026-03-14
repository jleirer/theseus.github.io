// main.js — game loop and orchestration
import { SCREEN_W, SCREEN_H } from './constants.js';
import { generateMap }        from './mapgen.js';
import { initRenderer, renderScene } from './raycaster.js';
import { renderHUD, renderCrosshair, renderMinimap,
         renderCachePrompt, hitTestCachePrompt,
         renderVictory, renderGameOver,
         renderClickToPlay, renderEffects, renderEnemyHealthBars,
         renderWaveMessage, renderBossHealthBar, hitTestMenuButton } from './ui.js';
import {
  createPlayer, createEnemy, createMinion, createCache, createExit, createHealthPack,
  updateEntities, updateExploration, checkInteractions, shootPlayer, spawnMinion,
} from './entities.js';
import { getUnlockableWeapons, weaponNodeState } from './weapons.js';

// ─── Canvas setup ─────────────────────────────────────────────────────────────

const canvas = document.getElementById('game');
canvas.width  = SCREEN_W;
canvas.height = SCREEN_H;
const ctx = canvas.getContext('2d');
initRenderer(ctx);

// ─── Game state ───────────────────────────────────────────────────────────────

let state = null;

// ─── Input ────────────────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (!state) return;
  state.keys[e.code] = true;

  // Weapon switch 1–7
  if (e.code.startsWith('Digit')) {
    const idx = parseInt(e.code.replace('Digit', '')) - 1;
    const wlist = [...state.player.weapons];
    if (wlist[idx]) state.player.activeWeapon = wlist[idx];
  }

  // Restart
  if (e.code === 'KeyR' && (state.phase === 'gameOver' || state.phase === 'victory')) {
    startGame(state.settings);
  }

  // Return to main menu from end screens
  if (e.code === 'Enter' && (state.phase === 'gameOver' || state.phase === 'victory')) {
    returnToMenu();
  }

  // Cache prompt keyboard navigation
  if (state.phase === 'cachePrompt') {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
      e.preventDefault();
      if (!state.cacheSelection) state.cacheSelection = 'pistol';
      const next = CACHE_NAV[state.cacheSelection]?.[e.code];
      if (next) state.cacheSelection = next;
    }
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      handleCacheKeyboard();
    }
  }
});

document.addEventListener('keyup',  (e) => { if (state) state.keys[e.code] = false; });

// Mouse look (pointer lock)
canvas.addEventListener('click', () => {
  if (state?.phase === 'playing') canvas.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    canvas.classList.add('locked');
  } else {
    canvas.classList.remove('locked');
  }
});

document.addEventListener('mousemove', (e) => {
  if (!state) return;
  if (document.pointerLockElement === canvas && state.phase === 'playing') {
    state.player.input.mouseDX += e.movementX;
  }
  if (state.phase === 'cachePrompt') {
    const r = canvas.getBoundingClientRect();
    state.mouse = {
      x: (e.clientX - r.left) * (SCREEN_W / r.width),
      y: (e.clientY - r.top)  * (SCREEN_H / r.height),
    };
  }
});

document.addEventListener('mousedown', (e) => {
  if (!state) return;
  if (e.button === 0 && document.pointerLockElement === canvas && state.phase === 'playing') {
    shootPlayer(state);
  }
  if (e.button === 0 && state.phase === 'cachePrompt') {
    handleCacheClick();
  }
  if (e.button === 0 && (state.phase === 'victory' || state.phase === 'gameOver')) {
    const r = canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) * (SCREEN_W / r.width);
    const cy = (e.clientY - r.top)  * (SCREEN_H / r.height);
    if (hitTestMenuButton(cx, cy)) returnToMenu();
  }
});

// Keyboard shoot (Space)
document.addEventListener('keydown', (e) => {
  if (state?.phase === 'playing' && e.code === 'Space') shootPlayer(state);
});

function returnToMenu() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  state = null;
  canvas.style.display = 'none';
  document.getElementById('setup').style.display = 'flex';
}

// Arrow-key navigation map for the tech tree + minion buttons
const CACHE_NAV = {
  pistol:  { ArrowDown: 'shotgun', ArrowRight: 'smg'     },
  shotgun: { ArrowUp: 'pistol',    ArrowDown: 'rocket',   ArrowRight: 'smg'     },
  smg:     { ArrowUp: 'pistol',    ArrowDown: 'plasma',   ArrowLeft:  'shotgun' },
  rocket:  { ArrowUp: 'shotgun',   ArrowDown: 'bfg',      ArrowRight: 'plasma'  },
  plasma:  { ArrowUp: 'smg',       ArrowDown: 'railgun',  ArrowLeft:  'rocket'  },
  bfg:     { ArrowUp: 'rocket',    ArrowDown: 'minion0',  ArrowRight: 'railgun' },
  railgun: { ArrowUp: 'plasma',    ArrowDown: 'minion2',  ArrowLeft:  'bfg'     },
  minion0: { ArrowUp: 'bfg',       ArrowRight: 'minion1' },
  minion1: { ArrowUp: 'bfg',       ArrowLeft:  'minion0', ArrowRight: 'minion2' },
  minion2: { ArrowUp: 'railgun',   ArrowLeft:  'minion1' },
};

const MINION_IDS = ['scout', 'guard', 'hunter'];

function applyCacheChoice(choice) {
  if (choice.type === 'weapon') {
    state.player.weapons.add(choice.id);
    state.player.activeWeapon = choice.id;
  } else {
    spawnMinion(state, choice.id);
  }
  state.phase = 'playing';
  state.pendingCacheIdx = null;
  state.cacheSelection = null;
  state.mouse = null;
  canvas.requestPointerLock().catch(() => {});
}

function handleCacheClick() {
  if (!state.mouse) return;
  const choice = hitTestCachePrompt(state.mouse.x, state.mouse.y, state);
  if (!choice) return;
  applyCacheChoice(choice);
}

function handleCacheKeyboard() {
  const sel = state?.cacheSelection;
  if (!sel) return;
  if (sel.startsWith('minion')) {
    const idx = parseInt(sel.replace('minion', ''));
    applyCacheChoice({ type: 'minion', id: MINION_IDS[idx] });
  } else {
    if (weaponNodeState(sel, state.player.weapons) !== 'available') return;
    applyCacheChoice({ type: 'weapon', id: sel });
  }
}

// Player input binding
document.addEventListener('keydown', (e) => {
  if (!state?.player) return;
  const i = state.player.input;
  if (e.code === 'KeyW' || e.code === 'ArrowUp')    i.forward  = true;
  if (e.code === 'KeyS' || e.code === 'ArrowDown')  i.back     = true;
  if (e.code === 'KeyA')                             i.strafeL  = true;
  if (e.code === 'KeyD')                             i.strafeR  = true;
});
document.addEventListener('keyup', (e) => {
  if (!state?.player) return;
  const i = state.player.input;
  if (e.code === 'KeyW' || e.code === 'ArrowUp')    i.forward  = false;
  if (e.code === 'KeyS' || e.code === 'ArrowDown')  i.back     = false;
  if (e.code === 'KeyA')                             i.strafeL  = false;
  if (e.code === 'KeyD')                             i.strafeR  = false;
});

// ─── Game loop ────────────────────────────────────────────────────────────────

let lastTime = performance.now();

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  if (state) {
    if (state.phase === 'playing') {
      updateEntities(state, dt);
      updateExploration(state);
      checkInteractions(state);
      // Tick and expire effects
      for (const eff of state.effects) eff.timer -= dt;
      state.effects = state.effects.filter(e => e.timer > 0);
      if (state.waveMessage) {
        state.waveMessage.timer -= dt;
        if (state.waveMessage.timer <= 0) state.waveMessage = null;
      }
    }

    // Render
    renderScene(ctx, state);

    if (state.phase === 'playing' || state.phase === 'cachePrompt') {
      renderCrosshair(ctx);
      renderMinimap(ctx, state);
      renderHUD(ctx, state);
      renderEffects(ctx, state);
      renderEnemyHealthBars(ctx, state);
      if (state.waveMessage) renderWaveMessage(ctx, state.waveMessage);
      const boss = state.enemies?.find(e => e.isBoss && !e.dead);
      if (boss) renderBossHealthBar(ctx, boss);
    }
    if (state.phase === 'playing' && document.pointerLockElement !== canvas) {
      renderClickToPlay(ctx);
    }
    if (state.phase === 'cachePrompt') {
      if (state.cacheSelection == null) state.cacheSelection = 'pistol';
      renderCachePrompt(ctx, state, state.mouse, state.cacheSelection);
    }
    if (state.phase === 'victory')  renderVictory(ctx, state);
    if (state.phase === 'gameOver') renderGameOver(ctx, state);
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

// ─── Setup screen ─────────────────────────────────────────────────────────────

function startGame(settings) {
  document.getElementById('setup').style.display = 'none';
  const loading = document.getElementById('loading');
  const fill    = document.getElementById('loading-fill');
  const msg     = document.getElementById('loading-msg');
  loading.style.display = 'flex';

  // Let the browser paint the loading screen before doing work
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      msg.textContent  = 'GENERATING MAP...';
      fill.style.width = '30%';
      const mapData = generateMap(settings.mapSize, settings.numEnemies);

      fill.style.width = '70%';
      msg.textContent  = 'SPAWNING ENTITIES...';

      // Another frame so the progress bar update is visible
      requestAnimationFrame(() => {
        try {
          const player      = createPlayer(mapData.startPos);
          const enemies     = mapData.enemyPositions.map((p, i) => createEnemy(p.x, p.y, i));
          const caches      = mapData.cachePositions.map((p, i) => createCache(p.x, p.y, i));
          const exit        = createExit(mapData.exitPos.x, mapData.exitPos.y);
          const healthPacks = mapData.healthPackPositions.map(p => createHealthPack(p.x, p.y, p.size));
          const explored    = new Uint8Array(mapData.w * mapData.h);

          state = {
            phase: 'playing', victoryType: null,
            cells: mapData.cells,           // shortcut used by raycaster/entities
            map: { cells: mapData.cells, w: mapData.w, h: mapData.h, rooms: mapData.rooms },
            player, enemies, minions: [], caches, exit, healthPacks, explored,
            settings, pendingCacheIdx: null, keys: {}, mouse: null,
            effects: [], wave: 1, waveMessage: null,
          };

          fill.style.width = '100%';
          msg.textContent  = 'READY';

          setTimeout(() => {
            loading.style.display = 'none';
            canvas.style.display  = 'block';
            canvas.focus();
          }, 200);
        } catch (err) {
          msg.textContent = 'ERROR: ' + err.message;
          console.error(err);
        }
      });
    } catch (err) {
      msg.textContent = 'ERROR: ' + err.message;
      console.error(err);
    }
  }));
}

window.startGame = startGame;   // called from HTML
