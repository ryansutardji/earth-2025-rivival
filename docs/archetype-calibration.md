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
| **Target preference** (`pickTarget`, in code) | Who it attacks/spies: fresh intel > grudge > random. **Deliberately left uniform** — the user wants AI to treat the player as just another nation, no "hunts you" bias. | same for all, and staying that way |
| `attackViabilityMargin` | How much stronger than the target's defense it must be before it'll commit to an attack. Lower = recklesser. | 1.15 |
| `attackFutilityThreshold` / `attackFutilityRepelledScore` / `attackFutilityDecayPerDay` | How many repelled attacks before it gives up on a target and backs off, and how fast that memory fades. | threshold 3, +2 per loss, −2/day (≈ 2 losses → back off ≈ 1 day) |
| **Upkeep brake tolerance** (`applyTurn.ts`, in code) | Currently a hard stop: net cash *or* net bushels below 0 → don't grow the army. Could let a Raider run a small deficit (glass cannon). | hard stop at 0 |
| `militarySpendFraction` (per-template) | Share of cash committed per "buy military" decision. **Already per-archetype.** | Raider 0.7, others 0.5 |
| `buildSpendFraction` (per-template) | Share of cash committed per "build economy" decision. **Already per-archetype.** | 0.5 all |
| `archetypeExploreLandFraction` | Empty land must drop to this share of total before "explore" enters the roll. | 0.10 |
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

| Knob | Value | Rationale |
|---|---|---|
| `government` | Tyranny | Attacks cost only 1 turn. |
| `decisionTable` | attack **4** / covert 1 / buildMilitary **5** / buildEconomy **2** / explore 3 | ~2× the attack frequency of shared, and it compounds with season heat + `aggressionSkew`; economy investment cut. |
| `attackTypeMix` | standard **0.75** / planned **0.15** / guerilla **0.05** / bombing **0.05** | Standard/Planned = the land-grab-and-loot attacks. Bombing (jets vs turrets, captures nothing) all but dropped. Only used before it has intel on a target. |
| `production` | troops 25 / jets 25 / turrets **10** / tanks 25 / spies **15** | 75% to fighting units; turrets halved; spies trimmed but kept ≥15 so it still scouts a little. |
| `targetMix` | troops **35** / jets **35** / turrets **10** / tanks **20** | Cheap effective offense carries it; tanks modest to stay affordable under the upkeep brake; turrets minimal. |
| `buyPriority` | troops, jets, tanks, turrets | Turrets last. |
| `buildingMix` | indComplexes **30** / sites **20** / milBases **15** / oilRigs **15** / farms **12** / EZ **4** / residences **4** / labs **0** | Industrial complexes as the passive-army engine; military bases up to relieve the upkeep brake; near-zero pure economy; labs 0 (archetypes don't steer research focus, so labs would just pump business tech). |
| `buildPriority` | oilRigs, farms, indComplexes, milBases, sites, EZ, residences, labs | Oil first — a Raider that hits 0 oil literally can't attack — then farms (food brake), then the engine. |
| `militarySpendFraction` | **0.7** | Goes big when it buys (vs. 0.5 default). |
| `buildSpendFraction` | 0.5 | Same as default. |

**Known consequences (watch in playtest):**
- **Soft on defense, rarely scouts** — high-variance opponent: dangerous
  ahead, folds fast when it loses a couple of fights (futility back-off +
  upkeep brake then make it retreat and rebuild).
- **Sustainable, not a glass cannon** — the choices (modest tanks, military
  bases, tiny EZ/residences floor) mean the upkeep brake pulls it back to
  rebuild when it overextends rather than letting it self-destruct. Flipping
  to glass-cannon means a Group B brake-tolerance change.
- **No "hunts you" bias** — by design it targets the player no more than any
  other nation.
- **High tiers late-season** — attack 4 × `aggressionSkew` (up to 2.1) ×
  season heat (2.4) ≈ 20+ effective weight; it may attack nearly every turn.
