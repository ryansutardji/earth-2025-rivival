/**
 * Turn orchestration. One player action = one world tick:
 *   1. resolve the player's action (may be rejected, leaving the world untouched)
 *   2. advance the world one tick — player economy runs, every undefeated
 *      archetype takes its turn (and a Raider may hit the player back)
 *   3. resolve whether the season has ended
 *
 * All randomness flows through the single RNG rehydrated from `world.rngState`,
 * written back before returning so a saved game resumes the exact stream.
 */

import { config } from "./config";
import { createRng } from "./rng";
import { applyEconomyTick } from "./economy";
import { build, demolish } from "./build";
import { explore } from "./explore";
import { buyMilitary, buyResource } from "./military";
import { setGovernment, setProduction, setResearchFocus, setTaxRate } from "./policy";
import { resolveCombat, resolveSent } from "./combat";
import { resolveCovertOp, isHarmful } from "./covert";
import { resolveMissile } from "./missile";
import { gov } from "./government";
import { applyArchetypeTurn } from "./archetype/applyTurn";
import { computeStandings } from "./networth";
import { attacksUnlockDay, aiTurnPool } from "./pacing";
import { availableMilitary, tickBrigades } from "./brigades";
import { addGrudge, decayDaily } from "./grudges";
import { getTier } from "../data/difficultyTiers";
import type {
  AttackOrders,
  AttackType,
  Buildings,
  CombatResult,
  CovertOp,
  CovertResult,
  GovernmentId,
  MissileResult,
  MissileType,
  Nation,
  ProductionMix,
  Rng,
  TechCategory,
  WorldState,
} from "./types";
import type { ResourceGood, UnitType } from "./military";

export type PlayerAction =
  | { kind: "build"; buildingType: keyof Buildings; acres: number }
  | { kind: "demolish"; buildingType: keyof Buildings; acres: number }
  | { kind: "buyMilitary"; unitType: UnitType; qty: number }
  | { kind: "explore" }
  | { kind: "cash" }
  | { kind: "setTaxRate"; rate: number }
  | { kind: "setProduction"; mix: Partial<ProductionMix> }
  | { kind: "setResearchFocus"; focus: TechCategory }
  | { kind: "setGovernment"; government: GovernmentId }
  | { kind: "buyResource"; good: ResourceGood; qty: number }
  | { kind: "attack"; targetId: string; attackType: AttackType; send?: AttackOrders }
  | { kind: "covertOp"; targetId: string; op: CovertOp }
  | { kind: "launchMissile"; targetId: string; missile: MissileType }
  | { kind: "endDay" };

export interface TurnOutcome {
  world: WorldState;
  ok: boolean;
  error?: string;
  battleReport?: CombatResult;
  covertReport?: CovertResult;
  missileReport?: MissileResult;
}

const MAX_LOG = 500;

function pushLog(world: WorldState, lines: string[]): void {
  if (lines.length === 0) return;
  world.log.push(...lines);
  if (world.log.length > MAX_LOG) world.log = world.log.slice(-MAX_LOG);
}

/** Player economy tick + every undefeated archetype's turn. */
function advanceWorldTick(
  world: WorldState,
  rng: Rng,
  revenueMult: number,
  turnsSpent: number,
  economyTurns: number,
  logPerTurn: boolean,
): { combat?: CombatResult; covert?: CovertResult } {
  const tier = getTier(world.config.tierId);
  // Economy accrues per turn, not per action: an action that spent 4 turns
  // ticks 4×. On End Day the leftover (unspent) turns are credited here, so a
  // full day always ticks a full day's worth whether played out or idled.
  // `logPerTurn` breaks a multi-turn action's economy into one line per turn.
  const eco = applyEconomyTick(world.player, revenueMult, rng, world.seasonLengthDays, world.taxComfortThreshold, economyTurns, logPerTurn);
  world.player = eco.nation;
  pushLog(world, eco.log);

  // Planned Strike brigades rest by actual turns spent, carrying over across
  // day boundaries — not reset by End Day, unlike `turnsRemaining`.
  world.player = tickBrigades(world.player, turnsSpent);

  let combat: CombatResult | undefined;
  let covert: CovertResult | undefined;
  // Re-look-up each nation by id every iteration (rather than iterating a
  // stale snapshot) so a nation defeated earlier this same tick, by another
  // archetype's attack, doesn't still get a turn.
  const ids = world.enemies.map((e) => e.id);
  for (const id of ids) {
    const current = world.enemies.find((e) => e.id === id);
    if (!current || current.defeated) continue;
    const res = applyArchetypeTurn(id, { player: world.player, enemies: world.enemies }, tier, world.day, world.seasonLengthDays, world.taxComfortThreshold, rng);
    world.player = res.player;
    world.enemies = res.enemies;
    pushLog(world, res.log);
    if (res.combat) combat = res.combat;
    if (res.covert) covert = res.covert;
  }
  const out: { combat?: CombatResult; covert?: CovertResult } = {};
  if (combat) out.combat = combat;
  if (covert) out.covert = covert;
  return out;
}

/** End-Day catch-up: an archetype gets one real action per player action
 * during the day (trickle, above), but must never be shortchanged by an
 * inactive player — this drains its remaining `aiTurnsRemaining` before the
 * day rolls over, using *today's* budget and *today's* day number. */
function catchUpArchetype(world: WorldState, id: string, rng: Rng): { combat?: CombatResult; covert?: CovertResult } {
  const tier = getTier(world.config.tierId);
  let combat: CombatResult | undefined;
  let covert: CovertResult | undefined;
  let guard = 0;
  while (guard++ < 200) {
    const self = world.enemies.find((e) => e.id === id);
    if (!self || self.defeated || self.aiTurnsRemaining <= 0) break;
    const before = self.aiTurnsRemaining;
    const res = applyArchetypeTurn(id, { player: world.player, enemies: world.enemies }, tier, world.day, world.seasonLengthDays, world.taxComfortThreshold, rng);
    world.player = res.player;
    world.enemies = res.enemies;
    pushLog(world, res.log);
    if (res.combat) combat = res.combat;
    if (res.covert) covert = res.covert;
    const after = world.enemies.find((e) => e.id === id);
    if (!after || after.aiTurnsRemaining >= before) break; // no progress possible — stop instead of spinning
  }
  const out: { combat?: CombatResult; covert?: CovertResult } = {};
  if (combat) out.combat = combat;
  if (covert) out.covert = covert;
  return out;
}

function resolveSeasonEnd(world: WorldState): void {
  if (world.status !== "playing") return;

  // Same elimination rule as every AI nation: land or army collapse ends it.
  if (world.player.defeated) {
    world.status = "lost_eliminated";
    pushLog(world, [`Your nation was overrun on day ${world.day} — season lost.`]);
    return;
  }

  if (world.enemies.every((e) => e.defeated)) {
    world.status = "won_elimination";
    pushLog(world, [`Every enemy nation eliminated on day ${world.day} — elimination victory!`]);
    return;
  }

  if (world.day > world.seasonLengthDays) {
    const standings = computeStandings(world);
    const top = standings[0]!;
    if (top.isPlayer) {
      world.status = "won_networth";
      pushLog(world, [`Season over. You finished #1 by net worth (${top.netWorth.toLocaleString()}) — victory!`]);
    } else {
      world.status = "lost_networth";
      pushLog(world, [`Season over. ${top.name} out-scored you on net worth (${top.netWorth.toLocaleString()}). Season lost.`]);
    }
  }
}

function reject(world: WorldState, error: string): TurnOutcome {
  return { world, ok: false, error };
}

export function applyPlayerTurn(prev: WorldState, action: PlayerAction): TurnOutcome {
  if (prev.status !== "playing") return reject(prev, "The season is over. Start a new one.");

  const world: WorldState = {
    ...prev,
    player: { ...prev.player },
    enemies: prev.enemies.map((e) => ({ ...e })),
    log: [...prev.log],
  };
  const rng = createRng(world.rngState);
  const turnsBefore = world.turnsRemaining;

  let playerReport: CombatResult | undefined;
  let playerCovert: CovertResult | undefined;
  let playerMissile: MissileResult | undefined;
  let catchUpCombat: CombatResult | undefined;
  let catchUpCovert: CovertResult | undefined;
  let revenueMult = 1;

  const applySimple = (r: { ok: boolean; error?: string; nation: Nation; turnsRemaining: number; log: string[] }, fallback: string) => {
    if (!r.ok) return reject(prev, r.error ?? fallback);
    world.player = r.nation;
    world.turnsRemaining = r.turnsRemaining;
    pushLog(world, r.log);
    return null;
  };

  // Look up a live, non-defeated enemy by id, or a ready-to-return rejection.
  const findTarget = (targetId: string): { idx: number; target: Nation } | { reject: TurnOutcome } => {
    const idx = world.enemies.findIndex((e) => e.id === targetId);
    const target = idx >= 0 ? world.enemies[idx] : undefined;
    if (!target) return { reject: reject(prev, "No such enemy.") };
    if (target.defeated) return { reject: reject(prev, `${target.name} is already defeated.`) };
    return { idx, target };
  };

  // The pre-first-strike build-up window (shared by attacks and missiles). The
  // player's window is the tier's `attackUnlockFraction` capped at the
  // Veteran anchor — so easy tiers hold the AI back longer but never delay the
  // player past day-7-equivalent; hard tiers pull the player's window in too.
  const attackWindowClosed = (): TurnOutcome | null => {
    const tier = getTier(world.config.tierId);
    const fraction = Math.min(tier.attackUnlockFraction, config.noAttackDaysFraction);
    const unlockDay = attacksUnlockDay(world.seasonLengthDays, fraction);
    return world.day < unlockDay
      ? reject(prev, `No attacking until day ${unlockDay} — build up your forces first.`)
      : null;
  };

  switch (action.kind) {
    case "build": {
      const bad = applySimple(build(world.player, world.turnsRemaining, { type: action.buildingType, acres: action.acres }), "Cannot build.");
      if (bad) return bad;
      break;
    }
    case "demolish": {
      const bad = applySimple(demolish(world.player, world.turnsRemaining, { type: action.buildingType, acres: action.acres }), "Cannot demolish.");
      if (bad) return bad;
      break;
    }
    case "buyMilitary": {
      const bad = applySimple(buyMilitary(world.player, world.turnsRemaining, { type: action.unitType, qty: action.qty }), "Cannot buy units.");
      if (bad) return bad;
      break;
    }
    case "explore": {
      const bad = applySimple(explore(world.player, world.turnsRemaining, world.seasonLengthDays), "Cannot explore.");
      if (bad) return bad;
      break;
    }
    case "cash": {
      if (world.turnsRemaining < config.turnCost.cash) return reject(prev, "Not enough turns.");
      world.turnsRemaining -= config.turnCost.cash;
      revenueMult = config.cashTurnBonus;
      pushLog(world, ["Cashed a turn — this turn's revenue is boosted."]);
      break;
    }
    case "setTaxRate": {
      const bad = applySimple(setTaxRate(world.player, world.turnsRemaining, action.rate), "Cannot change tax rate.");
      if (bad) return bad;
      break;
    }
    case "setProduction": {
      const bad = applySimple(setProduction(world.player, world.turnsRemaining, action.mix), "Cannot set production.");
      if (bad) return bad;
      break;
    }
    case "setResearchFocus": {
      const bad = applySimple(setResearchFocus(world.player, world.turnsRemaining, action.focus), "Cannot change research.");
      if (bad) return bad;
      break;
    }
    case "setGovernment": {
      const bad = applySimple(setGovernment(world.player, world.turnsRemaining, action.government), "Cannot change government.");
      if (bad) return bad;
      break;
    }
    case "buyResource": {
      const bad = applySimple(buyResource(world.player, world.turnsRemaining, { good: action.good, qty: action.qty }), "Cannot buy.");
      if (bad) return bad;
      break;
    }
    case "attack": {
      const closed = attackWindowClosed();
      if (closed) return closed;
      if (action.attackType === "planned" && world.player.brigades.length >= config.maxBrigades) {
        return reject(prev, `All ${config.maxBrigades} brigades are resting — wait for one to return before another planned strike.`);
      }
      const cost = gov(world.player.government).turnsToAttack;
      const isLandGrab = action.attackType === "standard" || action.attackType === "planned";
      const turnCost = isLandGrab ? cost : config.turnCost.attackOther;
      if (world.turnsRemaining < turnCost) return reject(prev, "Not enough turns to attack.");

      const avail = availableMilitary(world.player);
      for (const u of ["troops", "jets", "tanks"] as const) {
        const want = action.send?.[u];
        if (want !== undefined && want > avail[u]) {
          return reject(prev, `Not enough available ${u} — you have ${avail[u]} (some may be resting in a brigade).`);
        }
      }
      const sent = resolveSent(world.player, action.attackType, action.send);
      const sentTotal = sent.troops + sent.jets + sent.tanks;
      if (sentTotal <= 0) return reject(prev, `A ${action.attackType} attack has no units to send.`);
      const oilCost = Math.ceil(sentTotal / config.unitsPerOilBarrel);
      if (world.player.oil < oilCost) return reject(prev, `That attack needs ${oilCost} oil. Build oil rigs or buy some.`);

      const t = findTarget(action.targetId);
      if ("reject" in t) return t.reject;
      const { idx, target } = t;

      const res = resolveCombat(world.player, target, action.attackType, rng.next, action.send);
      world.player = res.attacker;
      world.enemies[idx] = addGrudge(res.defender, world.player.id, world.day, `attacked you (${action.attackType})`, config.grudgeAttackedScore);
      world.turnsRemaining -= turnCost;
      playerReport = res.result;
      pushLog(world, res.result.log);
      break;
    }
    case "covertOp": {
      if (world.turnsRemaining < config.turnCost.covertOp) return reject(prev, "Not enough turns.");
      if (world.player.military.spies <= 0) return reject(prev, "You have no spies. Set production toward spies.");
      const t = findTarget(action.targetId);
      if ("reject" in t) return t.reject;
      const { idx, target } = t;

      const heat = target.covertHeat;
      const res = resolveCovertOp(world.player, target, action.op, world.day, rng.next, heat);
      world.player = res.attacker;
      let nextDefender = res.defender;
      if (isHarmful(action.op)) nextDefender = { ...nextDefender, covertHeat: heat + config.covert.heatPerOp };
      if (res.result.intel) world.player = { ...world.player, intel: { ...world.player.intel, [target.id]: res.result.intel } };
      if (!res.result.success && res.result.detected) {
        nextDefender = addGrudge(nextDefender, world.player.id, world.day, `was caught attempting ${action.op}`, config.grudgeFailedSpyScore);
      }
      world.enemies[idx] = nextDefender;
      world.turnsRemaining -= config.turnCost.covertOp;
      playerCovert = res.result;
      pushLog(world, res.result.log);
      break;
    }
    case "launchMissile": {
      const closed = attackWindowClosed();
      if (closed) return closed;
      if (world.turnsRemaining < config.turnCost.launchMissile) return reject(prev, "Not enough turns.");
      if (world.player.missiles[action.missile] <= 0) return reject(prev, `You have no ${action.missile} missiles.`);
      const oilCost = config.missile.oilCost[action.missile];
      if (world.player.oil < oilCost) return reject(prev, `Launching needs ${oilCost} oil.`);
      const t = findTarget(action.targetId);
      if ("reject" in t) return t.reject;
      const { idx, target } = t;

      const res = resolveMissile(world.player, target, action.missile, rng.next);
      world.player = res.attacker;
      world.enemies[idx] = res.defender;
      world.turnsRemaining -= config.turnCost.launchMissile;
      playerMissile = res.result;
      pushLog(world, res.result.log);
      break;
    }
    case "endDay": {
      // Every archetype finishes out *today's* turns (today's day number,
      // today's budget) before the day rolls over — never shortchanged by an
      // inactive player.
      for (const e of [...world.enemies]) {
        if (e.defeated) continue;
        const r = catchUpArchetype(world, e.id, rng.next);
        if (r.combat) catchUpCombat = r.combat;
        if (r.covert) catchUpCovert = r.covert;
      }

      world.turnsRemaining = config.turnPoolCap;
      world.day += 1;
      world.player = decayDaily(world.player);
      const aiPool = aiTurnPool(getTier(world.config.tierId));
      world.enemies = world.enemies.map((e) => (e.defeated ? e : { ...decayDaily(e), aiTurnsRemaining: aiPool }));
      if (world.day <= world.seasonLengthDays) pushLog(world, [`— Day ${world.day} —`]);
      break;
    }
  }

  const turnsSpent = action.kind === "endDay" ? 0 : Math.max(0, turnsBefore - world.turnsRemaining);
  // End Day credits the day's unspent turns to the economy (see advanceWorldTick)
  // as a single lump — the per-turn breakdown is only for the player's own
  // actions, where they spent the turns on purpose.
  const economyTurns = action.kind === "endDay" ? turnsBefore : turnsSpent;
  const incoming = advanceWorldTick(world, rng.next, revenueMult, turnsSpent, economyTurns, action.kind !== "endDay");
  world.rngState = rng.getState();
  resolveSeasonEnd(world);

  const outcome: TurnOutcome = { world, ok: true };
  const report = playerReport ?? catchUpCombat ?? incoming.combat;
  if (report) outcome.battleReport = report;
  const covert = playerCovert ?? catchUpCovert ?? incoming.covert;
  if (covert) outcome.covertReport = covert;
  if (playerMissile) outcome.missileReport = playerMissile;
  return outcome;
}
