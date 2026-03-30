// main.js — game loop and orchestration
import { SCREEN_W, SCREEN_H } from './constants.js';
import { generateMap }        from './mapgen.js';
import { initRenderer, renderScene, loadAssets } from './raycaster.js';
import { renderHUD, renderCrosshair, renderMinimap,
         renderCachePrompt, hitTestCachePrompt,
         renderVictory, renderGameOver,
         renderClickToPlay, renderEffects, renderEnemyHealthBars,
         renderWaveMessage, renderBossHealthBar, hitTestMenuButton, renderFloorTransition,
         renderProjectiles } from './ui.js';
import {
  createPlayer, createEnemy, createMinion, createCache, createExit, createHealthPack, createAltar,
  updateEntities, updateExploration, checkInteractions, shootPlayer, spawnMinion,
  createConfiguredEnemy,
  grantArmor,
} from './entities.js';
import { getUnlockableWeapons, weaponNodeState, canUpgradeWeapon, applyWeaponUpgrade, getPlayerWeaponStats, isTechTreeMaxed } from './weapons.js';
import { unlockAudio, playSfx, setAudioEnabled } from './audio.js';

// ─── Canvas setup ─────────────────────────────────────────────────────────────

const canvas = document.getElementById('game');
canvas.width  = SCREEN_W;
canvas.height = SCREEN_H;
const ctx = canvas.getContext('2d');
initRenderer(ctx);

// ─── Game state ───────────────────────────────────────────────────────────────

let state = null;
let audioEnabled = true;

// ─── Input ────────────────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  unlockAudio().catch(() => {});
  if (!state) return;
  state.keys[e.code] = true;

  if (e.code === 'KeyM') {
    audioEnabled = !audioEnabled;
    setAudioEnabled(audioEnabled);
    try {
      localStorage.setItem('theseus-audio-enabled', audioEnabled ? '1' : '0');
    } catch {}
    if (state.phase === 'playing' || state.phase === 'cachePrompt') {
      state.waveMessage = {
        text: audioEnabled ? 'AUDIO ONLINE' : 'AUDIO MUTED',
        subtitle: audioEnabled ? 'PRESS M TO MUTE' : 'PRESS M TO RESTORE',
        timer: 1.8,
      };
    }
  }

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
      if (!state.cacheSelection) state.cacheSelection = getDefaultCacheSelection();
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

// Mouse look (pointer lock) — desktop only
const isTouchDevice = navigator.maxTouchPoints > 0;
canvas.addEventListener('click', () => {
  unlockAudio().catch(() => {});
  if (!isTouchDevice && state?.phase === 'playing') canvas.requestPointerLock();
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
  unlockAudio().catch(() => {});
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
  unlockAudio().catch(() => {});
  if (state?.phase === 'playing' && e.code === 'Space') shootPlayer(state);
});

function returnToMenu() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  state = null;
  lastPhaseAudio = null;
  lastWaveAudioKey = null;
  canvas.style.display = 'none';
  showTouchUI(false);
  document.getElementById('setup').style.display = 'flex';
}

// ─── Touch controls ───────────────────────────────────────────────────────────

const touchFireBtn  = document.getElementById('touch-fire');
const touchUseBtn   = document.getElementById('touch-use');
const touchStickEl  = document.getElementById('touch-stick');

let joystickTouch = null; // { id, startX, startY, curX, curY }
let lookTouch     = null; // { id, lastX }
let fireInterval  = null;

function showTouchUI(on) {
  if (!isTouchDevice) return;
  const d = on ? 'flex' : 'none';
  touchFireBtn.style.display = d;
  touchUseBtn.style.display  = d;
}

// Fire button — hold for continuous fire
touchFireBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  unlockAudio().catch(() => {});
  if (state?.phase === 'playing') {
    shootPlayer(state);
    fireInterval = setInterval(() => { if (state?.phase === 'playing') shootPlayer(state); }, 80);
  }
}, { passive: false });
touchFireBtn.addEventListener('touchend',    () => clearInterval(fireInterval), { passive: false });
touchFireBtn.addEventListener('touchcancel', () => clearInterval(fireInterval), { passive: false });

// Use button — simulates E key press
touchUseBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  unlockAudio().catch(() => {});
  if (state) { state.keys['KeyE'] = true; setTimeout(() => { if (state) state.keys['KeyE'] = false; }, 120); }
}, { passive: false });

// Canvas touch — left half: joystick, right half: look; tap end screens for menu button
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (!state) return;

  if (state.phase === 'victory' || state.phase === 'gameOver') {
    const t = e.changedTouches[0];
    const r = canvas.getBoundingClientRect();
    const cx = (t.clientX - r.left) * (SCREEN_W / r.width);
    const cy = (t.clientY - r.top)  * (SCREEN_H / r.height);
    if (hitTestMenuButton(cx, cy)) returnToMenu();
    return;
  }

  if (state.phase === 'cachePrompt') {
    const t = e.changedTouches[0];
    const r = canvas.getBoundingClientRect();
    state.mouse = {
      x: (t.clientX - r.left) * (SCREEN_W / r.width),
      y: (t.clientY - r.top)  * (SCREEN_H / r.height),
    };
    handleCacheClick();
    return;
  }

  if (state.phase !== 'playing') return;
  const r = canvas.getBoundingClientRect();
  for (const t of e.changedTouches) {
    const cx = (t.clientX - r.left) * (SCREEN_W / r.width);
    if (cx < SCREEN_W / 2) {
      if (!joystickTouch) {
        joystickTouch = { id: t.identifier, startX: t.clientX, startY: t.clientY, curX: t.clientX, curY: t.clientY };
        touchStickEl.style.left    = t.clientX + 'px';
        touchStickEl.style.top     = t.clientY + 'px';
        touchStickEl.style.display = 'block';
      }
    } else {
      if (!lookTouch) lookTouch = { id: t.identifier, lastX: t.clientX };
    }
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!state || state.phase !== 'playing') return;
  for (const t of e.changedTouches) {
    if (joystickTouch && t.identifier === joystickTouch.id) {
      joystickTouch.curX = t.clientX;
      joystickTouch.curY = t.clientY;
    }
    if (lookTouch && t.identifier === lookTouch.id) {
      const rect = canvas.getBoundingClientRect();
      state.player.input.mouseDX += (t.clientX - lookTouch.lastX) * (SCREEN_W / rect.width);
      lookTouch.lastX = t.clientX;
    }
  }
}, { passive: false });

function clearJoystick() {
  joystickTouch = null;
  touchStickEl.style.display = 'none';
  if (state?.player) {
    const i = state.player.input;
    i.forward = i.back = i.strafeL = i.strafeR = false;
  }
}

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (joystickTouch && t.identifier === joystickTouch.id) clearJoystick();
    if (lookTouch     && t.identifier === lookTouch.id)     lookTouch = null;
  }
}, { passive: false });
canvas.addEventListener('touchcancel', (e) => {
  clearJoystick(); lookTouch = null;
}, { passive: false });

function updateJoystickInput() {
  if (!joystickTouch || !state?.player) return;
  const dx   = joystickTouch.curX - joystickTouch.startX;
  const dy   = joystickTouch.curY - joystickTouch.startY;
  const dead = 14; // CSS px deadzone
  const i    = state.player.input;
  i.forward = dy < -dead;
  i.back    = dy >  dead;
  i.strafeL = dx < -dead;
  i.strafeR = dx >  dead;
}

// Arrow-key navigation map for the tech tree + minion buttons
const CACHE_NAV = {
  pistol:  { ArrowDown: 'shotgun', ArrowRight: 'smg'     },
  shotgun: { ArrowUp: 'pistol',    ArrowDown: 'rocket',   ArrowRight: 'smg'     },
  smg:     { ArrowUp: 'pistol',    ArrowDown: 'plasma',   ArrowLeft:  'shotgun' },
  rocket:  { ArrowUp: 'shotgun',   ArrowDown: 'bfg',      ArrowRight: 'plasma'  },
  plasma:  { ArrowUp: 'smg',       ArrowDown: 'railgun',  ArrowLeft:  'rocket'  },
  bfg:     { ArrowUp: 'rocket',    ArrowDown: 'armor',    ArrowRight: 'railgun' },
  railgun: { ArrowUp: 'plasma',    ArrowDown: 'armor',    ArrowLeft:  'bfg'     },
  armor:   { ArrowUp: 'bfg',       ArrowLeft: 'minion2',  ArrowRight: 'minion0', ArrowDown: 'minion1' },
  minion0: { ArrowUp: 'armor',     ArrowRight: 'minion1', ArrowLeft: 'armor' },
  minion1: { ArrowUp: 'armor',     ArrowLeft:  'minion0', ArrowRight: 'minion2' },
  minion2: { ArrowUp: 'armor',     ArrowLeft:  'minion1', ArrowRight: 'armor' },
};

const MINION_IDS = ['scout', 'guard', 'hunter'];

function getDefaultCacheSelection() {
  const unlockables = getUnlockableWeapons(state.player.weapons);
  if (unlockables.length > 0) return unlockables[0];
  if (isTechTreeMaxed(state.player.weapons)) return 'armor';
  return 'pistol';
}

function applyCacheChoice(choice) {
  if (choice.type === 'weapon') {
    state.player.weapons.add(choice.id);
    state.player.activeWeapon = choice.id;
    playSfx('reward');
  } else if (choice.type === 'weaponUpgrade') {
    const result = applyWeaponUpgrade(state.player, choice.id);
    state.player.activeWeapon = choice.id;
    const weaponName = getPlayerWeaponStats(state.player, choice.id).name;
    state.waveMessage = {
      text: `${weaponName.toUpperCase()} UPGRADED`,
      subtitle: result.stat === 'damage' ? `+Damage  LV ${result.upgradeLevel}` : `+Fire Rate  LV ${result.upgradeLevel}`,
      timer: 2.6,
    };
    playSfx('reward');
  } else if (choice.type === 'armor') {
    const armor = grantArmor(state.player, 30 + (state.floor || 1) * 5);
    state.waveMessage = { text: 'ARMOR REPLENISHED', subtitle: `${armor}/${state.player.maxArmor}`, timer: 2.4 };
    playSfx('pickup');
  } else {
    spawnMinion(state, choice.id);
    playSfx('reward');
  }
  state.phase = 'playing';
  state.pendingCacheIdx = null;
  state.cacheSelection = null;
  state.mouse = null;
  if (!isTouchDevice) canvas.requestPointerLock().catch(() => {});
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
  } else if (sel === 'armor') {
    applyCacheChoice({ type: 'armor' });
  } else {
    const nodeState = weaponNodeState(sel, state.player.weapons);
    if (nodeState === 'available') applyCacheChoice({ type: 'weapon', id: sel });
    else if (canUpgradeWeapon(state.player, sel)) applyCacheChoice({ type: 'weaponUpgrade', id: sel });
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
let lastPhaseAudio = null;
let lastWaveAudioKey = null;

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  if (state) {
    if (state.phase !== lastPhaseAudio) {
      if (state.phase === 'victory') playSfx('victory');
      if (state.phase === 'gameOver') playSfx('game_over');
      if (state.phase === 'floorAdvance') playSfx('floor');
      lastPhaseAudio = state.phase;
    }
    const waveAudioKey = state.waveMessage ? `${state.waveMessage.text}|${state.waveMessage.subtitle || ''}` : null;
    if (waveAudioKey && waveAudioKey !== lastWaveAudioKey) {
      if (state.waveMessage.isBoss) playSfx('boss');
      else if (state.waveMessage.isBless) playSfx('altar');
      else if (state.waveMessage.text?.startsWith('FLOOR')) playSfx('floor');
      else playSfx('wave');
    }
    lastWaveAudioKey = waveAudioKey;

    if (state.phase === 'floorAdvance') {
      if (state.floorAdvanceTimer == null) {
        state.floor = (state.floor || 1) + 1;
        generateNextFloor(state);
        state.floorAdvanceTimer = 2.5;
      }
      state.floorAdvanceTimer -= dt;
      if (state.floorAdvanceTimer <= 0) {
        state.phase = 'playing';
        state.floorAdvanceTimer = null;
      }
    }

    if (state.phase === 'playing') {
      updateJoystickInput();
      updateEntities(state, dt);
      updateExploration(state);
      checkInteractions(state);
      // Tick and expire effects (in-place to avoid allocation)
      for (let i = state.effects.length - 1; i >= 0; i--) {
        state.effects[i].timer -= dt;
        if (state.effects[i].timer <= 0) state.effects.splice(i, 1);
      }
      if (state.waveMessage) {
        state.waveMessage.timer -= dt;
        if (state.waveMessage.timer <= 0) state.waveMessage = null;
      }
    }

    // Render
    renderScene(ctx, state);
    if (state.phase === 'playing') renderProjectiles(ctx, state);

    if (state.phase === 'playing' || state.phase === 'cachePrompt') {
      renderCrosshair(ctx);
      renderMinimap(ctx, state);
      renderHUD(ctx, state);
      renderEffects(ctx, state);
      renderEnemyHealthBars(ctx, state);
      if (state.waveMessage) renderWaveMessage(ctx, state.waveMessage);
      const boss = state.activeBoss;
      if (boss) renderBossHealthBar(ctx, boss);
    }
    if (state.phase === 'playing' && !isTouchDevice && document.pointerLockElement !== canvas) {
      renderClickToPlay(ctx);
    }
    if (state.phase === 'cachePrompt') {
      if (state.cacheSelection == null) state.cacheSelection = getDefaultCacheSelection();
      renderCachePrompt(ctx, state, state.mouse, state.cacheSelection);
    }
    if (state.phase === 'floorAdvance') renderFloorTransition(ctx, state);
    if (state.phase === 'victory')  renderVictory(ctx, state);
    if (state.phase === 'gameOver') renderGameOver(ctx, state);
  }

  requestAnimationFrame(gameLoop);
}

// ─── Setup screen ─────────────────────────────────────────────────────────────

let assetsReady = false;
const assetsPromise = loadAssets().then(() => { assetsReady = true; }).catch(err => {
  console.error('Failed to load assets:', err);
});
requestAnimationFrame(gameLoop);
window.startGame = startGame;   // register immediately so button works while assets load

try {
  audioEnabled = localStorage.getItem('theseus-audio-enabled') !== '0';
} catch {
  audioEnabled = true;
}
setAudioEnabled(audioEnabled);

async function startGame(settings) {
  if (!assetsReady) await assetsPromise;
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
      const mapData = generateMap(settings.mapSize, settings.numEnemies, 1);

      fill.style.width = '70%';
      msg.textContent  = 'SPAWNING ENTITIES...';

      // Another frame so the progress bar update is visible
      requestAnimationFrame(() => {
        try {
          const player      = createPlayer(mapData.startPos);
          const enemies     = mapData.enemyPositions.map((p, i) => createConfiguredEnemy(p, i, 1));
          const caches      = mapData.cachePositions.map((p, i) => createCache(p.x, p.y, i));
          const exit        = createExit(mapData.exitPos.x, mapData.exitPos.y);
          const healthPacks = mapData.healthPackPositions.map(p => createHealthPack(p.x, p.y, p.size));
          const altars      = (mapData.altarPositions || []).map(p => createAltar(p.x, p.y, p.godId));
          const explored    = new Uint8Array(mapData.w * mapData.h);

          state = {
            phase: 'playing', victoryType: null,
            cells: mapData.cells,
            map: { cells: mapData.cells, w: mapData.w, h: mapData.h, rooms: mapData.rooms },
            player, enemies, minions: [], caches, exit, healthPacks, altars, explored,
            settings, pendingCacheIdx: null, keys: {}, mouse: null,
            effects: [], projectiles: [], wave: 1, waveMessage: null,
            floor: 1, exitOpen: false, nearAltar: null, defeatedBosses: [],
          };

          fill.style.width = '100%';
          msg.textContent  = 'READY';

          setTimeout(() => {
            loading.style.display = 'none';
            canvas.style.display  = 'block';
            canvas.focus();
            showTouchUI(true);
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

function generateNextFloor(state) {
  const mapData = generateMap(state.settings.mapSize, state.settings.numEnemies, state.floor);
  const p = state.player;
  p.x = mapData.startPos.x;
  p.y = mapData.startPos.y;
  p.angle = mapData.startPos.angle || 0;
  p.fireTimer = 0;
  state.cells     = mapData.cells;
  state.map       = { cells: mapData.cells, w: mapData.w, h: mapData.h, rooms: mapData.rooms };
  state.explored  = new Uint8Array(mapData.w * mapData.h);
  state.enemies   = mapData.enemyPositions.map((pos, i) => createConfiguredEnemy(pos, i, state.floor));
  state.caches    = mapData.cachePositions.map((pos, i) => createCache(pos.x, pos.y, i));
  state.exit      = createExit(mapData.exitPos.x, mapData.exitPos.y);
  state.healthPacks = mapData.healthPackPositions.map(pos => createHealthPack(pos.x, pos.y, pos.size));
  state.altars    = (mapData.altarPositions || []).map(pos => createAltar(pos.x, pos.y, pos.godId));
  state.minions   = [];
  state.effects   = [];
  state.projectiles = [];
  state.wave      = 1;
  state.exitOpen  = false;
  state.nearAltar = null;
  const floorSubs = { 2: 'THE LABYRINTH DEEPENS', 3: 'THE REALM OF THE DEAD AWAITS' };
  state.waveMessage = { text: `FLOOR  ${state.floor}`, subtitle: floorSubs[state.floor] || '', timer: 3.5 };
}
