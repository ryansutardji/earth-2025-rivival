/**
 * The single Zustand store binding the pure engine to React. It holds the
 * serializable `world`, the draft `setup` for the next season, and transient UI
 * signals (last error, battle report to show). Every successful action persists.
 */

import { create } from "zustand";
import type { CombatResult, CovertResult, MissileResult, SeasonConfig, WorldState } from "../engine/types";
import { config } from "../engine/config";
import { applyPlayerTurn, type PlayerAction } from "../engine/turn";
import { createWorld, randomSeed } from "../engine/world";
import { DEFAULT_TIER_ID, DIFFICULTY_TIERS } from "../data/difficultyTiers";
import { ALL_ARCHETYPE_IDS, DEFAULT_ELIGIBLE_ARCHETYPES } from "../data/archetypes";
import { DEFAULT_GOVERNMENT, GOVERNMENT_IDS } from "../engine/government";
import * as persist from "./persist";

export const ROSTER_MIN = 2;
export const ROSTER_MAX = 12;
export const SEASON_MIN = 10;
export const SEASON_MAX = 60;

const clampSeason = (d: number) => Math.min(SEASON_MAX, Math.max(SEASON_MIN, Math.round(d)));

function defaultSetup(): SeasonConfig {
  return {
    tierId: DEFAULT_TIER_ID,
    rosterSize: 4,
    eligibleArchetypes: [...DEFAULT_ELIGIBLE_ARCHETYPES],
    seasonLengthDays: config.seasonLengthDays,
    playerGovernment: DEFAULT_GOVERNMENT,
    governmentMode: "archetype",
    seed: randomSeed(),
  };
}

interface GameStore {
  world: WorldState | null;
  setup: SeasonConfig;
  lastError: string | null;
  battleReport: CombatResult | null;
  covertReport: CovertResult | null;
  missileReport: MissileResult | null;

  setSetup: (patch: Partial<SeasonConfig>) => void;
  toggleArchetype: (id: (typeof ALL_ARCHETYPE_IDS)[number]) => void;
  randomizeSetup: () => void;
  rerollSeed: () => void;

  newSeason: () => void;
  act: (action: PlayerAction) => void;
  abandonSeason: () => void;

  dismissBattleReport: () => void;
  dismissCovertReport: () => void;
  dismissMissileReport: () => void;
  dismissError: () => void;
}

const restored = persist.load();

export const useGame = create<GameStore>((set, get) => ({
  world: restored?.world ?? null,
  setup: restored?.setup ?? defaultSetup(),
  lastError: null,
  battleReport: null,
  covertReport: null,
  missileReport: null,

  setSetup: (patch) => set((s) => ({ setup: { ...s.setup, ...patch } })),

  toggleArchetype: (id) =>
    set((s) => {
      const has = s.setup.eligibleArchetypes.includes(id);
      const next = has
        ? s.setup.eligibleArchetypes.filter((a) => a !== id)
        : [...s.setup.eligibleArchetypes, id];
      // Never allow an empty pool.
      if (next.length === 0) return {};
      return { setup: { ...s.setup, eligibleArchetypes: next } };
    }),

  randomizeSetup: () => {
    const r = Math.random;
    const tier = DIFFICULTY_TIERS[Math.floor(r() * DIFFICULTY_TIERS.length)]!;
    const pool = ALL_ARCHETYPE_IDS.filter(() => r() < 0.5);
    if (pool.length === 0) pool.push("raider", "economic");
    set({
      setup: {
        tierId: tier.id,
        rosterSize: ROSTER_MIN + Math.floor(r() * (ROSTER_MAX - ROSTER_MIN + 1)),
        eligibleArchetypes: pool,
        seasonLengthDays: clampSeason(SEASON_MIN + Math.floor(r() * (SEASON_MAX - SEASON_MIN + 1))),
        playerGovernment: GOVERNMENT_IDS[Math.floor(r() * GOVERNMENT_IDS.length)]!,
        governmentMode: r() < 0.5 ? "random" : "archetype",
        seed: randomSeed(),
      },
    });
  },

  rerollSeed: () => set((s) => ({ setup: { ...s.setup, seed: randomSeed() } })),

  newSeason: () => {
    const setup = get().setup;
    const clamped: SeasonConfig = {
      ...setup,
      rosterSize: Math.min(ROSTER_MAX, Math.max(ROSTER_MIN, Math.floor(setup.rosterSize))),
      seasonLengthDays: clampSeason(setup.seasonLengthDays),
      eligibleArchetypes:
        setup.eligibleArchetypes.length > 0 ? setup.eligibleArchetypes : [...DEFAULT_ELIGIBLE_ARCHETYPES],
    };
    const world = createWorld(clamped);
    persist.save(world, clamped);
    set({ world, setup: clamped, lastError: null, battleReport: null, covertReport: null, missileReport: null });
  },

  act: (action) => {
    const world = get().world;
    if (!world) return;
    const out = applyPlayerTurn(world, action);
    if (!out.ok) {
      set({ lastError: out.error ?? "That action is not possible right now." });
      return;
    }
    persist.save(out.world, get().setup);
    set({
      world: out.world,
      lastError: null,
      battleReport: out.battleReport ?? null,
      covertReport: out.covertReport ?? null,
      missileReport: out.missileReport ?? null,
    });
  },

  abandonSeason: () => {
    persist.clear();
    set({ world: null, lastError: null, battleReport: null, covertReport: null, missileReport: null });
  },

  dismissBattleReport: () => set({ battleReport: null }),
  dismissCovertReport: () => set({ covertReport: null }),
  dismissMissileReport: () => set({ missileReport: null }),
  dismissError: () => set({ lastError: null }),
}));
