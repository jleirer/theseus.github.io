# THESEUS

A browser-based first-person dungeon crawler and roguelike shooter set in an ancient Roman labyrinth. Navigate procedurally generated floors, battle minotaurs and mythological bosses, collect Roman weapons, and recruit allies — all rendered with a custom raycasting engine and no external dependencies.

**[Play it here](https://jleirer.github.io/theseus/)** *(if hosted)*

---

## Features

- **Custom raycasting engine** — DDA-based 3D renderer with pixel-buffer manipulation, sprite depth sorting, distance fog, and directional shading. No game engine; pure vanilla JS.
- **Procedural dungeons** — Binary Space Partition map generation with room classification (arenas, chokepoints, boss rooms) that shapes enemy placement and encounter pacing.
- **7 Roman weapons** with a tech tree: Pilum (pistol) → Funda (shotgun) / Arcus (SMG) → Onager (rocket) / Scorpio (plasma) → Falarica (BFG) / Hasta (railgun). Penetrating shots, splash damage, upgradeable stats.
- **Three boss fights** across three floors: Mega-Taur, Nero, and Hades — each with scaled health and damage.
- **Enemy AI** — state machine (patrol → alert → chase → attack) with line-of-sight, A* pathfinding, and cache-looting that triggers reinforcements.
- **Minion allies** — Scout (explores fog of war), Guard (follows player), Hunter (pursues specific enemies), each with independent AI.
- **God altars** — one-time blessings from Mars, Mercury, Vulcan, Apollo, Minerva, and Fortuna.
- **Dual win conditions** — Domination (defeat all enemies and descend) or Escape (flee after floor 1 boss falls).
- **Synthesized audio** — all SFX generated procedurally via Web Audio API; no asset files.
- **Mobile support** — touch joystick, swipe-to-look, and on-screen buttons.

---

## Weapons

| Name | Type | Damage | Fire Rate | Notes |
|------|------|--------|-----------|-------|
| Pilum | Pistol | 22 | 1.5/s | Starting weapon, accurate |
| Funda | Shotgun | 16×6 | 0.9/s | Close-range spread |
| Arcus | SMG | 11 | 7.5/s | High fire rate |
| Onager | Rocket | 90 | 0.5/s | Splash radius 2.2 |
| Scorpio | Plasma | 38 | 4.0/s | Fast projectile |
| Falarica | BFG | 320 | 0.3/s | Splash radius 4.5 |
| Hasta | Railgun | 190 | 0.6/s | Penetrates all enemies in line |

Weapon caches also offer damage (+12%) and fire rate (+10%) upgrades once all weapons are unlocked.

---

## Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Move | WASD | Left half joystick |
| Look | Mouse (pointer lock) | Right half swipe |
| Shoot | Left click | Fire button |
| Interact | E | Use button |
| Pause | P / Esc | — |
| Mute | M | — |
| Switch weapon | 1–7 | — |
| Restart | R | — |

---

## Enemies

- **Raider** — balanced baseline
- **Charger** — fast and aggressive (spawns in arenas)
- **Sentinel** — tanky and hard-hitting (spawns in chokepoints)
- **Elite variants** — 45% more health, 22% more damage

All enemy stats scale 18% per floor.

---

## Tech Stack

- Vanilla JavaScript (ES Modules)
- Canvas 2D with manual `Uint32Array` pixel buffers
- Web Audio API (procedural synthesis)
- A* pathfinding with a MinHeap
- Binary Space Partition dungeon generation
- DDA raycasting

No build step. No dependencies. Open `index.html` to run locally.

---

## Running Locally

```bash
git clone https://github.com/jleirer/theseus.git
cd theseus
# Serve with any static file server, e.g.:
npx serve .
# or
python3 -m http.server
```

Then open `http://localhost:3000` (or whichever port your server uses).

> Direct `file://` loading may fail due to ES module CORS restrictions — use a local server.
