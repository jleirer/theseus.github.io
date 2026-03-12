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
