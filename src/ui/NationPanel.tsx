import type { Nation } from "../engine/types";
import { TECH_CATEGORIES } from "../engine/types";
import { builtAcres, emptyAcres, perCapitaIncome, popCapacity, projectRates, spal, totalMilitary } from "../engine/economy";
import { offensePower, defensePower } from "../engine/combat";
import { restingMilitary } from "../engine/brigades";
import { techValue } from "../engine/tech";
import { netWorth } from "../engine/networth";
import { gov } from "../engine/government";
import { config } from "../engine/config";
import { TECH_META } from "../data/tech";
import { BUILDING_META_LIST } from "../data/buildings";
import { compact, money, num, pct, signed } from "./format";

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded border px-3 py-2 ${warn ? "border-rose-800 bg-rose-950/30" : "border-neutral-800 bg-neutral-900/60"}`}>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`text-sm font-semibold ${warn ? "text-rose-300" : "text-neutral-100"}`}>{value}</div>
      {sub && <div className="text-[11px] text-neutral-500">{sub}</div>}
    </div>
  );
}

const cell = "rounded border border-neutral-800 bg-neutral-900/60 py-1.5 text-center";

export function NationPanel({
  player,
  day,
  seasonLengthDays,
  turnsRemaining,
  taxComfortThreshold,
}: {
  player: Nation;
  day: number;
  seasonLengthDays: number;
  turnsRemaining: number;
  taxComfortThreshold: number;
}) {
  const rates = projectRates(player, 1, seasonLengthDays, taxComfortThreshold);
  const m = player.military;
  const daysLeft = Math.max(0, seasonLengthDays - day);
  const starving = player.bushels <= 0 || rates.bushelsNet < 0;
  const broke = rates.cash < 0;
  const g = gov(player.government);
  const totalMissiles = player.missiles.chemical + player.missiles.cruise + player.missiles.nuclear;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-100">{player.name}</h2>
        <div className="text-xs text-neutral-400">
          <span className="text-neutral-300">{g.label}</span> · Day <span className="text-neutral-200">{day}</span>/{seasonLengthDays}
          {daysLeft <= 5 && <span className="ml-1 text-amber-400">({daysLeft} left)</span>} ·{" "}
          <span className="text-emerald-400">{turnsRemaining}</span>/{config.turnPoolCap} turns
        </div>
      </div>

      {/* Economy */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Net worth" value={num(netWorth(player))} sub="season score" />
        <Stat label="Cash" value={money(player.cash)} sub={`${signed(rates.cash)}/turn net`} warn={broke} />
        <Stat label="Tax revenue" value={`${money(rates.grossCash)}/turn`} sub={`upkeep ${money(rates.upkeep)}/turn`} />
        <Stat label="Tax rate" value={pct(player.taxRate)} sub={`PCI ${money(perCapitaIncome(player, taxComfortThreshold))}`} />
      </div>

      {/* Resources */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Land" value={`${num(player.land)} ac`} sub={`${num(builtAcres(player))} built · ${num(emptyAcres(player))} empty`} />
        <Stat
          label="Population"
          value={num(player.population)}
          sub={`cap ${compact(popCapacity(player))}`}
        />
        <Stat label="Bushels" value={num(player.bushels)} sub={`${signed(rates.bushelsNet)}/turn`} warn={starving} />
        <Stat label="Oil" value={num(player.oil)} sub={`${signed(rates.oilNet)}/turn`} />
      </div>

      {/* Buildings */}
      <div className="grid grid-cols-4 gap-2 text-xs sm:grid-cols-8">
        {BUILDING_META_LIST.map((b) => (
          <div key={b.id} className={cell} title={b.blurb}>
            <div className="text-neutral-500">{b.label}</div>
            <div className="font-semibold text-neutral-200">{num(player.buildings[b.id])}</div>
          </div>
        ))}
      </div>

      {/* Military + missiles */}
      <div className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
        {(["troops", "jets", "turrets", "tanks", "spies"] as const).map((u) => (
          <div key={u} className={cell}>
            <div className="text-neutral-500">{u}</div>
            <div className="font-semibold text-neutral-200">{num(m[u])}</div>
          </div>
        ))}
        <div className={cell} title="Chemical / Cruise / Nuclear">
          <div className="text-neutral-500">missiles</div>
          <div className="font-semibold text-amber-200">{num(totalMissiles)}</div>
        </div>
      </div>

      {/* Resting brigades — Planned Strike forces unavailable to attack or defend */}
      {player.brigades.length > 0 && (
        <div className="rounded border border-amber-800 bg-amber-950/20 px-3 py-1.5 text-[11px] text-amber-200">
          {player.brigades.length} brigade{player.brigades.length > 1 ? "s" : ""} resting —{" "}
          {(() => {
            const r = restingMilitary(player);
            const parts = [
              r.troops > 0 && `${num(r.troops)} troops`,
              r.jets > 0 && `${num(r.jets)} jets`,
              r.tanks > 0 && `${num(r.tanks)} tanks`,
            ].filter(Boolean);
            const soonest = Math.min(...player.brigades.map((b) => b.turnsLeft));
            return `${parts.join(", ")} unavailable to attack or defend · back in ${soonest}+ turns`;
          })()}
        </div>
      )}

      {/* Tech (11) */}
      <div className="grid grid-cols-3 gap-2 text-[11px] sm:grid-cols-6">
        {TECH_CATEGORIES.map((c) => {
          const v = techValue(player, c);
          const shown = c === "military" || c === "medical" ? `${pct(1 - v, 0)} off` : `×${v.toFixed(2)}`;
          return (
            <div
              key={c}
              className={`${cell} ${player.researchFocus === c ? "border-emerald-700 bg-emerald-950/30" : ""}`}
              title={TECH_META[c].blurb}
            >
              <div className="text-neutral-500">{TECH_META[c].label}</div>
              <div className="font-semibold text-neutral-200">{shown}</div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 text-[11px] text-neutral-500">
        <span>Army: <span className="text-neutral-300">{num(totalMilitary(m))}</span></span>
        <span>Offense: <span className="text-amber-300">{num(offensePower(player))}</span></span>
        <span>Defense: <span className="text-sky-300">{num(defensePower(player) + config.homeDefenseBonus)}</span></span>
        <span>SPAL: <span className="text-violet-300">{spal(player).toFixed(2)}</span></span>
        <span>Researching: <span className="text-emerald-300">{player.researchFocus}</span></span>
      </div>
    </section>
  );
}
