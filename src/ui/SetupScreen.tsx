import { useGame, ROSTER_MIN, ROSTER_MAX, SEASON_MIN, SEASON_MAX } from "../state/store";
import { DIFFICULTY_TIERS } from "../data/difficultyTiers";
import { ARCHETYPE_META } from "../data/archetypes";
import { GOVERNMENT_IDS, GOVERNMENTS } from "../engine/government";
import type { GovernmentId } from "../engine/types";

export function SetupScreen() {
  const setup = useGame((s) => s.setup);
  const setSetup = useGame((s) => s.setSetup);
  const toggleArchetype = useGame((s) => s.toggleArchetype);
  const randomizeSetup = useGame((s) => s.randomizeSetup);
  const rerollSeed = useGame((s) => s.rerollSeed);
  const newSeason = useGame((s) => s.newSeason);

  const activeTier = DIFFICULTY_TIERS.find((t) => t.id === setup.tierId) ?? DIFFICULTY_TIERS[0]!;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h2 className="text-base font-semibold text-neutral-100">New Season</h2>
        <p className="mt-1 text-sm text-neutral-400">
          A season is a fixed roster of AI nations. Win by eliminating every one of them, or by
          holding the highest net worth when the season's days run out. Everything below is yours
          to set or randomize.
        </p>
      </div>

      {/* Difficulty tier */}
      <section className="space-y-2">
        <label className="block text-xs uppercase tracking-wide text-neutral-500">Difficulty tier</label>
        <select
          value={setup.tierId}
          onChange={(e) => setSetup({ tierId: e.target.value })}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        >
          {DIFFICULTY_TIERS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500">
          Everyone starts the same size — difficulty is tempo:{" "}
          combat opens ~{Math.floor(setup.seasonLengthDays * activeTier.attackUnlockFraction) + 1 <= 1
            ? "day 1"
            : `day ${Math.floor(setup.seasonLengthDays * activeTier.attackUnlockFraction) + 1}`}{" "}
          for the AI · late-game aggression peaks ×{activeTier.seasonHeatMaxMult} · AI gets{" "}
          {50 + activeTier.aiTurnPoolDelta} turns/day (you get 50)
        </p>
      </section>

      {/* Player government */}
      <section className="space-y-2">
        <label className="block text-xs uppercase tracking-wide text-neutral-500">Your government</label>
        <select
          value={setup.playerGovernment}
          onChange={(e) => setSetup({ playerGovernment: e.target.value as GovernmentId })}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        >
          {GOVERNMENT_IDS.map((id) => (
            <option key={id} value={id}>
              {GOVERNMENTS[id].label}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500">{GOVERNMENTS[setup.playerGovernment].blurb}</p>
      </section>

      {/* Opponent governments */}
      <section className="space-y-2">
        <label className="block text-xs uppercase tracking-wide text-neutral-500">Opponent governments</label>
        <div className="grid grid-cols-2 gap-2">
          {([
            ["archetype", "By archetype", "Each archetype's calibrated pick (Raider→Tyranny, Turtle→Theocracy, …)."],
            ["random", "Random", "A random government per opponent — same roster, different balance every season."],
          ] as const).map(([mode, label, blurb]) => {
            const on = (setup.governmentMode ?? "archetype") === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setSetup({ governmentMode: mode })}
                className={`rounded border px-3 py-2 text-left text-sm transition ${
                  on
                    ? "border-emerald-600 bg-emerald-950/40 text-neutral-100"
                    : "border-neutral-800 bg-neutral-900 text-neutral-500 hover:border-neutral-700"
                }`}
              >
                <span className="font-semibold">{label}</span>
                <span className="mt-1 block text-[11px] text-neutral-500">{blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Roster size */}
      <section className="space-y-2">
        <label className="block text-xs uppercase tracking-wide text-neutral-500">
          Enemy nations: <span className="text-neutral-200">{setup.rosterSize}</span>
        </label>
        <input
          type="range"
          min={ROSTER_MIN}
          max={ROSTER_MAX}
          value={setup.rosterSize}
          onChange={(e) => setSetup({ rosterSize: Number(e.target.value) })}
          className="w-full accent-emerald-500"
        />
        <div className="flex justify-between text-[10px] text-neutral-600">
          <span>{ROSTER_MIN}</span>
          <span>{ROSTER_MAX}</span>
        </div>
      </section>

      {/* Season length */}
      <section className="space-y-2">
        <label className="block text-xs uppercase tracking-wide text-neutral-500">
          Season length: <span className="text-neutral-200">{setup.seasonLengthDays} days</span>
        </label>
        <input
          type="range"
          min={SEASON_MIN}
          max={SEASON_MAX}
          value={setup.seasonLengthDays}
          onChange={(e) => setSetup({ seasonLengthDays: Number(e.target.value) })}
          className="w-full accent-emerald-500"
        />
        <div className="flex justify-between text-[10px] text-neutral-600">
          <span>{SEASON_MIN}</span>
          <span>{SEASON_MAX}</span>
        </div>
        <p className="text-[11px] text-neutral-600">
          Reach the deadline without a clean sweep and the #1 net worth takes the season.
        </p>
      </section>

      {/* Archetype mix */}
      <section className="space-y-2">
        <label className="block text-xs uppercase tracking-wide text-neutral-500">
          Eligible archetypes
        </label>
        <div className="grid gap-2">
          {ARCHETYPE_META.map((a) => {
            const on = setup.eligibleArchetypes.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleArchetype(a.id)}
                className={`rounded border px-3 py-2 text-left text-sm transition ${
                  on
                    ? "border-emerald-600 bg-emerald-950/40 text-neutral-100"
                    : "border-neutral-800 bg-neutral-900 text-neutral-500 hover:border-neutral-700"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-block h-3 w-3 rounded-sm border ${
                      on ? "border-emerald-500 bg-emerald-500" : "border-neutral-600"
                    }`}
                  />
                  <span className="font-semibold">{a.label}</span>
                </span>
                <span className="mt-1 block pl-5 text-xs text-neutral-500">{a.blurb}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-neutral-600">At least one must stay selected.</p>
      </section>

      {/* Seed */}
      <section className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          Seed: <span className="text-neutral-300">{setup.seed}</span>
        </span>
        <button type="button" onClick={rerollSeed} className="text-emerald-400 hover:underline">
          reroll
        </button>
      </section>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={randomizeSetup}
          className="rounded border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900"
        >
          Randomize all
        </button>
        <button
          type="button"
          onClick={newSeason}
          className="flex-1 rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-500"
        >
          Start Season
        </button>
      </div>
    </div>
  );
}
