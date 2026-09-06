import type { AttackType, CombatResult, UnitLosses } from "../engine/types";
import { useGame } from "../state/store";
import { money, num } from "./format";

const VERB: Record<AttackType, string> = {
  standard: "struck",
  planned: "hit with a Planned Strike",
  guerilla: "raided",
  bombing: "bombed",
  artillery: "shelled",
};

function LossRow({ label, losses }: { label: string; losses: UnitLosses }) {
  const total = losses.troops + losses.jets + losses.turrets + losses.tanks;
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-neutral-400">{label}</span>
      <span className="text-right text-neutral-300">
        {total === 0
          ? "no losses"
          : `-${num(losses.troops)} troops · -${num(losses.jets)} jets · -${num(losses.turrets)} turrets · -${num(losses.tanks)} tanks`}
      </span>
    </div>
  );
}

export function BattleReport({ report }: { report: CombatResult }) {
  const dismiss = useGame((s) => s.dismissBattleReport);
  const won = report.outcome === "attacker_won";
  const isLandGrab = report.attackType === "standard" || report.attackType === "planned";

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4" onClick={dismiss}>
      <div className="w-full max-w-md space-y-3 rounded-lg border border-neutral-700 bg-neutral-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-100">
            Battle Report <span className="text-neutral-500">· {report.attackType}</span>
          </h3>
          <span className={`text-xs font-bold uppercase ${won ? "text-emerald-400" : "text-rose-400"}`}>
            {won ? "victory" : "repelled"}
          </span>
        </div>

        <p className="text-sm text-neutral-300">
          <span className="font-semibold">{report.attackerName}</span> {VERB[report.attackType]}{" "}
          <span className="font-semibold">{report.defenderName}</span>.
        </p>

        <div className="rounded border border-neutral-800 bg-neutral-950/60 p-2 text-xs">
          <div className="flex justify-between">
            <span className="text-neutral-500">Effective offense</span>
            <span className="text-amber-300">{num(report.attackerOffense)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Effective defense</span>
            <span className="text-sky-300">{num(report.defenderDefense)}</span>
          </div>
        </div>

        {won && (
          <div className="rounded border border-emerald-900 bg-emerald-950/30 p-2 text-xs text-emerald-200">
            {isLandGrab && (
              <>
                Captured {num(report.landCaptured)} acres · {money(report.cashLooted)} · {num(report.bushelsLooted)} bushels
                {report.techLooted > 0 && <> · {num(report.techLooted)} tech</>}
              </>
            )}
            {report.attackType === "guerilla" && <>{num(report.populationKilled)} killed · {num(report.bushelsLooted)} bushels lost</>}
            {(report.attackType === "bombing" || report.attackType === "artillery") && (
              <>Razed {num(report.buildingsRazed)} acres of buildings{report.populationKilled > 0 && <> · {num(report.populationKilled)} killed</>}</>
            )}
          </div>
        )}

        <div className="text-[11px] text-neutral-600">
          Sent {num(report.sent.troops)} troops · {num(report.sent.jets)} jets · {num(report.sent.tanks)} tanks · Oil spent: {num(report.oilSpent)}
        </div>

        <div className="space-y-1 rounded border border-neutral-800 bg-neutral-950/60 p-2">
          <LossRow label={report.attackerName} losses={report.attackerLosses} />
          <LossRow label={report.defenderName} losses={report.defenderLosses} />
        </div>

        {report.restingTurns && (
          <p className="text-xs text-amber-300">
            The survivors are resting {report.restingTurns} turns — unavailable to attack or defend until they return to the standing army.
          </p>
        )}

        {report.defenderDefeated && (
          <p className="text-xs font-semibold text-emerald-400">{report.defenderName} has been eliminated from the season.</p>
        )}

        <button onClick={dismiss} className="w-full rounded bg-neutral-800 py-2 text-sm font-medium hover:bg-neutral-700">
          Dismiss
        </button>
      </div>
    </div>
  );
}
