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
Theocracy, Balanced→Democracy.

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
| **Attack target preference** (`pickAttackTarget` + `config.targeting`) | Among targets that clear `attackViable`, highest `sizeScore × winScore × grudgeBonus × futilityDrag` wins. `sizeScore` = their-land ÷ my-land (0.5–2.0): punch up, leave cripples alone. `winScore` (0.6–1.5) needs fresh intel — a scouted coin-flip scores *below* an unscouted unknown (1.0). `grudgeBonus` ≤1.5× nudge, never an override. `futilityDrag` eases off a target it keeps bouncing off. **Replaced the old "whoever I spied most recently" pecking order**, which funnelled every AI onto the same unlucky nation and farmed it out of the game. **No "hunts the player" bias** — player is just another nation. *Follow-ups parked:* weighted-random selection instead of highest-wins, and an explicit "already being swarmed" dampener. | same for all |
| **Covert target preference** (`pickCovertTarget`, in code) | Prefer a candidate with *no* fresh intel (spying is for unknowns) > grudge > random. Ignores size. | same for all |
| `attackViabilityMargin` | How much stronger than the target's defense it must be before it'll commit to an attack. Lower = recklesser. | 1.15 |
| `attackFutilityThreshold` / `attackFutilityRepelledScore` / `attackFutilityDecayPerDay` | How many repelled attacks before it gives up on a target and backs off, and how fast that memory fades. | threshold 3, +2 per loss, −2/day (≈ 2 losses → back off ≈ 1 day) |
| **Upkeep brake tolerance** (`applyTurn.ts`, in code) | Currently a hard stop: net cash *or* net bushels below 0 → don't grow the army. Could let a Raider run a small deficit (glass cannon). | hard stop at 0 |
| `militarySpendFraction` (per-template) | Share of cash committed per "buy military" decision. **Already per-archetype.** | Raider 0.7, others 0.5 |
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

Aggressive, offense-focused land-grabber. Starts from `SHARED_BASELINE` like
everyone else; identity is entirely in the knobs below.

Revised after the first mixed-roster sim showed the original build (turrets
10%, near-zero EZ/residences, buildEconomy 2) was a paper tiger — it attacked
plenty but couldn't win a fight, couldn't replace losses, fell behind, and
every other archetype farmed it. This version keeps the aggression but gives
it a real economy and a defensive spine.

| Knob | Value | Rationale |
|---|---|---|
| `government` | Tyranny | Attacks cost only 1 turn. |
| `decisionTable` | attack **4** / covert 1 / buildMilitary **5** / buildEconomy **4** / explore 3 | ~2× the attack frequency of shared, compounding with season heat + `aggressionSkew`. `buildEconomy` at 4 (above shared's 3) so it can recover from combat losses and keep pace. |
| `attackTypeMix` | standard **0.75** / planned **0.15** / guerilla **0.05** / bombing **0.05** | Standard/Planned = the land-grab-and-loot attacks. Bombing (jets vs turrets, captures nothing) all but dropped. Only used before it has intel on a target. |
| `production` | troops 25 / jets 25 / turrets **15** / tanks 20 / spies **15** | Offense-forward, but enough turret output to hold a spine. Spies kept at 15 so it still scouts. |
| `targetMix` | troops **32** / jets **32** / turrets **18** / tanks **18** | ~64% offense, but turrets are a real floor now — its army rebuilds a wall instead of letting attrition take it to nothing. |
| `buyPriority` | troops, jets, tanks, turrets | Turrets last (deficit-first still buys them when they're behind). |
| `buildingMix` | indComplexes **22** / oilRigs **15** / sites **15** / EZ **14** / milBases **12** / farms **12** / residences **10** / labs **0** | Industrial complexes still the army engine + military bases for the upkeep brake, but a genuine income base (EZ + residences) so it grows land/income instead of stalling and getting farmed. Labs 0. |
| `buildPriority` | oilRigs, farms, indComplexes, milBases, sites, EZ, residences, labs | Oil first — a Raider that hits 0 oil literally can't attack — then farms (food brake), then the engine. |
| `militarySpendFraction` | **0.7** | Goes big when it buys (vs. 0.5 default). |
| `buildSpendFraction` | 0.5 | Same as default. |

**Known consequences (watch in playtest):**
- **Still offense-forward, now durable** — the goal is a sustained aggressor,
  not a glass cannon. If it should instead "blitz early and burn out",
  revert `buildEconomy` to 2 and the economy `buildingMix`, and bump
  `attackPlayer` to 5-6 (a different archetype — a Blitzer).
- **No "hunts you" bias** — by design it targets the player no more than any
  other nation. Its attack-viability filter drops targets it can't beat,
  which (with soft raiders around) tends to make raiders fight each other.
- **High tiers late-season** — attack 4 × `aggressionSkew` (up to 2.1) ×
  season heat (2.4) ≈ 20+ effective weight; it may attack nearly every turn.
