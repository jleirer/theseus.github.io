// weapons.js — weapon accessors and tech tree helpers
import { WEAPONS, TECH_PREREQS } from './constants.js';
export { WEAPONS };

export function getUnlockableWeapons(owned) {
  // owned: Set of weapon id strings
  return Object.keys(TECH_PREREQS).filter(id =>
    !owned.has(id) && TECH_PREREQS[id].every(req => owned.has(req))
  );
}

export function weaponNodeState(id, owned) {
  if (owned.has(id))                                   return 'owned';
  if (TECH_PREREQS[id].every(r => owned.has(r)))       return 'available';
  return 'locked';
}

export function isTechTreeMaxed(owned) {
  return Object.keys(TECH_PREREQS).every(id => owned.has(id));
}

export function canUpgradeWeapon(player, id) {
  return player.weapons.has(id) && isTechTreeMaxed(player.weapons);
}

export function getWeaponUpgradeData(player, id) {
  return player.weaponUpgrades?.[id] || { damage: 0, fireRate: 0, level: 0 };
}

export function getPlayerWeaponStats(player, id) {
  const base = WEAPONS[id];
  const up = getWeaponUpgradeData(player, id);
  return {
    ...base,
    damage: Math.round(base.damage * (1 + up.damage * 0.12)),
    fireRate: base.fireRate * (1 + up.fireRate * 0.1),
    upgradeLevel: up.level,
    damageLevel: up.damage,
    fireRateLevel: up.fireRate,
  };
}

export function applyWeaponUpgrade(player, id) {
  if (!player.weaponUpgrades) player.weaponUpgrades = {};
  const up = player.weaponUpgrades[id] || { damage: 0, fireRate: 0, level: 0 };
  const stat = up.damage <= up.fireRate ? 'damage' : 'fireRate';
  up[stat] += 1;
  up.level += 1;
  player.weaponUpgrades[id] = up;
  return { stat, ...getPlayerWeaponStats(player, id) };
}
