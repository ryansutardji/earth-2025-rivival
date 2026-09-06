import { useState } from "react";
import { useGame } from "../state/store";
import { config } from "../engine/config";
import { TECH_CATEGORIES, UNIT_TYPES } from "../engine/types";
import type { Buildings, Nation, ProductionMix, TechCategory } from "../engine/types";
import type { UnitType } from "../engine/military";
import { buildingsPerTurn, costPerBuilding } from "../engine/build";
import { privateBuyPrice } from "../engine/military";
import { exploreYield } from "../engine/explore";
import { gov } from "../engine/government";
import { GOVERNMENT_IDS, GOVERNMENTS } from "../engine/government";
import { TECH_META } from "../data/tech";
import { BUILDING_META_LIST } from "../data/buildings";
import { money, num } from "./format";

const numInput = "w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-right";
const sel = "rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm";
const btn = "rounded bg-neutral-800 px-3 py-1.5 text-sm font-medium hover:bg-neutral-700 disabled:opacity-40";
const rowLabel = "w-20 shrink-0 text-xs uppercase tracking-wide text-neutral-500";

export function ActionBar({ player, disabled, seasonLengthDays }: { player: Nation; disabled: boolean; seasonLengthDays: number }) {
  const act = useGame((s) => s.act);

  const [buildType, setBuildType] = useState<keyof Buildings>("enterpriseZones");
  const [buildAcres, setBuildAcres] = useState(20);
  const [unitType, setUnitType] = useState<Exclude<UnitType, "spies">>("jets");
  const [unitQty, setUnitQty] = useState(50);
  const [taxPct, setTaxPct] = useState(Math.round(player.taxRate * 100));
  const [focus, setFocus] = useState<TechCategory>(player.researchFocus);
  const [govId, setGovId] = useState(player.government);
  const [prod, setProd] = useState<ProductionMix>(player.production);

  const bpt = buildingsPerTurn(player);

  return (
    <section className="space-y-2.5 rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <h3 className="text-xs uppercase tracking-wide text-neutral-500">Actions</h3>

      {/* Build / demolish */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={rowLabel}>Build</span>
        <select value={buildType} onChange={(e) => setBuildType(e.target.value as keyof Buildings)} className={sel}>
          {BUILDING_META_LIST.map((b) => (
            <option key={b.id} value={b.id}>{b.label}</option>
          ))}
        </select>
        <input type="number" min={1} value={buildAcres} onChange={(e) => setBuildAcres(Number(e.target.value))} className={numInput} />
        <span className="text-xs text-neutral-600">
          ≤{bpt}/turn · {money(costPerBuilding(player))}/ac · 1t
        </span>
        <button className={btn} disabled={disabled} onClick={() => act({ kind: "build", buildingType: buildType, acres: buildAcres })}>Build</button>
        <button className={btn} disabled={disabled} onClick={() => act({ kind: "demolish", buildingType: buildType, acres: buildAcres })}>Demolish</button>
      </div>

      {/* Land + cash */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={rowLabel}>Turns</span>
        <button className={btn} disabled={disabled} onClick={() => act({ kind: "explore" })}>
          Explore (+{exploreYield(player, seasonLengthDays)} ac · 1t)
        </button>
        <button className={btn} disabled={disabled} onClick={() => act({ kind: "cash" })}>
          Cash (+{Math.round((config.cashTurnBonus - 1) * 100)}% revenue · 1t)
        </button>
      </div>

      {/* Private market */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={rowLabel}>Private mkt</span>
        <select value={unitType} onChange={(e) => setUnitType(e.target.value as Exclude<UnitType, "spies">)} className={sel}>
          {UNIT_TYPES.filter((u) => u !== "spies").map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <input type="number" min={1} max={config.maxBuyPerAction} value={unitQty} onChange={(e) => setUnitQty(Number(e.target.value))} className={numInput} />
        <span className="text-xs text-neutral-600">{money(unitQty * privateBuyPrice(player, unitType))} · 1t</span>
        <button className={btn} disabled={disabled} onClick={() => act({ kind: "buyMilitary", unitType, qty: unitQty })}>Buy</button>
      </div>

      {/* Production mix */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={rowLabel}>Produce</span>
        {UNIT_TYPES.map((u) => (
          <label key={u} className="flex items-center gap-1 text-[11px] text-neutral-500">
            {u}
            <input
              type="number"
              min={0}
              max={100}
              value={prod[u]}
              onChange={(e) => setProd((p) => ({ ...p, [u]: Number(e.target.value) }))}
              className="w-12 rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-right text-xs"
            />
          </label>
        ))}
        <span className="text-xs text-neutral-600">{config.turnCost.setProduction}t</span>
        <button className={btn} disabled={disabled} onClick={() => act({ kind: "setProduction", mix: prod })}>Set</button>
      </div>

      {/* Tax */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={rowLabel}>Tax</span>
        <input
          type="range"
          min={config.taxRateMin * 100}
          max={config.taxRateMax * 100}
          value={taxPct}
          onChange={(e) => setTaxPct(Number(e.target.value))}
          className="w-40 accent-emerald-500"
        />
        <span className="w-10 text-xs text-neutral-300">{taxPct}%</span>
        <button className={btn} disabled={disabled || taxPct === Math.round(player.taxRate * 100)} onClick={() => act({ kind: "setTaxRate", rate: taxPct / 100 })}>Set</button>
      </div>

      {/* Research */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={rowLabel}>Research</span>
        <select value={focus} onChange={(e) => setFocus(e.target.value as TechCategory)} className={sel}>
          {TECH_CATEGORIES.map((c) => (
            <option key={c} value={c}>{TECH_META[c].label}</option>
          ))}
        </select>
        <button className={btn} disabled={disabled || focus === player.researchFocus} onClick={() => act({ kind: "setResearchFocus", focus })}>Set</button>
      </div>

      {/* Government */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={rowLabel}>Govt</span>
        <select value={govId} onChange={(e) => setGovId(e.target.value as typeof govId)} className={sel}>
          {GOVERNMENT_IDS.map((id) => (
            <option key={id} value={id}>{GOVERNMENTS[id].label}</option>
          ))}
        </select>
        <span className="hidden text-[11px] text-neutral-600 sm:inline">{gov(govId).blurb}</span>
        {player.government !== "monarchy" && (
          <span
            className="text-[11px] text-amber-500"
            title="Real Earth Empires: leaving Monarchy is free, but leaving any other government — even switching straight back to Monarchy — costs cash, military, tech, and buildings to instability."
          >
            ⚠ instability penalty
          </span>
        )}
        <span className="text-xs text-neutral-600">{config.turnCost.setGovernment}t</span>
        <button className={btn} disabled={disabled || govId === player.government} onClick={() => act({ kind: "setGovernment", government: govId })}>Change</button>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-neutral-600">
          {num(player.population)} citizens · income runs on population × PCI × tax, minus unit upkeep
        </span>
        <button
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold hover:bg-emerald-600"
          onClick={() => act({ kind: "endDay" })}
        >
          End Day →
        </button>
      </div>
    </section>
  );
}
