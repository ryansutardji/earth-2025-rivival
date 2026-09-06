/**
 * Season generation: turn a `SeasonConfig` + difficulty tier into a fixed roster
 * of enemy nations placed at world start. Deterministic for a given seed.
 */

import { makeNation } from "./factory";
import { rngFromSeed, randInt } from "./rng";
import { ARCHETYPES } from "./archetype/templates";
import { BUILDING_TYPES, UNIT_TYPES } from "./types";
import type { ArchetypeId, Buildings, DifficultyTier, Military, Nation, SeasonConfig } from "./types";

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

function scaledBaseline(archetype: ArchetypeId, mult: number) {
  const b = ARCHETYPES[archetype].baseline;
  const s = (v: number) => Math.round(v * mult);
  const buildings = {} as Buildings;
  for (const k of BUILDING_TYPES) buildings[k] = s(b.buildings[k]);
  const military = {} as Military;
  for (const k of UNIT_TYPES) military[k] = s(b.military[k]);
  return { land: s(b.land), cash: s(b.cash), buildings, military };
}

export function generateSeason(cfg: SeasonConfig, tier: DifficultyTier): Nation[] {
  const rng = rngFromSeed(cfg.seed).next;
  const eligible: ArchetypeId[] =
    cfg.eligibleArchetypes.length > 0 ? cfg.eligibleArchetypes : ["balanced"];
  const size = Math.max(1, Math.floor(cfg.rosterSize));

  const used = new Set<string>();
  const roster: Nation[] = [];
  for (let i = 0; i < size; i++) {
    const archetype = eligible[i % eligible.length]!; // round-robin => good mix for small rosters
    const base = scaledBaseline(archetype, tier.baselineMult);
    const population = Math.round(base.land * 3);
    roster.push(
      makeNation({
        id: `enemy-${i + 1}`,
        name: pickName(rng, used),
        archetype,
        // Every nation starts at Monarchy (the `makeNation` default) and
        // adopts its real target government only via the archetype's
        // mandatory first action (see `applyTurn.ts`) — free, since leaving
        // Monarchy never costs anything.
        land: base.land,
        cash: base.cash,
        population,
        bushels: population * 6,
        oil: 1500,
        buildings: base.buildings,
        military: base.military,
        ticksAlive: 0,
        defeated: false,
      }),
    );
  }
  return roster;
}
