/**
 * artifactSets.ts
 *
 * Single source of truth for numeric Artifact Set IDs used throughout the app.
 *
 * This is intentionally kept free of runtime imports (like `runtimeStore`) so
 * modules that need the ID catalog (for example icon maps) can import it without
 * introducing circular initialization issues during Node/test builds.
 */

// Readable artifact set IDs (values match HSF/SFR catalog).
export const ArtifactSet = {
  Life: 1,
  Offense: 2,
  Defense: 3,
  Speed: 4,
  CriticalRate: 5,
  CritDamage: 6,
  Accuracy: 7,
  Resistance: 8,
  Lifesteal: 9,
  Fury: 10,
  Daze: 11,
  Cursed: 12,
  Frost: 13,
  Frenzy: 14,
  Regeneration: 15,
  Immunity: 16,
  Shield: 17,
  Relentless: 18,
  Savage: 19,
  Destroy: 20,
  Stun: 21,
  Toxic: 22,
  Provoke: 23,
  Retaliation: 24,
  Avenging: 25,
  Stalwart: 26,
  Reflex: 27,
  Curing: 28,
  Cruel: 29,
  Immortal: 30,
  DivineOffense: 31,
  DivineCriticalRate: 32,
  DivineLife: 33,
  DivineSpeed: 34,
  SwiftParry: 35,
  Deflection: 36,
  Resilience: 37,
  Perception: 38,
  Affinitybreaker: 39,
  Untouchable: 40,
  Fatal: 41,
  Frostbite: 42,
  Bloodthirst: 43,
  Guardian: 44,
  Fortitude: 45,
  Lethal: 46,
  Protection: 47,
  Stoneskin: 48,
  Killstroke: 49,
  Instinct: 50,
  Bolster: 51,
  Defiant: 52,
  Impulse: 53,
  Zeal: 54,
  Righteous: 57,
  Supersonic: 58,
  Merciless: 59,
  Slayer: 60,
  Feral: 61,
  Pinpoint: 62,
  Stonecleaver: 63,
  Rebirth: 64,
  Chronophage: 65,
  // Variable 1–9 piece sets
  Mercurial: 66,
  // Accessories
  Refresh: 1000,
  Cleansing: 1001,
  Bloodshield: 1002,
  Reaction: 1003,
  Revenge: 1004,
} as const

// eslint-disable-next-line no-redeclare -- keep value and type aliases aligned for imports
export type ArtifactSet = number
export type ArtifactSetId = ArtifactSet | number

