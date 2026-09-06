import { useState } from "react";
import type { AttackOrders, AttackType, CovertOp, EnemyIntel, MissileType, Nation } from "../engine/types";
import { totalMilitary } from "../engine/economy";
import { defensePower } from "../engine/combat";
import { availableMilitary } from "../engine/brigades";
import { covertSuccessChance } from "../engine/covert";
import { gov } from "../engine/government";
import { config } from "../engine/config";
import { ARCHETYPES } from "../data/archetypes";
import { TECH_META } from "../data/tech";
import { useGame } from "../state/store";
import { compact, money, num, pct } from "./format";

function threatLabel(enemy: Nation, playerOffense: number): { text: string; cls: string } {
  const ratio = playerOffense / Math.max(1, defensePower(enemy) + config.homeDefenseBonus);
  if (ratio >= 2) return { text: "soft", cls: "text-emerald-400" };
  if (ratio >= 1) return { text: "even", cls: "text-amber-400" };
  return { text: "hard", cls: "text-rose-400" };
}

const ATTACKS: { type: AttackType; label: string }[] = [
  { type: "standard", label: "Standard" },
  { type: "planned", label: "Planned" },
  { type: "guerilla", label: "Guerilla" },
  { type: "bombing", label: "Bombing" },
  { type: "artillery", label: "Artillery" },
];
const OPS: { op: CovertOp; label: string }[] = [
  { op: "spy", label: "Spy" },
  { op: "espionage", label: "Espionage" },
  { op: "bombBuildings", label: "Bomb Buildings" },
  { op: "raidFoodStores", label: "Raid Food" },
  { op: "sabotageIntelligence", label: "Sabotage Intel" },
  { op: "causeDissensions", label: "Dissension" },
];
const MISSILES: MissileType[] = ["chemical", "cruise", "nuclear"];

function IntelPanel({ intel, currentDay }: { intel: EnemyIntel; currentDay: number }) {
  const m = intel.military;
  const age = currentDay - intel.day;
  const totalMissiles = intel.missiles.chemical + intel.missiles.cruise + intel.missiles.nuclear;
  return (
    <div className="mt-1.5 rounded border border-sky-900 bg-sky-950/20 p-2 text-[11px] text-neutral-300">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-sky-400">
        Intel · day {intel.day}{age > 0 ? ` (${age}d old)` : " (fresh)"}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
        <span>land {num(intel.land)}</span>
        <span>pop {compact(intel.population)}</span>
        <span>net worth {compact(intel.netWorth)}</span>
        <span>cash {money(intel.cash)}</span>
        <span>bushels {compact(intel.bushels)} · oil {compact(intel.oil)}</span>
        <span>govt {gov(intel.government).label}</span>
        <span>troops {compact(m.troops)}</span>
        <span>jets {compact(m.jets)}</span>
        <span>turrets {compact(m.turrets)}</span>
        <span>tanks {compact(m.tanks)}</span>
        <span>spies {compact(m.spies)}</span>
        <span>missiles {num(totalMissiles)}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-neutral-500">
        {(["weapons", "spy", "sdi", "industrial"] as const).map((c) => (
          <span key={c}>{TECH_META[c].label} {compact(intel.tech[c])}pt</span>
        ))}
      </div>
    </div>
  );
}

function EnemyRow({
  enemy,
  player,
  playerOffense,
  intel,
  day,
  canAct,
}: {
  enemy: Nation;
  player: Nation;
  playerOffense: number;
  intel: EnemyIntel | undefined;
  day: number;
  canAct: boolean;
}) {
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const tmpl = ARCHETYPES[enemy.archetype ?? "balanced"];
  const threat = threatLabel(enemy, playerOffense);
  const hasSpies = player.military.spies > 0;
  const hasMissiles = player.missiles.chemical + player.missiles.cruise + player.missiles.nuclear > 0;
  const avail = availableMilitary(player);

  // Blank = "send everything available" (the simple default). Fill in any
  // field and the others become 0, not "everything" — see AttackOrders.
  const [troopsQty, setTroopsQty] = useState("");
  const [jetsQty, setJetsQty] = useState("");
  const [tanksQty, setTanksQty] = useState("");
  const buildSend = (): AttackOrders | undefined => {
    if (!troopsQty && !jetsQty && !tanksQty) return undefined;
    const send: AttackOrders = {};
    if (troopsQty) send.troops = Number(troopsQty);
    if (jetsQty) send.jets = Number(jetsQty);
    if (tanksQty) send.tanks = Number(tanksQty);
    return send;
  };

  return (
    <div className={`rounded border px-3 py-2 text-sm ${enemy.defeated ? "border-neutral-800 bg-neutral-900/30 text-neutral-600" : "border-neutral-700 bg-neutral-900/70"}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-semibold ${enemy.defeated ? "line-through" : "text-neutral-100"}`}>{enemy.name}</span>
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase text-neutral-400">{tmpl.label}</span>
            <span className="text-[10px] uppercase text-neutral-500">{gov(enemy.government).label}</span>
            {!enemy.defeated && <span className={`text-[10px] uppercase ${threat.cls}`}>{threat.text}</span>}
          </div>
          {!enemy.defeated && (
            <div className="mt-0.5 text-[11px] text-neutral-500">
              {num(enemy.land)} ac · {intel ? `army ${compact(totalMilitary(enemy.military))}` : "army unknown — Spy to reveal"}
            </div>
          )}
        </div>
        {enemy.defeated ? (
          <span className="text-[11px] uppercase text-neutral-600">eliminated</span>
        ) : (
          <button onClick={() => setOpen((v) => !v)} className="rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700">
            {open ? "hide" : "act ▾"}
          </button>
        )}
      </div>

      {!enemy.defeated && intel && <IntelPanel intel={intel} currentDay={day} />}

      {!enemy.defeated && open && (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 shrink-0 text-[10px] uppercase text-neutral-500">Send</span>
            {([
              ["troops", troopsQty, setTroopsQty] as const,
              ["jets", jetsQty, setJetsQty] as const,
              ["tanks", tanksQty, setTanksQty] as const,
            ]).map(([label, val, setVal]) => (
              <label key={label} className="flex items-center gap-1 text-[11px] text-neutral-500">
                {label}
                <input
                  type="number"
                  min="0"
                  placeholder="all"
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  className="w-16 rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-right text-xs"
                  title={`${num(avail[label])} available`}
                />
              </label>
            ))}
            <span className="text-[10px] text-neutral-600" title="Leave every field blank to send everything you have. Fill in any one and blank fields become 0, not &quot;everything.&quot;">
              blank = all
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 text-[10px] uppercase text-neutral-500">Attack</span>
            {ATTACKS.map((a) => (
              <button
                key={a.type}
                disabled={!canAct || (a.type === "planned" && player.brigades.length >= config.maxBrigades)}
                onClick={() => {
                  const send = buildSend();
                  act(send ? { kind: "attack", targetId: enemy.id, attackType: a.type, send } : { kind: "attack", targetId: enemy.id, attackType: a.type });
                }}
                className="rounded bg-rose-900 px-2 py-1 text-xs font-semibold hover:bg-rose-800 disabled:opacity-40"
                title={a.type === "planned" ? `+50% strength, but survivors rest ${config.plannedStrikeRestTurns} turns — unavailable to attack or defend (max ${config.maxBrigades} brigades at once)` : undefined}
              >
                {a.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 text-[10px] uppercase text-neutral-500">Covert</span>
            {OPS.map((o) => (
              <button
                key={o.op}
                disabled={!canAct || !hasSpies}
                onClick={() => act({ kind: "covertOp", targetId: enemy.id, op: o.op })}
                className="rounded bg-violet-900 px-2 py-1 text-xs font-semibold hover:bg-violet-800 disabled:opacity-40"
                title={hasSpies ? `~${pct(covertSuccessChance(player, enemy, o.op), 0)} success` : "no spies"}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 text-[10px] uppercase text-neutral-500">Missile</span>
            {MISSILES.map((mt) => (
              <button
                key={mt}
                disabled={!canAct || player.missiles[mt] <= 0}
                onClick={() => act({ kind: "launchMissile", targetId: enemy.id, missile: mt })}
                className="rounded bg-amber-900 px-2 py-1 text-xs font-semibold hover:bg-amber-800 disabled:opacity-40"
                title={hasMissiles ? `${player.missiles[mt]} in stock` : "no missiles (research Warfare)"}
              >
                {mt} ({player.missiles[mt]})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function EnemyList({
  enemies,
  player,
  playerOffense,
  intel,
  day,
  canAct,
}: {
  enemies: Nation[];
  player: Nation;
  playerOffense: number;
  intel: Record<string, EnemyIntel>;
  day: number;
  canAct: boolean;
}) {
  const remaining = enemies.filter((e) => !e.defeated).length;
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs uppercase tracking-wide text-neutral-500">Enemy roster</h3>
        <span className="text-xs text-neutral-500">{remaining} remaining</span>
      </div>
      <div className="space-y-1.5">
        {enemies.map((e) => (
          <EnemyRow key={e.id} enemy={e} player={player} playerOffense={playerOffense} intel={intel[e.id]} day={day} canAct={canAct} />
        ))}
      </div>
    </section>
  );
}
