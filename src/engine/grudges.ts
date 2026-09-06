/**
 * Shared helpers for the per-nation grudge / covert-heat memory. Used by both
 * the player's turn handler (`turn.ts`) and the archetype turn handler
 * (`archetype/applyTurn.ts`) — combat and spying are multi-target now, so
 * either the player or any archetype can be the attacker or the defender.
 */

import { config } from "./config";
import type { Nation } from "./types";

/** Record (or add to) a grievance against `againstId` on `target`. */
export function addGrudge(target: Nation, againstId: string, day: number, label: string, score: number): Nation {
  const existing = target.grudges[againstId];
  return {
    ...target,
    grudges: {
      ...target.grudges,
      [againstId]: { againstId, score: (existing?.score ?? 0) + score, lastEventDay: day, lastEventLabel: label },
    },
  };
}

/** Once-a-day upkeep: grudges fade, covert heat cools, and "can't beat them"
 * memories fade so a backed-off target eventually comes back into play. */
export function decayDaily(n: Nation): Nation {
  const grudges: Nation["grudges"] = {};
  for (const [id, g] of Object.entries(n.grudges)) {
    const score = g.score - config.grudgeDecayPerDay;
    if (score > 0.01) grudges[id] = { ...g, score };
  }
  const attackFutility: Nation["attackFutility"] = {};
  for (const [id, score] of Object.entries(n.attackFutility)) {
    const next = score - config.attackFutilityDecayPerDay;
    if (next > 0.01) attackFutility[id] = next;
  }
  return {
    ...n,
    grudges,
    attackFutility,
    covertHeat: Math.max(0, n.covertHeat - config.covert.heatDecayPerDay),
  };
}
