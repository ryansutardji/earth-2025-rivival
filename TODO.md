# Earth 2025 Revival — Open Items

Everything known to be unfinished, feeling wrong, or worth adding. The game is
fully playable and tested (166 automated tests, all passing). It draws heavily
on the real Earth Empires game — buildings, the 8 governments, tech, attack
types, spy operations, missiles, the economy, land exploration — with some
deliberate divergences for single-player balance: economy accrues per turn (a
5-turn build ticks 5×), captured land arrives fully built, a won attack seizes
oil, and being attacked benches 15% of the defender's military for 50 turns.
No in-game bank, and no public/player market — the private market (units,
bushels, oil; buy-only, one turn per purchase) is the only exchange.

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
calibration, the unified starting baseline (see §2), the per-turn economy
switch — that one inflated final net worth roughly 5–10× (everyone now gets a
full day's economy per action-day instead of one tick) — and the public
market removal. So the `playthrough.test.ts` ceilings and any "feels right"
targets need a fresh look. All tunable numbers live in `src/engine/config.ts`.

### Spying
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

- [ ] **P2 · S — The AI has no action to buy bushels or oil.** The private
  market now sells units, bushels, and oil to the *player*, but archetypes
  only ever buy units (`buyMilitaryTowardMix`). They have no equivalent for
  topping up food or oil — they rely entirely on farms / oil rigs and the
  soft food brake. Worth deciding whether a crisis-only "buy bushels/oil when
  a farm/rig can't fix it fast enough" branch is needed, or whether the
  existing brakes + build priorities cover it. (Discussed but not designed.)
- [ ] **P2 · S — Food brake is soft — confirm it's enough or make it hard.**
  The upkeep brake now also blocks military growth when a bigger army would
  push *bushels* net-negative, not just cash — but softly (it just drops
  "buy military" from that turn's roll, nudging toward build-economy where
  farms are top priority; it doesn't *force* a farm). Playtest once the
  archetypes are individually tuned: if archetypes still slip into
  starvation because the nudge is too weak in an active crisis, upgrade it
  to a forced "build farms this turn until bushels are back in the black"
  (same mechanism as the mandatory government / tax-rate first actions).
- [ ] **P2 · S — Targeting anti-snowball: two follow-ups if the pack still
  clumps.** `pickAttackTarget` now ranks targets by
  `sizeScore × grudgeBonus × futilityDrag` (highest wins) instead of
  "whoever I spied most recently" — see `config.targeting` and the
  calibration doc. (The old `winScore` term and `attackViable`'s power
  pre-filter were both removed — only the futility streak still hard-drops a
  target.) If sims still show every AI converging on one nation:
  (a) switch from highest-wins to weighted-random over the score, and
  (b) add an explicit `recentlyAttacked` decay counter on `Nation` (same
  pattern as grudges / `attackFutility`) so a nation already being swarmed
  sheds attackers — needs a small `SCHEMA_VERSION` bump.
- [ ] **P2 · S — Standard/Planned attacks don't get force-sized.** With
  fresh intel, the single-unit-type exploit attacks (Bombing/Artillery/
  Guerilla) size their force to comfortably clear the target's real defense;
  a Standard strike still just sends everything available, blind.

---

## 3. Features that don't exist yet

- [ ] **P2 · S — No way to shrink your army.** Selling units went away with
  the public market, and there's no disband action either — an army you can't
  afford just bleeds via the desertion/starvation ticks until it's back in
  budget. If that recovery path feels too punishing in playtest, add a simple
  disband (flat % cash back, no friction).
- [ ] **P2 · M — Missiles and bombing runs currently overlap too much.**
  Right now, turrets do double duty defending against both regular attacks
  and against spy/air threats. A proper missile system should be its own
  distinct thing — needing its own tech and oil, hitting buildings and
  population, and specifically countered by anti-missile tech and turrets.
- [ ] **P2 · S — Updating the game can silently wipe someone's save file.**
  Whenever `SCHEMA_VERSION` changes (now at 12), the old save is just
  discarded instead of migrated. Should add a proper upgrade path so people
  don't lose in-progress games on update.
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
  events) and/or group entries by day so it's easier to scan — more pressing
  now that a multi-turn action logs one per-turn economy line per turn spent.
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

## 5. Gaps in automated testing

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
- [ ] **P2 — Interface tests only check that text appears on screen.** They
  don't verify that clicking things actually works (e.g., clicking "Buy"
  should actually increase your military count).
- [ ] **P2 — The player-action determinism test doesn't include an attack or
  a spy op.** `turn.test.ts`'s "same world + same actions => identical state"
  runs build / buyResource / cash / explore / endDay only. Archetype-side combat
  determinism *is* covered now (`applyTurn.test.ts` "is deterministic for a
  given seed", plus the End-Day catch-up), but a player-driven `attack` /
  `covertOp` in that action list is still missing.

---

## 6. Open design questions (need a decision from you, not more coding)

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

