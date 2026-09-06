import type { MissileResult } from "../engine/types";
import { useGame } from "../state/store";
import { num } from "./format";

export function MissileReport({ report }: { report: MissileResult }) {
  const dismiss = useGame((s) => s.dismissMissileReport);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4" onClick={dismiss}>
      <div className="w-full max-w-md space-y-3 rounded-lg border border-amber-800 bg-neutral-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-100">{report.missile} missile</h3>
          <span className={`text-xs font-bold uppercase ${report.intercepted ? "text-sky-400" : "text-rose-400"}`}>
            {report.intercepted ? "intercepted" : "impact"}
          </span>
        </div>

        <p className="text-sm text-neutral-300">
          <span className="font-semibold">{report.attackerName}</span> launched a {report.missile} missile at{" "}
          <span className="font-semibold">{report.defenderName}</span>.
        </p>

        {report.intercepted ? (
          <div className="rounded border border-sky-900 bg-sky-950/30 p-2 text-xs text-sky-200">
            {report.defenderName}'s SDI shot it down.
          </div>
        ) : (
          <div className="rounded border border-rose-900 bg-rose-950/30 p-2 text-xs text-rose-200">
            {report.landDestroyed > 0 && <div>{num(report.landDestroyed)} acres destroyed</div>}
            {report.buildingsRazed > 0 && <div>{num(report.buildingsRazed)} acres of buildings razed</div>}
            {report.populationKilled > 0 && <div>{num(report.populationKilled)} killed</div>}
            {report.unitsKilled > 0 && <div>{num(report.unitsKilled)} units destroyed</div>}
          </div>
        )}

        {report.defenderDefeated && (
          <p className="text-xs font-semibold text-emerald-400">{report.defenderName} has been eliminated.</p>
        )}

        <button onClick={dismiss} className="w-full rounded bg-neutral-800 py-2 text-sm font-medium hover:bg-neutral-700">
          Dismiss
        </button>
      </div>
    </div>
  );
}
