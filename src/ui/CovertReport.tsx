import type { CovertOp, CovertResult } from "../engine/types";
import { useGame } from "../state/store";
import { num, pct } from "./format";

const OP_TITLE: Record<CovertOp, string> = {
  spy: "Spy",
  espionage: "Espionage",
  bombBuildings: "Bomb Buildings",
  raidFoodStores: "Raid Food Stores",
  sabotageIntelligence: "Sabotage Intelligence",
  causeDissensions: "Cause Dissensions",
};

export function CovertReport({ report }: { report: CovertResult }) {
  const dismiss = useGame((s) => s.dismissCovertReport);
  const good = report.success;

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4" onClick={dismiss}>
      <div className="w-full max-w-md space-y-3 rounded-lg border border-violet-800 bg-neutral-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-100">{OP_TITLE[report.op]}</h3>
          <span className={`text-xs font-bold uppercase ${good ? "text-emerald-400" : "text-rose-400"}`}>
            {good ? "success" : "failed"}
          </span>
        </div>

        <p className="text-sm text-neutral-300">
          <span className="font-semibold">{report.attackerName}</span> targeted{" "}
          <span className="font-semibold">{report.defenderName}</span>.
        </p>

        <div className="rounded border border-neutral-800 bg-neutral-950/60 p-2 text-xs text-neutral-400">
          <div className="flex justify-between"><span>Estimated success chance</span><span className="text-neutral-200">{pct(report.successChance, 0)}</span></div>
          <div className="flex justify-between"><span>Spies lost</span><span className="text-neutral-200">{num(report.spiesLost)}</span></div>
          {report.detected && <div className="mt-1 text-rose-300">Your involvement was identified.</div>}
        </div>

        {good && (
          <div className="rounded border border-emerald-900 bg-emerald-950/30 p-2 text-xs text-emerald-200">
            {report.op === "spy" && <>Full intel added to the roster.</>}
            {report.op === "espionage" && <>Stole {num(report.techStolen)} tech points.</>}
            {report.op === "bombBuildings" && <>Wrecked {num(report.buildingsSabotaged)} acres of buildings.</>}
            {report.op === "raidFoodStores" && <>Seized {num(report.bushelsRaided)} bushels (and burned more).</>}
            {report.op === "sabotageIntelligence" && <>Assassinated {num(report.spiesSabotaged)} enemy spies.</>}
            {report.op === "causeDissensions" && <>{num(report.troopsDeserted)} enemy troops deserted.</>}
          </div>
        )}

        <button onClick={dismiss} className="w-full rounded bg-neutral-800 py-2 text-sm font-medium hover:bg-neutral-700">
          Dismiss
        </button>
      </div>
    </div>
  );
}
