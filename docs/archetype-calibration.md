# Archetype calibration reference

Every lever available for making an AI archetype (Raider / Economic / Turtle /
Balanced) behave distinctly. **Raider is calibrated** (see the last section);
Economic and Turtle still run the shared `SHARED_*` constants in
`templates.ts`, and **Balanced is the reference point** everything else is
tuned against. All four now start from the *same* `SHARED_BASELINE` — only
`id` / `label` / `blurb` / `government` differ in identity.

- **Group A** knobs are pure data — edit `src/engine/archetype/templates.ts`,
  no code change.
- **Group B** knobs are values that were global in `src/engine/config.ts`;
  making one per-archetype means a small code change in
  `src/engine/archetype/applyTurn.ts` to read it off the template instead.
  The two spend fractions have already made this move (see below).
- **Group C** is the fixed part of the flow that probably shouldn't vary.

---

## The turn flow (the skeleton — identical for every archetype)

Each call to `applyArchetypeTurn` (`src/engine/archetype/applyTurn.ts`):

1. **Out of turns for the day?** → does nothing.
2. **Still a Monarchy?** → spends the whole turn adopting its target
   government (free — leaving Monarchy never has a penalty).
3. **Tax rate not at the season's sweet spot?** → spends the whole turn
   setting it to the real `taxComfortThreshold`.
4. **Otherwise** → builds the list of *affordable* actions by masking out
   anything it genuinely can't do this turn:
   - `attackPlayer` — no valid/beatable target, no army, no oil, not enough
     turns, or the no-attack window hasn't lifted yet
   - `covertPlayer` — no spies, no target, not enough turns
   - `buildMilitary` — can't afford the cheapest unit, **or** the upkeep
     brake trips (a bigger army would push net cash *or* net bushels below
     zero)
   - `buildEconomy` — can't afford a building, or no empty land
   - `explore` — empty land is still above the explore-gate threshold
   Then it **rolls the weighted die** (`decisionTable`) among the survivors.
5. **Nothing affordable at all?** → cashes a turn for a revenue boost
   (or explores, if it's fully built out so cash wouldn't unblock anything).
6. **Executes** the rolled action:
   - **attack** → pick target → pick attack type + force size → resolve
   - **spy** → pick target → pick covert op → resolve
   - **buy military** → buy toward `targetMix` (most-behind type first)
   - **build economy** → build toward `buildingMix` (most-behind type first)
   - **explore** → claim new land
7. **Runs the economy tick** (income, upkeep, factory output, food, etc.).

---

## Group A — per-archetype data knobs (`templates.ts`, no code change)

### 1. `government`
The government it adopts on turn 1. Each one carries its own package of
modifiers — attack turn cost, build rate, per-capita income, food/oil
output, military strength, spy effectiveness, max population, market
commission. See `src/engine/government.ts`.
*Current:* Raider→Tyranny (1 turn/attack), Economic→Democracy, Turtle→
Theocracy, Balanced→Democracy. These are load-bearing balance, not flavour —
sim sweeps show Tyranny is how the Raider *pays* for its aggression and
Theocracy is most of the Turtle's small-roster strength. A season can be
started with **`governmentMode: "random"`** (SetupScreen → "Opponent
governments") which rolls a random government per opponent instead; that
tends to hand the crown to whoever's aggressive and lucks into a good
government (Raider), so it's a variant, not a more-balanced default.

### 2. `decisionTable` — the action dice (5-way)
Relative weights for what it does on a normal turn:

| Action | What it does |
|---|---|
| `attackPlayer` | Launch an attack. **Also multiplied by "season heat"** (ramps ×1 → ×`seasonHeatMaxMult` over the season) **and difficulty `aggressionSkew`.** |
| `covertPlayer` | Run a spy op. Same season-heat / aggression multiplier. |
| `buildMilitary` | Buy units toward `targetMix`. |
| `buildEconomy` | Build structures toward `buildingMix`. |
| `explore` | Claim land. Only in the roll when empty land ≤ `archetypeExploreLandFraction` of total. |

*Shared (Balanced / Economic / Turtle):* attack 2 / covert 1 / buildMilitary 6
/ buildEconomy 3 / explore 3. *(There used to be a 6th, `reinforceDefense` —
a pure duplicate of `buildMilitary` — removed; its weight folded in.)*

### 3. `attackTypeMix` — attack-type preference (5-way, no-intel case only)
Weighted pick of Standard / Planned / Guerilla / Bombing / Artillery, used
**only when it has no fresh spy intel on the target.** With fresh intel it
ignores this and picks the type that exploits the target's weakest stat
(weak turrets → Bombing, weak tanks → Artillery, weak troops → Guerilla,
no clear weak spot → Standard).
*Current shared:* standard 0.7 / guerilla 0.2 / bombing 0.1.

### 4. `production` — factory output mix (5-way, passive)
How industrial complexes split their per-tick unit output across troops /
jets / turrets / tanks / **spies**. This runs every economy tick regardless
of what the archetype decides — it's the *only* source of spies (they can't
be bought). Independent from `targetMix`.
*Current shared:* 20 / 20 / 20 / 20 / 20.

### 5. `targetMix` — unit purchase target (4-way) + `buyPriority` + `militarySpendFraction`
When "buy military" fires, it buys toward this composition across troops /
jets / turrets / tanks (**no spies** — can't buy them), spending
`militarySpendFraction` of cash (per-template), buying whichever type is
furthest under its target share first. `buyPriority` is the tie-break order
once the mix is balanced.
*Shared:* mix 25 / 25 / 25 / 25; priority troops, jets, turrets, tanks;
`militarySpendFraction` 0.5.

### 6. `buildingMix` — building target (8-way) + `buildPriority` + `buildSpendFraction`
When "build economy" fires, it builds toward this across enterprise zones /
residences / industrial complexes / military bases / research labs / farms /
oil rigs / construction sites, spending `buildSpendFraction` of cash
(per-template), most-behind type first. `buildPriority` is the tie-break
order.
*Shared:* construction sites 30, all others 10 each; priority farms, oil
rigs, EZ, residences, industrial complexes, labs, military bases, sites;
`buildSpendFraction` 0.5.

### 7. `baseline` — starting stats
Land, cash, army composition, buildings at spawn. **Now identical across all
four archetypes *and* the human player** (`SHARED_BASELINE` in `templates.ts`,
also used by `makePlayerNation`): land 900, cash 8000, `{ troops 180,
turrets 180, jets 80, tanks 20 }`, `{ EZ 30, residences 22, indComplexes 22,
farms 16, oilRigs 10, labs 8, milBases 4, sites 4 }`. The AI roster is scaled
up from there at season generation by `tier.baselineMult`; the player is
never scaled.

---

## Group B — currently global, could be made per-archetype (small code change)

All live in `src/engine/config.ts`. To split one per-archetype: add a field
to `ArchetypeTemplate`, set it on each template, and read `template.x`
instead of `config.x` in `applyTurn.ts`.

| Knob (config name) | What it controls | Current value |
|---|---|---|
| **Attack target preference** (`pickAttackTarget` + `config.targeting`) | Highest `sizeScore × grudgeBonus × futilityDrag` wins. `sizeScore` = their-land ÷ my-land (0.5–2.0): punch up at whoever's ahead, leave cripples alone. `grudgeBonus` ≤1.5× nudge. `futilityDrag` eases off a target it keeps bouncing off. **No "can I win?" term** — that (and `attackViable`'s power pre-filter) were removed: the AI swings at stronger nations and lets combat variance decide, so a runaway leader can't fall off everyone's list and grow untouched. **Replaced the old "whoever I spied most recently" pecking order.** No "hunts the player" bias. *Follow-ups parked:* weighted-random selection, and an "already being swarmed" dampener. | same for all |
| **Covert target preference** (`pickCovertTarget`, in code) | Prefer a candidate with *no* fresh intel (spying is for unknowns) > grudge > random. Ignores size. | same for all |
| `attackViabilityMargin`, `config.targeting.winScore*` | **Currently dead** — `attackViable` no longer does the power pre-filter and `pickAttackTarget` no longer has a win-confidence term. Knobs left in place; the only hard "don't attack" left is the futility threshold. | (unused) |
| `attackFutilityThreshold` / `attackFutilityRepelledScore` / `attackFutilityDecayPerDay` | How many repelled attacks before it gives up on a target and backs off, and how fast that memory fades. This is now the *only* hard attack gate. | threshold 3, +2 per loss, −2/day (≈ 2 losses → back off ≈ 1 day) |
| `emptyLandBuildWeight` | When empty land ≥ `exploreMaxEmptyLandFraction`, an archetype that can still afford to build has `buildEconomy` weight raised to at least this. Only bites a land-hoarder; broke nations still fall through to cashing a turn. | 9 |
| `attackHoldUntilFraction` (per-template) | Archetype won't roll `attackPlayer` until the season is this fraction through, even after combat unlocks ("sleeper"). All four currently 0 — tested on the Raider, didn't beat plain aggression once its foundation was fixed. | 0 all |
| **Upkeep brake tolerance** (`applyTurn.ts`, in code) | Currently a hard stop: net cash *or* net bushels below 0 → don't grow the army. Could let a Raider run a small deficit (glass cannon). | hard stop at 0 |
| `militarySpendFraction` (per-template) | Share of cash committed per "buy military" decision. **Per-template, but all four currently 0.5** (the Raider used to run 0.7 — it drained its own treasury; reverted when the Raider became "Balanced + aggressive table"). | 0.5 all |
| `buildSpendFraction` (per-template) | Share of cash committed per "build economy" decision. **Already per-archetype.** | 0.5 all |
| `archetypeExploreLandFraction` | Empty land must drop to this share of total before "explore" enters the roll (tuning preference). | 0.10 |
| `exploreMaxEmptyLandFraction` | Hard cap: an archetype never explores at/above this empty-land share — the EE "can't explore a mostly-empty nation" rule. Binds regardless of the preference knob; a broke archetype here cashes a turn instead. | 0.50 |
| `attackForceMargin` | With intel, how far it overshoots the target's known defense (vs. blind full-send). | 1.30 |
| `seasonHeatMaxMult` | How much `attackPlayer` / `covertPlayer` weights ramp up from day 1 to the deadline. | 2.4 (×1 → ×2.4) |
| **Covert op choice** (`pickCovertOp`, in code) | No intel → scout (`spy`); has intel → random harmful op. Could flavor it — Turtle: counter-intel only; Raider: only ops that soften a target for an attack. | same for all |
| `archetypeMaxPurchasesPerAction` | Cap on how many separate buy/build calls one decision roll can make (so one roll can't eat the whole day). | 4 |

---

## Group C — the fixed part of the flow

The mandatory turn-1 / turn-2 setup: adopt target government, then optimize
tax rate to the season's `taxComfortThreshold`. Uniform for every archetype
and probably should stay that way.

---

## Cross-knob interactions worth knowing when calibrating

- **Upkeep brake vs. aggression.** Cranking `attackPlayer` and a heavy
  offense `targetMix` without enough economy → the brake trips → it gets
  *forced* to build economy, which fights the archetype's identity. An
  aggressive archetype needs either a lean/affordable army, a leaner target
  government, or a per-archetype brake tolerance (Group B).
- **`production` vs. `targetMix`.** These are separate. Factory output
  (`production`) includes spies and runs passively; purchases (`targetMix`)
  exclude spies and only happen on a "buy military" roll. A spy-heavy
  archetype sets `production` toward spies and relies on purchases for the
  rest of its army.
- **Attack-type mix only matters without intel.** Once an archetype has
  scouted a target, `attackTypeMix` is ignored in favor of exploiting the
  known weak stat. So `attackTypeMix` shapes *early* / unscouted aggression.
- **There's no defense-only buy action.** `reinforceDefense` was removed (it
  was a pure duplicate of `buildMilitary`). A defensive archetype just tunes
  its `targetMix` toward turrets — the deficit-first buy logic does the rest.
- **Season heat compounds with difficulty.** The effective attack weight is
  `decisionTable.attackPlayer × aggressionSkew × seasonHeat`. A high base
  weight on a high tier late in the season gets very large.
- **Explore only unlocks near "full."** An archetype with a low
  `buildingMix` weight on construction sites builds slowly, stays under the
  explore gate longer, and expands its borders less. Land feeds net worth,
  home-defense, and building capacity.

---

## Per-archetype intent sketch

| Archetype | Rough identity → which knobs | Status |
|---|---|---|
| **Raider** | See "Raider — calibrated values" below. | **Done** |
| **Economic** | High `buildEconomy`, very low `attackPlayer`; `buildingMix` heavy on enterprise zones + residences; (Group B) high `attackViabilityMargin` so it only fights when it's sure. | Not started |
| **Turtle** | Low `attackPlayer`; `buildMilitary` weight high with a turrets-heavy `targetMix` + `production`; `buildingMix` favors residences + military bases; (Group B) covert-op choice → counter-intel only. | Not started |
| **Balanced** | The shared values — the reference point everything else is tuned against. Not meant to change. | Reference |

---

## Raider — calibrated values

**The Raider is Balanced with two changes: a more aggressive decision table,
and the Tyranny government.** Nothing else differs — same `SHARED_BASELINE`,
same building mix, same 25%-turret `targetMix`, same production, same spend
fractions, same priorities.

How we got here: sim sweeps (4- and 12-AI, passive player, multiple seeds)
tried every elaborate offense-shaped recipe — thin turrets, war-economy
buildings, high `militarySpendFraction`, a "sleeper" early-attack hold — and
the Raider lost every time, ending ~10–30% of Balanced's net worth. A control
run then gave the Raider *Balanced's exact template* plus only the aggressive
decision table: with Tyranny's income penalty intact it was a coin-flip at 4
AI and a ~50% runner-up at 12 AI; with the penalty removed it **dominated**
(~180–350% of Balanced). Softening Tyranny's PCI penalty from −25% to **−10%**
(`government.ts`) landed the sweet spot: 12-AI median ~150% of Balanced,
leads or ties every seed, still a clearly distinct archetype (ends with
roughly 2× Balanced's land and army). The elaborate recipes were all
compensating for handicaps that just needed removing.

| Knob | Value | Rationale |
|---|---|---|
| `government` | Tyranny | 1 turn per attack, +20% attack gains, −10% upkeep, and now only −10% PCI (was −25% — see `government.ts`). |
| `decisionTable` | attack **4** / covert 1 / buildMilitary **5** / buildEconomy **4** / explore 3 | The whole identity. ~2× shared's attack weight, compounding with season heat + `aggressionSkew`; `buildEconomy` at 4 (vs shared's 3) so it fills conquered land and keeps compounding. |
| everything else | **= Balanced (`SHARED_*`)** | `attackTypeMix`, `production`, `targetMix` (25% turrets), `buyPriority`, `buildingMix`, `buildPriority`, `militarySpendFraction` 0.5, `buildSpendFraction` 0.5, `attackHoldUntilFraction` 0. |

**Known consequences (watch in playtest):**
- **It out-conquers and out-grows Balanced.** Aggression compounds *for* it
  once the foundation is solid: win fights → take land + loot → build it out
  (it has Balanced's build rate) → bigger economy → bigger army. In the sims
  it ends with ~2× Balanced's land and military.
- **Tyranny −10% is a global change.** A human who picks Tyranny gets it too
  (intended — at −25% nobody would).
- **No "hunts you" bias** — targets the player no more than any other nation
  (`pickAttackTarget` scores by size × grudge × futility, no player term).
- **4-AI is high variance** — a four-nation game swings on who breaks first;
  the Raider wins most seeds but occasionally gets wiped. 12-AI is the
  stable signal.
- **`attackHoldUntilFraction`** stays on `ArchetypeTemplate` as an available
  knob but every archetype is at 0 (no hold) — the "sleeper" idea didn't
  beat plain aggression once the foundation was fixed.
