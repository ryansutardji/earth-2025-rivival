# Earth 2025 Revival — Open Items

Everything known to be unfinished, feeling wrong, or worth adding. The game is
fully playable and tested (175 automated tests; 174 pass — one, "a Turtle
roster is eventually crackable", is deliberately red: a stale assumption from
before the AI got smarter, to be revisited once the archetypes are fully
tuned). It closely matches the real Earth Empires game it's based on —
buildings, the 8 governments, tech, attack types, spy operations, missiles,
the economy, land exploration. There's no in-game bank anymore (the real game
doesn't have one either, so it was removed).

Legend: **P0** = would bug a first-time player · **P1** = should get done
before calling this finished · **P2** = nice-to-have polish. Effort:
**S** = under half a day · **M** = 1–2 days · **L** = multiple days.
Items marked _(opinion)_ are suggestions, not settled decisions.

---

## 1. Balance & tuning — the big remaining gap

The economy no longer runs away with itself, and the whole-game-clears-in-2-3
-days problem is fixed. Three things landed: nobody can attack until a
season's first 1/5 of its days have passed (a build-up window), the economy's
pace scales with however many days the season actually runs, and — with the
§2 AI rewrite — enemies now spend real cash on real economy the same way the
player does, so their growth is naturally bounded instead of front-loaded.
Exact end-of-season numbers haven't been re-measured since the archetype
calibration and the unified starting baseline (see §2), so this section's job
now is mostly the difficulty ladder below. All tunable numbers live in
`src/engine/config.ts`.

### Difficulty levels

**Unblocked** — §2's AI rewrite has landed (archetypes now run the real
economy instead of a growth-curve abstraction), so the ladder can be built on
top of the settled decision-making logic. One thing changed underneath,
though: **`growthMultiplier` is now dead** — there's no growth ceiling for it
to scale (see §2), nothing in the engine reads it, and `SetupScreen.tsx`
still *displays* it ("growth ×N") which is now misleading. The ladder below
needs a real replacement for that column before it's implemented — likely
something that scales the per-archetype `militarySpendFraction` /
`buildSpendFraction` or the affordability bar itself, not a growth curve.
`baselineMult` and `aggressionSkew` are unaffected and still mean exactly
what they did.

- [ ] **P0 · M — Expand from 3 to 10 difficulty levels.** Ladder approved,
  numbers below still hold for `baselineMult`/`aggressionSkew` — the
  `growthMultiplier` column needs a new definition first (see above). Pure
  data (`data/difficultyTiers.ts`) once it's time:

  | # | Label | id | growthMultiplier | baselineMult | aggressionSkew |
  |---|---|---|---|---|---|
  | 1 | I — Militia | `militia` | 0.55 | 0.60 | 0.45 |
  | 2 | II — Recruit | `recruit` | 0.70 | 0.75 | 0.60 |
  | 3 | III — Regular | `regular` | 0.80 | 0.83 | 0.75 |
  | 4 | IV — Seasoned | `seasoned` | 0.90 | 0.91 | 0.87 |
  | 5 | V — Veteran | `veteran` | 1.00 | 1.00 | 1.00 |
  | 6 | VI — Hardened | `hardened` | 1.15 | 1.12 | 1.20 |
  | 7 | VII — Elite | `elite` | 1.28 | 1.24 | 1.40 |
  | 8 | VIII — Warlord | `warlord` | 1.40 | 1.35 | 1.60 |
  | 9 | IX — Conqueror | `conqueror` | 1.60 | 1.50 | 1.80 |
  | 10 | X — Apex | `apex` | 1.85 | 1.70 | 2.10 |

### The marketplace & spying
- [ ] **P1 · S — Democracy's "zero market commission" perk doesn't actually
  exist.** Every government has a real per-government market commission rate
  on the books (Democracy 0%, Communism 10%, everyone else 6%, matching the
  wiki), but the actual buy/sell price math uses one flat global spread for
  every government — the government-specific rate is never read. Should
  apply `gov(nation.government).marketCommission` in the buy/sell price
  calculation instead of the flat `config.market.spread`.
- [ ] **P1 · S — The public marketplace never actually runs low on
  anything.** Confirmed still true: it restocks a flat amount (e.g. +250
  jets, +120 tanks) on *every single action you take*, not once a day — with
  up to 50 actions available per day, it can refill from empty to its cap
  within a handful of clicks no matter how much you just bought. Part of the
  bigger "public market has no real economy behind it" item in §2 — a slower
  flat restock (once/day) is the minimum fallback if that doesn't get taken
  on in full.
- [ ] **P2 · S — "Detected" has a consequence now, but only a partial one.**
  Since the §2 rewrite, a detected *failed* spy op writes a decaying "grudge"
  on the target (AI or player alike) that biases its future target-selection
  toward the attacker — real retaliation pressure, both AI↔AI and AI↔player.
  Still missing: (a) nothing happens on a detected *successful* op, (b)
  nothing player-facing beyond the log line when the *player* is the one
  detected — no reputation, standing, or diplomatic fallout (there's no
  system for that to plug into yet). *(Also: recon/Spy isn't risk-free —
  it still costs the flat 3% spy loss on success, it just doesn't build the
  harmful-op diminishing-returns heat.)*
- [ ] **P2 · S — Missing 10 of the real game's 16 spy operations.** We
  implement Spy, Espionage, Bomb Buildings, Raid Food Stores, Sabotage
  Intelligence, and Cause Dissensions. Missing entirely: Spy On Alliances,
  Market Spy, and Military Spy (report ops), plus Stir Rebellions, Bomb
  Airbases, Bomb Banks, Sabotage Missiles, Demoralize, BioTerrorism, and Raid
  Oil Reserves (harmful ops). Not necessarily all worth adding — several
  target systems this project doesn't have (alliances, missile stockpiles
  already covered by other mechanics) — but worth a deliberate look at which
  of the ten would actually add something.

---

## 2. AI opponent behavior

Enemy nations run a real economy and take real actions (build, buy, attack,
spy) gated by genuine affordability — not a made-up growth curve. This
section is the open list of what's still rough about *how they decide* what
to do with that. All of it lives in `src/engine/archetype/`.

- [ ] **P1 · M — Economic and Turtle still behave identically to Balanced.**
  **Raider is now calibrated** (its own decision weights, recipes, priority
  lists, and spend fraction — see `docs/archetype-calibration.md`). Economic
  and Turtle still run the shared `SHARED_*` constants. Balanced stays the
  reference. All four (and the player) now share one starting `baseline`.
  Sketches for the remaining two are in the calibration doc; do them the
  same knob-by-knob way.
- [ ] **P2 · L — The public market has no real economy behind it, and the AI
  doesn't touch it at all.** Its stock is synthetic auto-restock (refills
  toward its cap on *every* action, not once a day — the "never runs low"
  item in §1); archetypes have zero market actions in their code, so they
  never buy or sell units, bushels, or oil there. In real EE the public
  market is a *tactical tool for a strategy* — a Farmer mass-produces
  bushels and sells them, a Techer sells research, etc. — and this game has
  no strategy system yet (not even the archetype personality leans are
  implemented). So this is blocked on the bigger "do we want strategies?"
  question: if yes, the market gets rebuilt (AI-driven supply, real price
  discovery) alongside them; if no, it probably gets removed and replaced
  with a flat sell-for-cash / buy-bushels-and-oil-at-a-premium stub (the
  dead `config.privateSellFraction` is already there for it). Leaving the
  market functional-but-shallow for now — it's not broken, just thin.
- [ ] **P2 · S — Food brake is soft — confirm it's enough or make it hard.**
  The upkeep brake now also blocks military growth when a bigger army would
  push *bushels* net-negative, not just cash — but softly (it just drops
  "buy military" from that turn's roll, nudging toward build-economy where
  farms are top priority; it doesn't *force* a farm). Playtest once the
  archetypes are individually tuned: if archetypes still slip into
  starvation because the nudge is too weak in an active crisis, upgrade it
  to a forced "build farms this turn until bushels are back in the black"
  (same mechanism as the mandatory government / tax-rate first actions).
- [ ] **P2 · S — Standard/Planned attacks don't get force-sized.** With
  fresh intel, the single-unit-type exploit attacks (Bombing/Artillery/
  Guerilla) size their force to comfortably clear the target's real defense;
  a Standard strike still just sends everything available, blind.
- [ ] **P2 · S — Higher tiers could pre-reveal the player to enemies.**
  Hard-tier enemies could start already scouted on you (free intel from turn
  1) instead of needing to spy you first — a difficulty-flavored version of
  the intel/target-selection system.
- [ ] **P2 · S — The mix of enemy personality types is always evenly spread
  _(opinion)_.** Right now enemy nations rotate evenly through the available
  personality types. Could weight it by difficulty (harder levels lean more
  aggressive) or offer themed seasons like "all defensive" or "all raiders."

---

## 3. Features that don't exist yet

- [ ] **P2 · S — No dedicated "disband units" action.** You *can* already
  shrink your army for cash by selling units on the public market
  (`marketSell` supports all 5 unit types) — same as real EE. A dedicated
  disband (flat partial refund, no market friction, using the currently-dead
  `config.privateSellFraction`) would be a convenience, not a missing
  capability.
- [ ] **P2 · M — Missiles and bombing runs currently overlap too much.**
  Right now, turrets do double duty defending against both regular attacks
  and against spy/air threats. A proper missile system should be its own
  distinct thing — needing its own tech and oil, hitting buildings and
  population, and specifically countered by anti-missile tech and turrets.
- [ ] **P2 · S — Updating the game can silently wipe someone's save file.**
  Whenever the save format changes, the old save is just discarded instead of
  being converted to the new format. Should add a proper upgrade path so
  people don't lose in-progress games when the game updates.
- [ ] **P2 · S — No history of past seasons.** There's no meta-progression by
  design, but a simple read-only log of past seasons played (difficulty,
  length, result, final score) would be a nice touch and doesn't break that
  rule.
- [ ] **P2 · M — No flavor text / narrative dressing.** Purely optional per
  the original brief: little narrative blurbs from enemy nations (like "Nation
  X demands tribute...") — pure flavor text, no new mechanics needed.
- [ ] **P2 · S — You can't see how vulnerable you are to enemy spies.** You
  can see your own odds when spying on someone else, but you have no way to
  see how exposed you are to being spied on yourself. The data now exists —
  `nation.covertHeat` (the defender's own accumulated alertness) is per-nation
  since the §2 rewrite — it just isn't surfaced anywhere on your panel.

---

## 4. Interface & first-time experience

- [ ] **P1 · S — Numbers are formatted inconsistently across the screen.**
  Some places show the full exact number, others show a shortened version
  (like "1.2M"). Should pick one style consistently everywhere (probably
  shortened, with the exact number available on hover).
- [ ] **P1 · M — Small-screen / mobile layout hasn't really been tested.**
  Some of the wider tables scroll sideways, which is fine as a fallback, but
  nobody's actually verified the game is comfortable to use on a small phone
  screen.
- [ ] **P1 · S — The event log is just one long unfiltered scrolling
  list.** Should add filter options (combat / spying / economy / world
  events) and/or group entries by day so it's easier to scan.
- [ ] **P2 · S — Two pop-up result screens can appear stacked on top of each
  other.** If you attack someone and an enemy spy-hits you back on the same
  turn, both result pop-ups can overlap awkwardly. Should queue them one at a
  time, or offset them visually.
- [ ] **P2 · S — Accessibility hasn't been addressed.** Threat levels are
  shown by color only (bad for colorblind players), there are no screen-reader
  labels, and keyboard-only navigation hasn't been tested.
- [ ] **P2 · M — Actions have zero visual/audio feedback ("juice").** Nothing
  animates or plays a sound when something happens — just a log line and a
  plain pop-up. Even a simple number-counting-up animation or a flash effect
  on a hit would make actions feel more satisfying.
- [ ] **P2 · S — No quick way to repeat the same action many times.** Turn
  -heavy play involves a lot of identical repeated clicks (like buying jets
  20 times in a row). A "repeat last action" button or keyboard shortcut
  would help.

---

## 5. Code cleanliness (doesn't affect players, makes future work easier)

- [ ] **P1 · S — The main turn-handling code repeats the same pattern over
  and over.** Every type of player action goes through nearly identical
  boilerplate. Could be simplified into one shared helper, cutting that file
  down by roughly 60%.
- [ ] **P2 · S — Two nearly-identical chunks of "destroy some buildings"
  logic exist in different files.** One in the combat code, one in the spy
  -ops code. Should be merged into one shared piece of code both can use.
- [ ] **P2 · S — One data shape is copy-pasted instead of reused.** The
  "what an enemy shows you about themselves" shape duplicates most of the
  full nation data shape instead of being derived from it.
- [ ] **P2 · S — One leftover flag in the economy code is awkward and only
  used in one place.** Minor internal cleanup, not user-facing.
- [ ] **P2 · S — `Nation.lastGrowthDay` is now dead weight.** Existed only to
  drive the old growth-ceiling system's once-per-day step (§2, now deleted).
  Nothing reads or writes it anymore — harmless, but worth removing along
  with its plumbing in `factory.ts`/`types.ts` next time either file is
  touched.
- [ ] **P2 · S — Some repeated lookups into the settings file could be
  simplified.** A few spots reach into the same nested config values
  repeatedly across different files; a couple of small helper functions would
  avoid the repetition.
- [ ] **P2 · S — No automated checks run before changes are considered
  "safe."** There's no continuous-integration setup that automatically runs
  the type-checker, tests, and build on every change.
- [ ] **P2 · S — The required Node.js version isn't pinned anywhere.** Minor
  housekeeping so everyone's using a consistent version.
- [ ] **P2 · S — The README is trying to do too many jobs at once.** It
  currently mixes architecture notes, how-to-play instructions, and a roadmap
  all in one place. The roadmap/known-issues part should really just live
  here in this file, and the README trimmed down.

---

## 6. Gaps in automated testing

- [ ] **P1 — Government types aren't tested end-to-end.** E.g., confirming a
  Tyranny nation actually captures more land, and a Democracy nation actually
  earns more cash, than a Republic — tested through real gameplay actions, not
  just checking the underlying multiplier numbers directly.
- [ ] **P1 — Bombing/spying leading to an enemy's defeat isn't tested.** Only
  regular attacks are currently tested for actually eliminating an enemy
  nation; bombing runs and sabotage that should also be able to finish one off
  aren't covered.
- [ ] **P1 — Recovering from starvation isn't tested.** Should verify that
  building more farms after a starvation event lets population and food
  supply actually recover, with no permanently broken state left behind.
- [ ] **P2 — No broad stress-test for the final score formula.**
  `playthrough.test.ts` runs 5 fixed-seed bot games across recruit/veteran/
  warlord with cash + net-worth ceilings and per-day sanity checks — a start,
  but not "a large number of *randomized* legal sessions" confirming the
  score never spikes absurdly and no value ever goes negative/invalid. That
  wider net is still the real safety net against a future balance change
  reintroducing a runaway economy.
- [ ] **P2 — Market running dry and recovering isn't tested.** Should verify
  that if a good is fully bought out, it restocks properly afterward and the
  price stays within a sane range.
- [ ] **P2 — Interface tests only check that text appears on screen.** They
  don't verify that clicking things actually works (e.g., clicking "Buy"
  should actually increase your military count).
- [ ] **P2 — The player-action determinism test doesn't include an attack or
  a spy op.** `turn.test.ts`'s "same world + same actions => identical state"
  runs build / market / cash / explore / endDay only. Archetype-side combat
  determinism *is* covered now (`applyTurn.test.ts` "is deterministic for a
  given seed", plus the End-Day catch-up), but a player-driven `attack` /
  `covertOp` in that action list is still missing.

---

## 7. Open design questions (need a decision from you, not more coding)

- [ ] **Is winning by total elimination vs. winning by final score both
  meant to stay?** Both ways to win currently work, but because the economy
  moves fast, wiping out every enemy almost always happens first on Recruit
  (the easiest difficulty), before the final-score path ever comes into play.
  Should the final-score race be the main way to win (with shorter seasons), or just a
  fallback for when nobody gets eliminated (with longer seasons)?
- [ ] **How closely should this match the real Earth Empires game?** Names
  and mechanics already match closely (buildings, governments, tech
  categories, attack types, spy ops). It's still narrower than the real game
  in a few ways (no naval units, fewer tech categories). Worth expanding
  further toward the real game, or is the current scope the intended target?
- [ ] **Should turns refill over real-world time, or stay instant?** The real
  game slowly grants you turns over actual wall-clock time. This version
  instead gives you a full pool of turns instantly whenever you end the day.
  Keep it fully instant/offline, or add an optional "turns trickle in over
  real time" mode for a more check-in-daily feel?
- [ ] **Should more than one season/save be allowed at once?** Right now
  there's only ever one save file at a time.

