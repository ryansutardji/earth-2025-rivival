import type { SeasonStatus, WorldState } from "../engine/types";
import { computeStandings } from "../engine/networth";
import { useGame } from "../state/store";
import { num } from "./format";

interface EndMeta {
  title: string;
  titleCls: string;
  borderCls: string;
  line: (w: WorldState) => string;
}

const HEADINGS: Record<Exclude<SeasonStatus, "playing">, EndMeta> = {
  won_elimination: {
    title: "Elimination Victory",
    titleCls: "text-emerald-400",
    borderCls: "border-emerald-700",
    line: (w) => `Every enemy nation was wiped out on day ${w.day} of ${w.seasonLengthDays}.`,
  },
  won_networth: {
    title: "Net Worth Victory",
    titleCls: "text-emerald-400",
    borderCls: "border-emerald-700",
    line: (w) => `The season ran its full ${w.seasonLengthDays} days and you finished #1 by net worth.`,
  },
  lost_networth: {
    title: "Season Lost",
    titleCls: "text-rose-400",
    borderCls: "border-rose-700",
    line: (w) => `The season ran its full ${w.seasonLengthDays} days and an enemy out-scored you.`,
  },
  lost_eliminated: {
    title: "Nation Overrun",
    titleCls: "text-rose-400",
    borderCls: "border-rose-700",
    line: (w) => `Your nation was wiped out on day ${w.day} of ${w.seasonLengthDays}.`,
  },
};

export function SeasonEndScreen({ world }: { world: WorldState }) {
  const abandon = useGame((s) => s.abandonSeason);
  if (world.status === "playing") return null;

  const meta = HEADINGS[world.status];
  const standings = computeStandings(world);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4">
      <div className={`w-full max-w-lg space-y-4 rounded-lg border ${meta.borderCls} bg-neutral-900 p-6`}>
        <div className="text-center">
          <h2 className={`text-lg font-bold ${meta.titleCls}`}>{meta.title}</h2>
          <p className="mt-1 text-sm text-neutral-300">{meta.line(world)}</p>
        </div>

        <div className="overflow-hidden rounded border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-950/60 text-[10px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">#</th>
                <th className="px-3 py-1.5 text-left font-medium">Nation</th>
                <th className="px-3 py-1.5 text-right font-medium">Net worth</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr
                  key={s.id}
                  className={`border-t border-neutral-800 ${
                    s.isPlayer ? "bg-emerald-950/30 text-neutral-100" : "text-neutral-300"
                  }`}
                >
                  <td className="px-3 py-1.5 text-neutral-500">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    {s.name}
                    {s.isPlayer && <span className="ml-1 text-[10px] uppercase text-emerald-500">you</span>}
                    {s.defeated && <span className="ml-1 text-[10px] uppercase text-neutral-600">eliminated</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold">{num(s.netWorth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={abandon}
          className="w-full rounded bg-emerald-600 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-500"
        >
          New Season
        </button>
      </div>
    </div>
  );
}
