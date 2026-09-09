/** Construct a fresh `WorldState` for a season. */

import { SCHEMA_VERSION, config } from "./config";
import { makePlayerNation } from "./factory";
import { generateSeason } from "./season";
import { seedToState, rngFromSeed, randRange } from "./rng";
import { getTier } from "../data/difficultyTiers";
import type { SeasonConfig, WorldState } from "./types";

export function createWorld(cfg: SeasonConfig): WorldState {
  const tier = getTier(cfg.tierId);
  // Its own decorrelated stream — a one-off roll, not an ongoing sequence, so
  // it doesn't consume from (or get consumed by) roster generation or gameplay.
  const [lo, hi] = config.taxComfortThresholdRange;
  const taxComfortThreshold = randRange(rngFromSeed((cfg.seed ^ 0x2545f491) >>> 0).next, lo, hi);
  return {
    schemaVersion: SCHEMA_VERSION,
    config: cfg,
    // Gameplay stream is decorrelated from the roster-generation stream.
    rngState: seedToState((cfg.seed ^ 0x5f3759df) >>> 0),
    day: 1,
    seasonLengthDays: cfg.seasonLengthDays,
    taxComfortThreshold,
    turnsRemaining: config.turnPoolCap,
    player: makePlayerNation(cfg.playerGovernment),
    enemies: generateSeason(cfg, tier),
    status: "playing",
    log: [
      `A new season begins — ${cfg.seasonLengthDays} days. Eliminate every enemy, ` +
        `or hold the highest net worth when the season ends.`,
    ],
  };
}

/** A reasonable default setup for the very first launch / "randomize" baseline. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}
