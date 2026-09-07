/**
 * Run one archetype's turn.
 *
 * Archetypes are no longer a growth-curve abstraction: they run through the
 * exact same real economy (`applyEconomyTick`) and the exact same real
 * player-facing actions (`build`, `buyMilitary`, `explore`, `setGovernment`,
 * ...) that the human player uses, spending their own real `aiTurnsRemaining`
 * budget and their own real cash. "Personality" is entirely about *what* an
 * archetype chooses to do with that budget — a target composition + priority
 * list for purchases and buildings, a decision-table roll (pre-filtered down
 * to whatever it can actually afford), and multi-target intel/grudge-driven
 * combat & spying.
 *
 * Turn-budget refill and the End-Day catch-up loop live in `turn.ts` — this
 * file only ever spends whatever `aiTurnsRemaining` it's handed.
 */

import { config } from "../config";
import { battleUnits, emptyAcres, projectRates } from "../economy";
import { applyEconomyTick } from "../economy";
import { build, buildingsPerTurn, costPerBuilding } from "../build";
import { buyMilitary, privateBuyPrice } from "../military";
import { explore } from "../explore";
import { setGovernment, setTaxRate } from "../policy";
import { resolveCombat, offensePower, defensePower } from "../combat";
import { resolveCovertOp, isHarmful } from "../covert";
import { attacksUnlockDay } from "../pacing";
import { gov } from "../government";
import { addGrudge } from "../grudges";
import { availableMilitary } from "../brigades";
import { BUILDING_TYPES, PURCHASABLE_UNITS } from "../types";
import type {
  AttackOrders,
  AttackType,
  CombatResult,
  CovertOp,
  CovertResult,
  DifficultyTier,
  Military,
  Nation,
  Rng,
} from "../types";
import { decideAction } from "./decide";
import { ARCHETYPE_ACTIONS, ARCHETYPES, type ArchetypeTemplate } from "./templates";

export interface RosterTurnInput {
  player: Nation;
  enemies: Nation[];
}

export interface ArchetypeTurnResult {
  player: Nation;
  enemies: Nation[];
  combat?: CombatResult;
  covert?: CovertResult;
  log: string[];
}

function getNation(input: RosterTurnInput, id: string): Nation | undefined {
  if (input.player.id === id) return input.player;
  return input.enemies.find((e) => e.id === id);
}

function setNation(input: RosterTurnInput, id: string, next: Nation): RosterTurnInput {
  if (input.player.id === id) return { ...input, player: next };
  return { ...input, enemies: input.enemies.map((e) => (e.id === id ? next : e)) };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const ATTACK_MIX_KEYS: readonly AttackType[] = ["standard", "planned", "guerilla", "bombing", "artillery"];

/** Weighted-random attack type from the template's mix — the no-intel fallback. */
function pickAttackType(t: ArchetypeTemplate, rng: Rng): AttackType {
  const total = ATTACK_MIX_KEYS.reduce((s, k) => s + (t.attackTypeMix[k] ?? 0), 0);
  if (total <= 0) return "standard";
  let roll = rng() * total;
  for (const k of ATTACK_MIX_KEYS) {
    roll -= t.attackTypeMix[k] ?? 0;
    if (roll < 0) return k;
  }
  return "standard";
}

/**
 * Season heat: a single scalar that ramps hostile intent from ×1 on day 1 to
 * ×`seasonHeatMaxMult` on the season's final day. Keeps turtling early safe (a
 * build race) while making every archetype come for you as the deadline nears.
 */
function seasonHeatMult(day: number, seasonLengthDays: number): number {
  const progress = Math.min(1, Math.max(0, day / Math.max(1, seasonLengthDays)));
  return 1 + progress * (config.seasonHeatMaxMult - 1);
}

/** Cheapest unit this nation could buy right now — the affordability floor. */
function cheapestUnitCost(n: Nation): number {
  return Math.min(...PURCHASABLE_UNITS.map((u) => privateBuyPrice(n, u)));
}

/**
 * Order a set of categories by how far under their target share they are
 * (biggest deficit first), tie-broken by a fixed priority list. Shared by
 * both the military-purchase recipe and the building recipe.
 */
function orderByDeficit<T extends string>(
  types: readonly T[],
  current: Record<T, number>,
  targetPct: Record<T, number>,
  priority: readonly T[],
): T[] {
  const totalCur = types.reduce((s, t) => s + Math.max(0, current[t]), 0);
  const totalTarget = types.reduce((s, t) => s + Math.max(0, targetPct[t]), 0) || 1;
  const priorityRank = new Map(priority.map((t, i) => [t, i]));
  const scored = types.map((t) => {
    const curShare = totalCur > 0 ? current[t] / totalCur : 0;
    const targetShare = Math.max(0, targetPct[t]) / totalTarget;
    return { t, deficit: targetShare - curShare };
  });
  scored.sort((a, b) => {
    if (Math.abs(a.deficit - b.deficit) > 1e-9) return b.deficit - a.deficit;
    return (priorityRank.get(a.t) ?? 999) - (priorityRank.get(b.t) ?? 999);
  });
  return scored.map((s) => s.t);
}

/** How many more of this unit type are needed to reach exactly its target
 * share of the army — solves for the fact that buying more of it also grows
 * the total, not just the raw (target − current) count. Returns 0 if it's
 * already at or above target. */
function neededToCloseGap(current: number, totalCur: number, targetSharePct: number): number {
  const targetShare = targetSharePct / 100;
  if (targetShare <= 0) return 0;
  if (targetShare >= 1) return Infinity; // defensive; never happens with a real 4-way split
  const raw = (targetShare * totalCur - current) / (1 - targetShare);
  return Math.max(0, raw);
}

/**
 * Spend toward the military target recipe. One combined spending ceiling for
 * the whole decision (`template.militarySpendFraction` of current cash), used
 * in two phases:
 *
 *  1. Catch up whichever unit type is furthest under target, buying exactly
 *     enough to close *that* gap — not a flat slice regardless of size. Only
 *     moves on to the next-most-behind type once the current one is fully
 *     caught up; if the budget runs dry mid-catch-up, it buys as much of the
 *     current pick as it can afford and stops there — it does not spread the
 *     shortfall onto a cheaper, less-urgent type instead.
 *  2. Once nothing is behind target anymore, keeps growing anyway rather
 *     than leaving budget unspent: splits whatever's left evenly (in
 *     dollars) across `buyPriority` order. Because pricier types buy fewer
 *     units per dollar, this phase gently drifts the mix back off-target
 *     over time — expected, and self-corrected by phase 1 the next time
 *     this decision fires.
 */
function buyMilitaryTowardMix(self: Nation, template: ArchetypeTemplate): { nation: Nation; log: string[] } {
  let n = self;
  const log: string[] = [];
  let purchases = 0;
  let budget = n.cash * template.militarySpendFraction;
  let stoppedShort = false;

  while (
    !stoppedShort &&
    purchases < config.archetypeMaxPurchasesPerAction &&
    n.aiTurnsRemaining >= config.turnCost.buyMilitary &&
    budget > 0
  ) {
    const totalCur = PURCHASABLE_UNITS.reduce((s, u) => s + n.military[u], 0);
    const order = orderByDeficit(PURCHASABLE_UNITS, n.military, template.targetMix, template.buyPriority);
    const type = order[0]!;
    const needed = neededToCloseGap(n.military[type], totalCur, template.targetMix[type]);
    if (needed <= 0) break; // nothing left to catch up anywhere — move on to phase 2

    const unitPrice = privateBuyPrice(n, type);
    if (unitPrice <= 0) break;
    const target = Math.max(1, Math.ceil(needed));
    const affordableQty = Math.min(config.maxBuyPerAction, Math.floor(budget / unitPrice));
    const qty = Math.min(target, affordableQty);
    if (qty <= 0) {
      stoppedShort = true; // can't even afford one of the thing most needed
      break;
    }

    const res = buyMilitary(n, n.aiTurnsRemaining, { type, qty });
    if (!res.ok) {
      stoppedShort = true;
      break;
    }
    n = { ...res.nation, aiTurnsRemaining: res.turnsRemaining };
    log.push(...res.log);
    budget -= qty * unitPrice;
    purchases++;
    if (qty < target) stoppedShort = true; // budget capped it short — stop, don't spread to others
  }

  if (!stoppedShort && budget > 0) {
    const slice = budget / template.buyPriority.length;
    for (const type of template.buyPriority) {
      if (purchases >= config.archetypeMaxPurchasesPerAction) break;
      if (n.aiTurnsRemaining < config.turnCost.buyMilitary) break;
      const unitPrice = privateBuyPrice(n, type);
      if (unitPrice <= 0) continue;
      const qty = Math.min(config.maxBuyPerAction, Math.floor(slice / unitPrice));
      if (qty <= 0) continue;
      const res = buyMilitary(n, n.aiTurnsRemaining, { type, qty });
      if (res.ok) {
        n = { ...res.nation, aiTurnsRemaining: res.turnsRemaining };
        log.push(...res.log);
        purchases++;
      }
    }
  }

  return { nation: n, log };
}

/** Spend toward the building target recipe — identical deficit-first-then-
 * priority logic, driving real `build()` calls instead of a free instant top-up. */
function buildTowardMix(self: Nation, template: ArchetypeTemplate): { nation: Nation; log: string[] } {
  const order = orderByDeficit(BUILDING_TYPES, self.buildings, template.buildingMix, template.buildPriority);
  let n = self;
  const log: string[] = [];
  let purchases = 0;
  for (const type of order) {
    if (purchases >= config.archetypeMaxPurchasesPerAction) break;
    if (n.aiTurnsRemaining < config.turnCost.build) break;
    if (emptyAcres(n) <= 0) break;
    const perAcre = costPerBuilding(n);
    const budget = n.cash * template.buildSpendFraction;
    const acres = Math.min(buildingsPerTurn(n), emptyAcres(n), Math.floor(budget / perAcre));
    if (acres <= 0) continue;
    const res = build(n, n.aiTurnsRemaining, { type, acres });
    if (res.ok) {
      n = { ...res.nation, aiTurnsRemaining: res.turnsRemaining };
      log.push(...res.log);
      purchases++;
    }
  }
  return { nation: n, log };
}

/**
 * Attack target-selection. Every candidate here already cleared `attackViable`
 * (the AI reckons it can win). Rank them by expected payoff — *not* by how
 * recently they were scouted, which is what used to funnel every AI onto the
 * same unlucky nation and farm it out of the game:
 *
 *   score = sizeScore × grudgeBonus × futilityDrag
 *
 *   sizeScore   — theirLand / myLand, clamped: punch up at whoever's ahead,
 *                 leave the cripples alone (their score floors out low)
 *   grudgeBonus — a live grievance nudges them up (≤1.5×), never an override
 *   futilityDrag— shaves a target this nation keeps bouncing off, before the
 *                 `attackFutilityThreshold` cutoff drops it entirely
 *
 * There's no "can I win?" term: `attackViable` no longer pre-filters on the
 * power math either, so the AI will swing at a stronger nation and let
 * combat's lopsided-fight variance decide. Highest score wins; ties break
 * toward more land, then a seeded coin flip. See config.targeting and
 * docs/archetype-calibration.md.
 */
function pickAttackTarget(self: Nation, candidates: Nation[], _day: number, rng: Rng): Nation | undefined {
  if (candidates.length === 0) return undefined;
  const t = config.targeting;
  const scored = candidates.map((c) => {
    const sizeScore = clamp(c.land / Math.max(1, self.land), t.sizeRatioMin, t.sizeRatioMax);

    const grudge = self.grudges[c.id];
    const grudgeBonus = grudge ? 1 + t.grudgeWeight * Math.min(grudge.score / t.grudgeSaturation, 1) : 1;

    const futility = self.attackFutility[c.id] ?? 0;
    const futilityDrag = clamp(1 - t.futilityDrag * (futility / config.attackFutilityThreshold), t.futilityDragFloor, 1);

    return { c, score: sizeScore * grudgeBonus * futilityDrag, rnd: rng() };
  });
  scored.sort((a, b) => b.score - a.score || b.c.land - a.c.land || a.rnd - b.rnd);
  return scored[0]!.c;
}

/**
 * Covert target-selection. A spy op exists to turn an unknown into a known, so
 * prefer a candidate with *no* fresh intel; failing that a grudge (get eyes on
 * whoever's coming after us); failing that random. Unlike the attack pick this
 * ignores size — the op is cheap and intel on anyone is useful.
 */
function pickCovertTarget(self: Nation, candidates: Nation[], day: number, rng: Rng): Nation | undefined {
  if (candidates.length === 0) return undefined;
  const scored = candidates.map((c) => {
    const intel = self.intel[c.id];
    const fresh = intel !== undefined && day - intel.day <= config.intelStalenessDays;
    const grudge = self.grudges[c.id];
    const tier = !fresh ? 0 : grudge ? 1 : 2;
    const tiebreak = tier === 1 ? grudge!.score : rng();
    return { c, tier, tiebreak };
  });
  scored.sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : b.tiebreak - a.tiebreak));
  return scored[0]!.c;
}

/** Per-single-unit offense power for this nation's current tech/government —
 * power is linear in unit counts, so a fake one-unit force reads it off directly. */
function perUnitOffense(n: Nation, type: AttackType, unit: "troops" | "jets" | "tanks"): number {
  const one: Military = { troops: 0, jets: 0, turrets: 0, tanks: 0, spies: 0, [unit]: 1 };
  return offensePower({ ...n, military: one, brigades: [] }, type);
}

/**
 * Attack type + force sizing. With fresh intel on the target: exploit its
 * weakest known stat (weak turrets → Bombing, weak tanks → Artillery, weak
 * troops → Guerilla) and size the force to `attackForceMargin`× their known
 * defense instead of a blind full-send — unless nothing stands out (no clear
 * weak spot), in which case it's just a Standard land grab. Without decent
 * intel: today's weighted dice roll on attack type, full-send force.
 */
function chooseAttack(
  self: Nation,
  target: Nation,
  day: number,
  template: ArchetypeTemplate,
  rng: Rng,
): { type: AttackType; orders?: AttackOrders } {
  const intel = self.intel[target.id];
  const fresh = intel !== undefined && day - intel.day <= config.intelStalenessDays;
  if (!fresh) return { type: pickAttackType(template, rng) };

  const m = intel!.military;
  const mean = (m.turrets + m.tanks + m.troops) / 3;
  const minVal = Math.min(m.turrets, m.tanks, m.troops);
  if (!(minVal < mean * 0.8)) return { type: "standard" }; // no clear weak spot — just grab land

  const weakest: "turrets" | "tanks" | "troops" =
    m.turrets <= m.tanks && m.turrets <= m.troops ? "turrets" : m.tanks <= m.troops ? "tanks" : "troops";
  const type: AttackType = weakest === "turrets" ? "bombing" : weakest === "tanks" ? "artillery" : "guerilla";
  const unitField = type === "bombing" ? "jets" : type === "artillery" ? "tanks" : "troops";

  const avail = availableMilitary(self);
  const have = avail[unitField];
  if (have <= 0) return { type: "standard" }; // no force to exploit the weakness with

  const perUnit = perUnitOffense(self, type, unitField);
  if (perUnit <= 0) return { type: "standard" };
  const theirDefense = defensePower(target, type);
  const desired = Math.ceil((theirDefense * config.attackForceMargin) / perUnit);
  const send = Math.min(have, Math.max(1, desired));
  return { type, orders: { [unitField]: send } };
}

/**
 * Should this nation keep `target` on its attack list at all? The only hard
 * "no" left is experience: it's been repelled by them enough times recently
 * (`attackFutility` at/over threshold) that throwing more turns at them is
 * clearly pointless. The old pre-emptive power check — "I've scouted them and
 * my offense is below their defense × margin, so drop them" — has been
 * removed: it was what let a runaway leader fall off everyone's list the
 * moment they got scouted and then grow unopposed. Now the AI will still
 * swing at a stronger nation and let combat's lopsided-fight variance decide;
 * `pickAttackTarget`'s size/grudge score still means it mostly picks sensible
 * targets, and `attackFutility` pulls it off a hopeless one after a couple of
 * tries.
 */
function attackViable(self: Nation, target: Nation, _day: number): boolean {
  return (self.attackFutility[target.id] ?? 0) < config.attackFutilityThreshold;
}

/** No fresh intel yet? Go get some. Otherwise mix up harmful ops. */
function pickCovertOp(self: Nation, target: Nation, day: number, rng: Rng): CovertOp {
  const intel = self.intel[target.id];
  const fresh = intel !== undefined && day - intel.day <= config.intelStalenessDays;
  if (!fresh) return "spy";
  const harmful: CovertOp[] = ["bombBuildings", "raidFoodStores", "sabotageIntelligence", "causeDissensions", "espionage"];
  return harmful[Math.floor(rng() * harmful.length)]!;
}

export function applyArchetypeTurn(
  selfId: string,
  input: RosterTurnInput,
  tier: DifficultyTier,
  day: number,
  seasonLengthDays: number,
  taxComfortThreshold: number,
  rng: Rng,
): ArchetypeTurnResult {
  const self0 = getNation(input, selfId);
  // No tick at all once turns are already spent for the day — matches the
  // player exactly (an economy tick only ever happens alongside an actual
  // action being taken; it doesn't run "for free" just because it's been
  // called). Without this guard an already-tapped-out archetype would still
  // get a full economy tick every remaining player click that day, growing
  // faster than its own spent turns justify — the same class of bug this
  // whole rewrite exists to fix, just milder.
  if (!self0 || self0.defeated || self0.aiTurnsRemaining <= 0) {
    return { player: input.player, enemies: input.enemies, log: [] };
  }

  const template = ARCHETYPES[self0.archetype ?? "balanced"];
  const log: string[] = [];
  let self: Nation = self0;
  // "Cash" (a temporary revenue boost) is the one action that changes *this
  // call's* economy tick itself rather than something to execute separately
  // — so it has to be decided before the tick runs, same as every other
  // action here (decide/execute first on pre-tick state, tick last —
  // matching exactly how the player's own turn resolves in `turn.ts`).
  let revenueMult = 1;
  let target: Nation | undefined;
  let combat: CombatResult | undefined;
  let covert: CovertResult | undefined;

  // Mandatory first action: adopt the real target government. Free — leaving
  // Monarchy never costs anything. Skips the normal roll for this call — a
  // separate call handles the tax-rate correction below, same as a player
  // can only take one action per turn, never two bundled together.
  const idealTaxRate = Math.round(clamp(taxComfortThreshold, config.taxRateMin, config.taxRateMax) * 100) / 100;
  if (self.government === "monarchy" && template.government !== "monarchy") {
    const res = setGovernment(self, self.aiTurnsRemaining, template.government);
    if (res.ok) {
      self = { ...res.nation, aiTurnsRemaining: res.turnsRemaining };
      log.push(...res.log);
    }
  } else if (self.taxRate !== idealTaxRate) {
    // Mandatory second action: know your own government's real revenue
    // curve and set taxes to the season's actual sweet spot. Reading the
    // world's real `taxComfortThreshold` isn't the kind of free stat boost
    // this whole rewrite exists to prevent (it's not earning land/military
    // for nothing) — it's just basic competence a real government would
    // have about its own economy, unlike a player who has to feel it out.
    const res = setTaxRate(self, self.aiTurnsRemaining, idealTaxRate);
    if (res.ok) {
      self = { ...res.nation, aiTurnsRemaining: res.turnsRemaining };
      log.push(...res.log);
    }
  } else {
    const attacksLocked = day < attacksUnlockDay(seasonLengthDays);
    const aggression = tier.aggressionSkew * seasonHeatMult(day, seasonLengthDays);
    const candidates = [input.player, ...input.enemies].filter((n) => n.id !== selfId && !n.defeated);
    // Attack-only: drop anyone this nation can't realistically beat right now
    // (see `attackViable`). Spying still considers the full candidate list —
    // scouting a nation that's too strong to fight is exactly the point.
    const attackCandidates = candidates.filter((c) => attackViable(self, c, day));

    // Affordability mask: zero out whatever this archetype genuinely can't do
    // right now, then roll among the survivors.
    const weights = { ...template.decisionTable };
    if (
      attacksLocked ||
      attackCandidates.length === 0 ||
      battleUnits(self.military) <= 0 ||
      self.oil <= 0 ||
      self.aiTurnsRemaining < gov(self.government).turnsToAttack
    ) {
      weights.attackPlayer = 0;
    }
    if (candidates.length === 0 || self.military.spies <= 0 || self.aiTurnsRemaining < config.turnCost.covertOp) {
      weights.covertPlayer = 0;
    }
    if (self.aiTurnsRemaining < config.turnCost.buyMilitary || self.cash < cheapestUnitCost(self)) {
      weights.buildMilitary = 0;
    }
    // Upkeep brake: if actually making the purchase it *would* make this turn
    // leaves it unable to *pay* the bigger force (net cash income negative) or
    // to *feed* it (net bushels negative), don't grow the army at all — either
    // way it just bleeds a resource and deserts anyway. It'll roll
    // build-economy instead (farms first in the priority list), raising the
    // ceiling until it can afford the bigger bill. `buyMilitaryTowardMix` is
    // deterministic, so this trial run matches what an actual roll would buy.
    if (weights.buildMilitary > 0) {
      const afterBuy = buyMilitaryTowardMix(self, template).nation;
      const rates = projectRates(afterBuy, 1, seasonLengthDays, taxComfortThreshold);
      if (rates.cash < 0 || rates.bushelsNet < 0) {
        weights.buildMilitary = 0;
      }
    }
    if (self.aiTurnsRemaining < config.turnCost.build || emptyAcres(self) <= 0 || self.cash < costPerBuilding(self)) {
      weights.buildEconomy = 0;
    }
    // Explore only enters the roll once empty land is running low — expand
    // the borders so there's room to keep building. Turns-only, no cash gate.
    // Two gates: the archetype's own preference (tunable), and a hard cap at
    // `exploreMaxEmptyLandFraction` (the game rule — never explore a mostly
    // empty nation) that binds no matter how the preference is set.
    if (
      self.aiTurnsRemaining < config.turnCost.explore ||
      emptyAcres(self) > self.land * config.archetypeExploreLandFraction ||
      emptyAcres(self) >= self.land * config.exploreMaxEmptyLandFraction
    ) {
      weights.explore = 0;
    }
    weights.attackPlayer *= aggression;
    weights.covertPlayer *= aggression;

    const anyAffordable = ARCHETYPE_ACTIONS.some((a) => weights[a] > 0);

    if (!anyAffordable) {
      // Nothing costed is affordable — guaranteed forward progress, never
      // idle from indecision. Two turns-only options, no cash needed for
      // either: cash a turn for a revenue boost (fixes the actual cash
      // shortage that's usually *why* nothing else was affordable), or
      // explore for more land once there's no empty land left to build on
      // anyway (so more cash wouldn't unblock anything right now).
      const outOfRoom = emptyAcres(self) <= 0;
      if (outOfRoom && self.aiTurnsRemaining >= config.turnCost.explore) {
        const res = explore(self, self.aiTurnsRemaining, seasonLengthDays);
        if (res.ok) {
          self = { ...res.nation, aiTurnsRemaining: res.turnsRemaining };
          log.push(...res.log);
        }
      } else if (self.aiTurnsRemaining >= config.turnCost.cash) {
        self = { ...self, aiTurnsRemaining: self.aiTurnsRemaining - config.turnCost.cash };
        revenueMult = config.cashTurnBonus;
        log.push(`${self.name} cashed a turn for a revenue boost.`);
      } else if (
        self.aiTurnsRemaining >= config.turnCost.explore &&
        emptyAcres(self) < self.land * config.exploreMaxEmptyLandFraction
      ) {
        const res = explore(self, self.aiTurnsRemaining, seasonLengthDays);
        if (res.ok) {
          self = { ...res.nation, aiTurnsRemaining: res.turnsRemaining };
          log.push(...res.log);
        }
      }
    } else {
      const effectiveTemplate = { ...template, decisionTable: weights };
      const action = decideAction(effectiveTemplate, 1, rng); // aggression already folded in above

      if (action === "explore") {
        const res = explore(self, self.aiTurnsRemaining, seasonLengthDays);
        if (res.ok) {
          self = { ...res.nation, aiTurnsRemaining: res.turnsRemaining };
          log.push(...res.log);
        }
      } else if (action === "buildEconomy") {
        const r = buildTowardMix(self, template);
        self = r.nation;
        log.push(...r.log);
      } else if (action === "buildMilitary") {
        const r = buyMilitaryTowardMix(self, template);
        self = r.nation;
        log.push(...r.log);
      } else if (action === "attackPlayer") {
        const picked = pickAttackTarget(self, attackCandidates, day, rng);
        if (picked) {
          const { type, orders } = chooseAttack(self, picked, day, template, rng);
          const res = resolveCombat(self, picked, type, rng, orders);
          // resolveCombat (like resolveCovertOp below) doesn't bake in a turn
          // cost the way build/buyMilitary/explore do — the caller deducts it,
          // same as turn.ts does for the player's own "attack" action.
          const isLandGrab = type === "standard" || type === "planned";
          const turnCost = isLandGrab ? gov(self.government).turnsToAttack : config.turnCost.attackOther;
          // Update our own "can I beat this one" memory: a repelled attack
          // makes them harder to justify next time, a win wipes the doubt.
          const nextFutility = { ...self.attackFutility };
          if (res.result.outcome === "attacker_won") delete nextFutility[picked.id];
          else nextFutility[picked.id] = (nextFutility[picked.id] ?? 0) + config.attackFutilityRepelledScore;
          self = {
            ...res.attacker,
            aiTurnsRemaining: Math.max(0, self.aiTurnsRemaining - turnCost),
            attackFutility: nextFutility,
          };
          target = addGrudge(res.defender, self.id, day, `attacked you (${type})`, config.grudgeAttackedScore);
          combat = res.result;
          log.push(...res.result.log);
        }
      } else if (action === "covertPlayer") {
        const picked = pickCovertTarget(self, candidates, day, rng);
        if (picked) {
          const heat = picked.covertHeat;
          const op = pickCovertOp(self, picked, day, rng);
          const res = resolveCovertOp(self, picked, op, day, rng, heat);
          self = { ...res.attacker, aiTurnsRemaining: Math.max(0, self.aiTurnsRemaining - config.turnCost.covertOp) };
          target = res.defender;
          if (isHarmful(op)) target = { ...target, covertHeat: heat + config.covert.heatPerOp };
          if (res.result.intel) self = { ...self, intel: { ...self.intel, [picked.id]: res.result.intel } };
          if (!res.result.success && res.result.detected) {
            target = addGrudge(target, self.id, day, `was caught attempting ${op}`, config.grudgeFailedSpyScore);
          }
          covert = res.result;
          log.push(...res.result.log);
        }
      }
    }
  }

  // Economy tick last, exactly once, using whatever revenueMult the decision
  // above resolved to (1 normally, boosted if "cash" was chosen) — matches
  // the player: choosing an action and ticking the economy are the same
  // event, not two separate steps.
  const eco = applyEconomyTick(self, revenueMult, rng, seasonLengthDays, taxComfortThreshold);
  self = { ...eco.nation, ticksAlive: self0.ticksAlive + 1 };
  log.push(...eco.log);

  let out = setNation(input, selfId, self);
  if (target) out = setNation(out, target.id, target);
  const result: ArchetypeTurnResult = { player: out.player, enemies: out.enemies, log };
  if (combat) result.combat = combat;
  if (covert) result.covert = covert;
  return result;
}
