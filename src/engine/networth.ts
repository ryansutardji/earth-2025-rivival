/**
 * Net worth — a single weighted number summarising everything a nation owns.
 * Rankings at the season deadline use it (the Earth Empires "how you finish"
 * model).
 */

import { config } from "./config";
import { TECH_CATEGORIES } from "./types";
import type { Nation, Standing, WorldState } from "./types";

export function netWorth(n: Nation): number {
  const w = config.netWorthWeights;
  const tech = TECH_CATEGORIES.reduce((s, c) => s + n.tech[c], 0);
  const built = (Object.keys(n.buildings) as (keyof typeof n.buildings)[]).reduce((s, k) => s + n.buildings[k], 0);
  const missiles = n.missiles.chemical + n.missiles.cruise + n.missiles.nuclear;
  return Math.round(
    n.land * w.land +
      built * w.building +
      n.cash * w.cashPerDollar +
      n.population * w.population +
      n.bushels * w.bushelsPerUnit +
      n.oil * w.oilPerUnit +
      tech * w.techPerPoint +
      n.military.troops * w.troops +
      n.military.jets * w.jets +
      n.military.turrets * w.turrets +
      n.military.tanks * w.tanks +
      n.military.spies * w.spies +
      missiles * w.missile,
  );
}

/**
 * Player + every enemy, ranked by net worth (highest first). A defeated nation
 * scores 0 and sorts to the bottom.
 */
export function computeStandings(world: WorldState): Standing[] {
  const rows: Standing[] = [world.player, ...world.enemies].map((n) => ({
    id: n.id,
    name: n.name,
    isPlayer: n.isPlayer,
    netWorth: n.defeated ? 0 : netWorth(n),
    defeated: n.defeated,
  }));
  rows.sort((a, b) => b.netWorth - a.netWorth || Number(b.isPlayer) - Number(a.isPlayer));
  return rows;
}
