# Archetype calibration — the knobs, in plain terms

Four AI personalities: **Raider**, **Economic**, **Turtle**, **Balanced**.
This doc is the map of every dial you can turn to change how they behave, and
what each one does.

The core idea: **an archetype is not special-cased.** Every AI nation runs the
exact same economy and takes the exact same actions the human player can
(build, buy troops, explore, spy, attack). "Personality" is *only* about
**what it tends to choose to do** with its turns and its cash. There is no
hidden growth curve, no free stat boost.

All four start from the **identical** starting position (`SHARED_BASELINE`) —
same land, cash, army, buildings as each other *and* as the player. They
differ in just three things: **their government**, **their action dice**
(`decisionTable`), and one tweak to the **Turtle's unit-buy mix**. Everything
else is shared.

---

## Where the knobs live

| Group | Where | To change it |
|---|---|---|
| **A — per-archetype data** | `src/engine/archetype/templates.ts` | Just edit the number. No code change. |
| **B — shared dials** | `src/engine/config.ts` | Edit the number — but it changes for *all four* archetypes at once. Splitting one out per-archetype is a small code change (add a field to `ArchetypeTemplate`, read `template.x` instead of `config.x` in `applyTurn.ts`). |
| **C — fixed flow** | `applyTurn.ts` | The turn skeleton. Not meant to vary by archetype. |
| **Season levers** | `src/data/difficultyTiers.ts` | Difficulty, not personality — see the bottom section. |

---

## THE TABLE — every per-archetype knob, side by side

Columns are archetypes. Rows are knobs. **Bold** = this archetype differs from
the others. Edit these in `templates.ts`.

| Knob | Raider | Economic | Turtle | Balanced |
|---|---|---|---|---|
| **Government** | **Tyranny** | **Democracy** | **Theocracy** | **Democracy** |
| **Attack weight** (`attackPlayer`) | **4** | **1** | **1** | **2** |
| **Spy weight** (`covertPlayer`) | 1 | 1 | 1 | 1 |
| **Build-army weight** (`buildMilitary`) | **5** | **3** | **5** | **4** |
| **Build-economy weight** (`buildEconomy`) | 4 | **6** | 4 | 4 |
| **Explore weight** (`explore`) | 3 | 3 | **2** | 3 |
| Sleeper hold (`attackHoldUntilFraction`) | 0 | 0 | 0 | 0 |
| Cash spent per army-buy (`militarySpendFraction`) | 0.5 | 0.5 | 0.5 | 0.5 |
| Cash spent per economy-build (`buildSpendFraction`) | 0.5 | 0.5 | 0.5 | 0.5 |
| **Unit-buy target mix** — troops / jets / turrets / tanks (`targetMix`) | 25 / 25 / 25 / 25 | 25 / 25 / 25 / 25 | **20 / 10 / 55 / 15** | 25 / 25 / 25 / 25 |
| Factory output mix — troops / jets / turrets / tanks / spies (`production`) | 20 / 20 / 20 / 20 / 20 | 20 / 20 / 20 / 20 / 20 | 20 / 20 / 20 / 20 / 20 | 20 / 20 / 20 / 20 / 20 |
| Attack-type mix, no-intel case (`attackTypeMix`) | std .70 / guer .20 / bomb .10 | same | same | same |
| Building target mix (`buildingMix`) | sites 30, other 7 at 10 each | same | same | same |
| Buy priority (tie-break) (`buyPriority`) | troops → jets → turrets → tanks | same | same | same |
| Build priority (tie-break) (`buildPriority`) | farms → oil → EZ → residences → industry → labs → mil-bases → sites | same | same | same |
| Starting position (`baseline`) | `SHARED_BASELINE` | same | same | same |

**One-line identity of each:**
- **Raider** — attacks ~2× as often as anyone, on the fast-cheap-war
  government. Wins fights, takes land + loot, builds it out, snowballs.
- **Economic** — barely fights, pours turns into buildings. Fat and soft.
- **Turtle** — pours turns into military, and the buy-mix turns 55% of it
  into turrets (a wall). Attacks only to shove back. Hard to kill, low ceiling.
- **Balanced** — the reference point. Mild lean toward nothing. Every other
  archetype is tuned *against* this one.

---

## What each knob actually does

### Government
The government adopted on turn 1 (free — every nation starts as a Monarchy,
which is free to leave). Each government is a bundle of modifiers: attack turn
cost, build speed, per-person income, food/oil output, army strength, upkeep
cost, spy strength, population cap, market fees. Full list in
`src/engine/government.ts`.

These are **load-bearing balance, not flavour.** Sim sweeps show Tyranny is
*how the Raider pays* for its aggression (fast cheap attacks, small income
hit) and Theocracy is most of the Turtle's durability (cheap army, +40% build
speed, +50% population). Change a government and you've changed that
archetype's whole power level.

> **Season lever:** SetupScreen → "Opponent governments" → **Random** rolls a
> random government per opponent instead of these fixed picks. Same roster and
> names for a given seed, just different governments. It tends to crown
> whoever's aggressive and rolls a good government (usually the Raider), so
> it's a shake-it-up variant, not a more-balanced default.

### The action dice (`decisionTable`)
Five relative weights. Every normal turn, the AI rolls this weighted die to
pick what to do. Bigger number = picked more often. A weight of 0 disables
that action entirely.

| Action | What it does |
|---|---|
| `attackPlayer` | Launch one attack. **This weight is also multiplied by "season heat"** — see the bottom section. |
| `covertPlayer` | Run one spy op. Also multiplied by season heat. |
| `buildMilitary` | Buy units toward the unit-buy mix. |
| `buildEconomy` | Build structures toward the building mix. |
| `explore` | Claim new land. Only in the roll when empty land is low (see `archetypeExploreLandFraction`). |

The weights are relative, so `attack 4 / build-army 5 / build-eco 4 / explore 3
/ spy 1` means attack is picked 4 times out of 17 rolls (before season heat).

### Sleeper hold (`attackHoldUntilFraction`)
"Stay peaceful for the first X% of the season even after combat is legal, and
spend those turns building instead." 0 = attack as soon as it's allowed. All
four are at 0 — we tried a sleeper Raider and plain aggression beat it once
its economy foundation was fixed. The knob is still there if you want it.

### Cash spent per decision (`militarySpendFraction`, `buildSpendFraction`)
When "build army" fires, it's allowed to spend this fraction of its current
cash on that one decision. Same for "build economy". At 0.5 it commits half
its treasury per buy. Higher = faster army/economy but a thinner cash buffer
(the Raider ran 0.7 once and kept bankrupting itself — reverted to 0.5).

### Unit-buy target mix (`targetMix`)
When "build army" fires, it buys toward this troops/jets/turrets/tanks split,
always topping up whichever type is furthest below its target share first.
**This is the Turtle's one bespoke knob** — 55% turrets makes its army a
defensive wall. Spies are not here (they can't be bought — see next knob).

### Factory output mix (`production`)
How the factories split their automatic per-tick output across all five unit
types **including spies**. This runs every economy tick no matter what the AI
chose to do. It's the *only* source of spies. Currently even (20 each) for
everyone. A spy-heavy archetype would raise the spy share here.

### Attack-type mix (`attackTypeMix`)
Which attack type it picks **only when it has no fresh spy intel on the
target**. With fresh intel it ignores this and picks the type that hits the
target's weakest stat (weak turrets → Bombing, weak tanks → Artillery, weak
troops → Guerilla, nothing obviously weak → Standard land-grab). So this knob
only shapes *blind* / early aggression.

### Building target mix + priorities (`buildingMix`, `buildPriority`, `buyPriority`)
`buildingMix` is the target split across the 8 building types (currently
front-loads construction sites, which raise build speed for everything after).
The two `*Priority` lists are only tie-breakers — used once the mix is already
balanced. All shared right now.

### Starting position (`baseline`)
Land, cash, army, buildings at spawn. **Identical for all four and the
player** — `SHARED_BASELINE` in `templates.ts`: land 900, cash 8,000, army
{ troops 180, turrets 180, jets 80, tanks 20 }, buildings { EZ 30, residences
22, industry 22, farms 16, oil 10, labs 8, mil-bases 4, sites 4 }. Difficulty
does **not** scale this any more — every tier starts the AI at exactly the
player's size.

---

## Shared dials (`config.ts`) — same for all four archetypes

These affect every AI equally. Edit to shift overall AI behaviour; split one
out per-archetype (small code change) if you want it to be a personality knob.

| Dial (`config.` name) | Plain meaning | Value |
|---|---|---|
| `targeting.sizeRatioMin` / `sizeRatioMax` | Target-picking: how much bigger/smaller a nation can look before the "juiciness" score stops moving. A nation twice your size caps at 2.0; a cripple floors at 0.5. | 0.5 / 2.0 |
| `targeting.grudgeWeight` / `grudgeSaturation` | How much a grudge bumps a target up the list (max +50%), and how many grudge points count as "maxed" (~2 attacks' worth). | 0.5 / 6 |
| `targeting.futilityDrag` / `futilityDragFloor` | How hard repeated failed attacks push the AI *off* a target before it drops it entirely. Floor 0.34 = a much-bounced target is worth ~⅓ its size score. | 0.5 / 0.34 |
| `targeting.winScore*` | **Currently unused.** The old "can I win this?" term in the target score was removed so a runaway leader can't fall off everyone's list and grow untouched. Knobs left in place. | (dead) |
| `attackFutilityThreshold` | How many repelled attacks before the AI fully gives up on a target. | 3 |
| `attackFutilityRepelledScore` | Points added per repelled attack (so ~2 losses → give up). | +2 |
| `attackFutilityDecayPerDay` | How fast that "give up" memory fades. | −2 / day |
| `grudgeAttackedScore` / `grudgeFailedSpyScore` | Grudge points earned when someone attacks you / gets caught spying on you. | 3 / 2 |
| `grudgeDecayPerDay` | How fast a grudge cools off. | −10 / day |
| `intelStalenessDays` | A spy report older than this is "stale" — the AI stops trusting it for smart attack-type / target choices. | 10 days |
| `attackForceMargin` | With good intel, how far the AI overshoots the target's known defense instead of blindly sending everything. 1.3 = send 30% more than needed. | 1.30 |
| `archetypeExploreLandFraction` | Empty land must drop below this share of total before "explore" enters the dice roll. Keeps AIs expanding like a player (explore → fill → explore). | 0.10 |
| `exploreMaxEmptyLandFraction` | Hard cap: never explore when this much land is still empty ("can't explore a mostly-empty nation"). | 0.50 |
| `emptyLandBuildWeight` | If a nation is hoarding empty land it *could* build on, its build-economy weight is forced up to at least this — a hard pull to fill land in rather than keep attacking. In practice only ever bites the Raider. | 9 |
| `archetypeMaxPurchasesPerAction` | Cap on separate buy/build calls one dice roll can make, so one roll can't eat the whole day. | 4 |
| `maxBuyPerAction` | Cap on units bought in a single buy call. | 500 |
| `cashTurnBonus` | The revenue multiplier when the AI "cashes a turn" (its fallback when nothing else is affordable). | 1.2 |
| `turnCost.*` | Turn cost per action: build 1, explore 1, cash 1, buy-army 1, spy 2, switch-government 6, non-land-grab attack 2. Land-grab attacks cost the government's `turnsToAttack` (Tyranny 1 / normal 2 / Democracy 3). | — |

---

## Watch-outs when calibrating

- **The upkeep brake fights aggression.** If you crank a nation's attack
  weight and army spending without enough economy behind it, the "would this
  bigger army push my cash *or* my food negative?" brake trips and *forces*
  it to build economy instead — the opposite of what you wanted. An
  aggressive archetype needs a cheap/lean army, a cheap government, or (small
  code change) its own softer brake.
- **Factory output and buy-mix are separate.** `production` (passive, includes
  spies) vs `targetMix` (only on a buy roll, no spies). A turret archetype
  needs turrets in *both* to get a wall up fast.
- **Attack-type mix only matters before the AI has scouted you.** After a
  fresh spy report it targets your weakest stat regardless.
- **Season heat compounds.** Effective attack weight late in a hard season is
  `attack weight × season-heat` — and season heat maxes higher on higher
  tiers (up to ×4.2 on Apex). A high base attack weight on a high tier gets
  very large near the deadline.
- **Explore only unlocks near "full."** An archetype that builds slowly
  (low construction-site weight) stays under the explore gate longer and
  expands its borders less — less land, less net worth, less home defense.

---

## Difficulty ≠ personality — the season levers

Difficulty is **tempo and pressure**, never a bigger or meaner AI. Every tier
starts the AI at the player's exact size with these same decision weights.
Three levers, in `src/data/difficultyTiers.ts`:

| Lever | Plain meaning | Range across the 10 tiers |
|---|---|---|
| `attackUnlockFraction` | How far into the season before combat opens. The AI always uses its tier's value; the **player** uses `min(tier value, 0.20)` — so on easy tiers the AI is held back longer than you, on hard tiers you're both unlocked early. | 0.40 (Militia, ~day 13 of 30) → 0.20 (Veteran, ~day 7) → 0.0 (Apex, day 1) |
| `seasonHeatMaxMult` | How hard late-game aggression ramps. Every AI's attack/spy weight climbs from ×1 on day 1 to this by the deadline. | 1.6 (Militia) → 2.4 (Veteran) → 4.2 (Apex) |
| `aiTurnPoolDelta` | AI actions per day, relative to the base 50. The player always gets 50. | −8 (Militia, AI gets 42) → 0 (Veteran) → +10 (Apex, AI gets 60) |

Full 10-tier table is in that file. Nudge individual rows as playtesting
suggests — there are no difficulty-specific code paths, so a row edit is safe.
