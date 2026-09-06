/**
 * localStorage persistence. The whole save is one JSON blob keyed by schema
 * version; on a version mismatch the save is discarded (no migrations in the
 * MVP). Every accessor is guarded — storage can be absent, full, or blocked.
 */

import { SCHEMA_VERSION } from "../engine/config";
import type { SeasonConfig, WorldState } from "../engine/types";

const KEY = "e2025r:save";

export interface SaveBlob {
  schemaVersion: number;
  world: WorldState;
  setup: SeasonConfig;
}

export function save(world: WorldState, setup: SeasonConfig): void {
  try {
    const blob: SaveBlob = { schemaVersion: SCHEMA_VERSION, world, setup };
    localStorage.setItem(KEY, JSON.stringify(blob));
  } catch {
    // Storage unavailable or full — the game stays fully playable in memory.
  }
}

export function load(): SaveBlob | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw) as SaveBlob;
    if (!blob || blob.schemaVersion !== SCHEMA_VERSION) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (!blob.world || !blob.setup) return null;
    return blob;
  } catch {
    return null;
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
