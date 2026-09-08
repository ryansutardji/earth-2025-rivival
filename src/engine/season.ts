/**
 * Season generation: turn a `SeasonConfig` + difficulty tier into a fixed roster
 * of enemy nations placed at world start. Deterministic for a given seed.
 */

import { makeNation } from "./factory";
import { rngFromSeed, randInt } from "./rng";
import { aiTurnPool } from "./pacing";
import { ARCHETYPES } from "./archetype/templates";
import { GOVERNMENT_IDS } from "./government";
import { BUILDING_TYPES, UNIT_TYPES } from "./types";
import type { ArchetypeId, Buildings, DifficultyTier, GovernmentId, Military, Nation, SeasonConfig } from "./types";

/** Everything but Monarchy — the pool a "random governments" season draws from. */
const RANDOM_GOV_POOL = GOVERNMENT_IDS.filter((g) => g !== "monarchy") as GovernmentId[];

const NATION_NAMES = [
  "Valtora", "Kessadrite", "Norhollow", "Brakmar", "Oren Concord", "Sud Pellas",
  "Ironmoor", "Cael Dun", "Marrowfen", "Highreach", "Skarn Union", "Telvani",
  "Wester Gault", "Ostmark", "Ruvane", "Dunhollow", "Palethorn", "Corvath",
  "Ashkelly", "Grey Meridian", "Vos Karn", "Lattermoor", "Solmark", "Rhennic",
  "Drosswald", "Ninveah", "Terrec", "Auskheim", "Belmara", "Fenwick Pale",
];

function pickName(rng: () => number, used: Set<string>): string {
  const pool = NATION_NAMES.filter((n) => !used.has(n));
  if (pool.length === 0) return `Nation ${used.size + 1}`;
  const name = pool[randInt(rng, 0, pool.length - 1)]!;
  used.add(name);
  return name;
}

/** Every nation — AI and player alike — starts from the one shared baseline;
 * difficulty is tempo, not a head start (see `data/difficultyTiers.ts`). */
function startingStats(archetype: ArchetypeId) {
  const b = ARCHETYPES[archetype].baseline;
  const buildings = {} as Buildings;
  for (const k of BUILDING_TYPES) buildings[k] = b.buildings[k];
  const military = {} as Military;
  for (const k of UNIT_TYPES) military[k] = b.military[k];
  return { land: b.land, cash: b.cash, buildings, military };
}

export function generateSeason(cfg: SeasonConfig, tier: DifficultyTier): Nation[] {
  const rng = rngFromSeed(cfg.seed).next;
  // Separate stream for random governments so a "random" season keeps exactly
  // the same roster + names as the "archetype" season on the same seed.
  const govRng = rngFromSeed((cfg.seed ^ 0x9e3779b9) >>> 0).next;
  const eligible: ArchetypeId[] =
    cfg.eligibleArchetypes.length > 0 ? cfg.eligibleArchetypes : ["balanced"];
  const size = Math.max(1, Math.floor(cfg.rosterSize));

  const used = new Set<string>();
  const roster: Nation[] = [];
  const turnPool = aiTurnPool(tier);
  for (let i = 0; i < size; i++) {
    const archetype = eligible[i % eligible.length]!; // round-robin => good mix for small rosters
    const base = startingStats(archetype);
    const population = Math.round(base.land * 3);
    const name = pickName(rng, used);
    // Every nation starts at Monarchy and adopts its target government on turn
    // 1 (see `applyTurn.ts`). That target is the archetype's calibrated choice
    // by default; a "random" season rolls one per nation from its own stream,
    // so the roster + names are identical to the archetype season on the same
    // seed and only the governments differ.
    const targetGovernment: GovernmentId =
      cfg.governmentMode === "random"
        ? RANDOM_GOV_POOL[Math.floor(govRng() * RANDOM_GOV_POOL.length)]!
        : ARCHETYPES[archetype].government;
    roster.push(
      makeNation({
        id: `enemy-${i + 1}`,
        name,
        archetype,
        targetGovernment,
        land: base.land,
        cash: base.cash,
        population,
        bushels: population * 6,
        oil: 1500,
        buildings: base.buildings,
        military: base.military,
        aiTurnsRemaining: turnPool,
        ticksAlive: 0,
        defeated: false,
      }),
    );
  }
  return roster;
}
