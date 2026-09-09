import { useGame } from "../state/store";
import { offensePower } from "../engine/combat";
import { NationPanel } from "./NationPanel";
import { ActionBar } from "./ActionBar";
import { MarketPanel } from "./MarketPanel";
import { EnemyList } from "./EnemyList";
import { EventLog } from "./EventLog";
import { BattleReport } from "./BattleReport";
import { CovertReport } from "./CovertReport";
import { MissileReport } from "./MissileReport";
import { SeasonEndScreen } from "./SeasonEndScreen";

export function GameScreen() {
  const world = useGame((s) => s.world);
  const lastError = useGame((s) => s.lastError);
  const dismissError = useGame((s) => s.dismissError);
  const battleReport = useGame((s) => s.battleReport);
  const covertReport = useGame((s) => s.covertReport);
  const missileReport = useGame((s) => s.missileReport);
  const abandon = useGame((s) => s.abandonSeason);

  if (!world) return null;

  const over = world.status !== "playing";
  const noTurns = world.turnsRemaining <= 0;
  const canAct = !over && !noTurns;
  const daysLeft = Math.max(0, world.seasonLengthDays - world.day);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-500">
          Tier <span className="text-neutral-300">{world.config.tierId}</span> · seed{" "}
          <span className="text-neutral-300">{world.config.seed}</span>
        </div>
        <button
          onClick={() => {
            if (confirm("Abandon this season and return to setup? Progress is lost.")) abandon();
          }}
          className="text-xs text-neutral-500 hover:text-rose-400"
        >
          Abandon season
        </button>
      </div>

      <NationPanel
        player={world.player}
        day={world.day}
        seasonLengthDays={world.seasonLengthDays}
        turnsRemaining={world.turnsRemaining}
        taxComfortThreshold={world.taxComfortThreshold}
      />

      {!over && daysLeft <= 5 && (
        <div className="rounded border border-amber-800 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
          {daysLeft === 0
            ? "Final day. End the day to close the season — it will be scored by net worth."
            : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left. If the roster isn't cleared by then, the highest net worth wins.`}
        </div>
      )}

      {!over && noTurns && (
        <div className="rounded border border-amber-800 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
          Out of turns for today. End the day to refill — enemies grow a step when you do.
        </div>
      )}

      {lastError && (
        <div
          className="cursor-pointer rounded border border-rose-800 bg-rose-950/30 px-3 py-2 text-xs text-rose-300"
          onClick={dismissError}
          title="dismiss"
        >
          {lastError}
        </div>
      )}

      <ActionBar player={world.player} disabled={noTurns || over} seasonLengthDays={world.seasonLengthDays} />

      <MarketPanel player={world.player} disabled={noTurns || over} />

      <div className="grid gap-5 md:grid-cols-2">
        <EnemyList
          enemies={world.enemies}
          player={world.player}
          playerOffense={offensePower(world.player)}
          intel={world.player.intel}
          day={world.day}
          canAct={canAct}
        />
        <EventLog log={world.log} />
      </div>

      {battleReport && <BattleReport report={battleReport} />}
      {covertReport && <CovertReport report={covertReport} />}
      {missileReport && <MissileReport report={missileReport} />}
      {over && <SeasonEndScreen world={world} />}
    </div>
  );
}
