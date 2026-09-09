# AI decision tree — every choice an AI nation makes

Plain-English map of *how* an AI nation decides what to do, in the order the
decisions happen. For each branch: **what decides it**, **which knob to turn**,
and **what turning it does**. Companion to `archetype-calibration.md` (which is
the knob values); this doc is the logic those knobs plug into.

All of it lives in `src/engine/archetype/applyTurn.ts` unless noted. Knob
values are in `src/engine/archetype/templates.ts` (per-archetype) or
`src/engine/config.ts` (shared).

---

## 0. The whole turn, top to bottom

```
AI nation's turn
│
├─ Out of turns for today?  ──────────────────────────────► do nothing, stop
│
├─ Still a Monarchy?  ────────────────────────────────────► spend turn: adopt government, stop
│     (its fixed one, or a random one if the season rolled random governments)
│
├─ Tax rate not at the season's sweet spot?  ─────────────► spend turn: fix tax rate, stop
│
├─ Otherwise:  BUILD THE MENU  (Section 1)
│     → cross off every action it can't afford / isn't allowed to do right now
│
├─ Menu empty?  ──────────────────────────────────────────► FALLBACK (Section 7): cash a turn, or explore
│
├─ Menu has options:  ROLL THE DICE  (Section 2)
│     → pick one action from the weighted table
│
├─ Do the chosen action:
│     ├─ attack    → Section 3 (who) → Section 4 (how)
│     ├─ spy       → Section 5 (who) → Section 6 (which op)
│     ├─ build army    → Section 8
│     ├─ build economy → Section 8
│     └─ explore   → claim land
│
└─ Run the economy tick (income, upkeep, food, factory output, growth)
```

Steps 2–3 (government, tax rate) are **Group C** — fixed, same for every
archetype, not meant to be a calibration surface. Everything below is.

---

## 1. Building the menu — "what am I even allowed to do this turn?"

Start from the archetype's 5 action weights. Cross an action off (**set its
weight to 0 for this turn**) if:

| Action | Crossed off when… | Knobs involved |
|---|---|---|
| **attack** | combat hasn't unlocked yet · OR sleeper-hold still active · OR no valid target · OR no army · OR no oil · OR not enough turns for an attack | `attackUnlockFraction` (tier), `attackHoldUntilFraction` (archetype), `turnsToAttack` (government) |
| **spy** | no spies · OR no target · OR fewer than 2 turns left | `turnCost.covertOp` |
| **build army** | can't afford the cheapest unit · **OR the upkeep brake trips** (Section 9) | `militarySpendFraction`, upkeep brake |
| **build economy** | can't afford one building · OR no empty land to build on | `buildSpendFraction` |
| **explore** | empty land is still above the explore gate · OR at/above the hard cap | `archetypeExploreLandFraction`, `exploreMaxEmptyLandFraction` |

Then two adjustments before rolling:

- **Land-hoard pull:** if the nation is sitting on a lot of empty land it
  *could* build on, force its **build-economy** weight up to at least
  `emptyLandBuildWeight` (9). Pulls a land-rich nation toward filling in
  rather than attacking. In practice only the Raider ever trips this.
- **Season heat:** multiply the **attack** and **spy** weights by the current
  season-heat number (Section 10).

> The table above is the walkthrough version. **Section 9 is the complete
> brake reference** — every block, override, cap, and the combat / economy
> backstop for when a brake fired too late.

---

## 2. Rolling the dice — "which action?"

`decideAction` in `src/engine/archetype/decide.ts`. Dead simple: weighted
random pick over whatever survived Section 1. No look-ahead, no board
evaluation. Bigger weight = more likely.

- **Knob:** the archetype's `decisionTable` (attack / spy / build-army /
  build-economy / explore weights).
- **Turn it up:** that action happens more often. Weights are relative — 
  `attack 4` next to `build-army 5` means attack is picked a bit less than
  build-army, before season heat.
- **Set to 0:** that action never happens for that archetype.

---

## 3. "Who do I attack?"

`pickAttackTarget`. Every nation on the list has already passed the "is this
worth trying?" check (Section 3a). Each candidate gets a **score**, highest
wins:

```
score  =  sizeScore  ×  grudgeBonus  ×  futilityDrag
```

| Factor | Plain meaning | Range | Knobs |
|---|---|---|---|
| **sizeScore** | Their land ÷ my land. Bigger-than-me nations are juicier (they have more to take); a nation I've picked clean floors out low so the pack stops farming it. | 0.5 – 2.0 | `targeting.sizeRatioMin` / `sizeRatioMax` |
| **grudgeBonus** | Did they attack me / get caught spying on me recently? A live grudge nudges them up the list. It's a *nudge*, never an override — it can't force a pick onto a nation I can't beat or one that's already stripped. | 1.0 – 1.5 | `targeting.grudgeWeight`, `targeting.grudgeSaturation` |
| **futilityDrag** | Have I bounced off this nation once or twice already? Eases me off them *before* the hard give-up threshold removes them entirely. | 0.34 – 1.0 | `targeting.futilityDrag`, `targeting.futilityDragFloor` |

Tie-break: more land first, then a seeded coin flip.

**There is deliberately no "can I win this?" term.** It was removed so that a
nation running away with the game can't drop off everyone's target list the
moment it gets scouted and then grow unopposed. The AI will swing at a
stronger nation and let combat's lopsided-fight randomness decide.

**No "hunts the player" bias** — the player is scored like any other nation.

### 3a. "Is this target worth trying at all?" (`attackViable`)

The only hard filter left: **have I been repelled by them too many times
recently?** (`attackFutility` score ≥ `attackFutilityThreshold`, which is 3).
Each repelled attack adds 2 points; a win wipes the score to 0; it fades by
2/day. So roughly: two failed attacks → leave them alone for about a day.

- **Turn `attackFutilityThreshold` up:** the AI keeps throwing turns at a
  wall longer before giving up.
- **Turn `attackFutilityDecayPerDay` up:** it forgives and comes back sooner.

---

## 4. "How do I attack?" — type and force size

`chooseAttack`.

```
Do I have a fresh spy report on them?  (newer than intelStalenessDays = 10)
│
├─ NO  → pick attack type from attackTypeMix (weighted dice: mostly Standard)
│         send everything (full attack)
│
└─ YES → is one of their stats clearly their weak spot?  (< 80% of their average)
         │
         ├─ NO  → Standard land-grab, full send
         │
         └─ YES → hit the weak spot:
                   weak turrets → Bombing (with jets)
                   weak tanks   → Artillery (with tanks)
                   weak troops  → Guerilla (with troops)
                   send  (their defense × attackForceMargin) ÷ my per-unit power
                   — i.e. enough to win with a 30% cushion, not everything
```

| Knob | Effect |
|---|---|
| `attackTypeMix` (archetype) | Blind / unscouted attack-type preference only. Ignored once they've been scouted. |
| `intelStalenessDays` (shared) | How long a spy report stays "fresh" enough to trust. Lower = the AI reverts to blind full-sends sooner. |
| `attackForceMargin` (shared) | The overshoot cushion on a scouted, targeted strike. 1.3 = send 30% more than the math says it needs. Lower = leaner strikes, more troops kept home. |
| `0.8` weak-spot threshold | Hard-coded in `chooseAttack`. A stat below 80% of the target's average counts as "weak." |

---

## 5. "Who do I spy on?"

`pickCovertTarget`. A spy op exists to turn an unknown into a known, so the
priority is the opposite of attacking:

```
1. anyone I have NO fresh intel on   ← spy the unknowns first
2. else, anyone I hold a grudge against   ← get eyes on whoever's coming for me
3. else, random
```

Size is ignored here — intel on anyone is cheap and useful. Mostly not a
calibration surface; it's logic, not knobs. (You could split it per-archetype
in code — e.g. a Turtle that only ever scouts nations that have hit it.)

---

## 6. "Which spy op?"

`pickCovertOp`.

```
No fresh intel on them?  → "spy"  (the basic scout — get the report)
Have fresh intel?        → random harmful op:
                            espionage / bomb buildings / raid food /
                            sabotage intelligence / cause dissensions
```

- Knob-free today. Op strengths and side-effects are in `config.covert.*`
  (success odds, spy losses, detection chance, effect sizes).
- Obvious calibration hook (needs code): a Raider that only picks ops which
  soften a target for a land attack; a Turtle that only runs counter-intel.

---

## 7. "What do I buy / build?" — the deficit-first recipe

Both **build army** and **build economy** work the same way:

```
Look at my current mix vs. my target mix.
Find the category furthest BELOW its target share.
Buy/build exactly enough of that one to close the gap.
Still have budget + turns?  → next-most-behind category.
...repeat, up to archetypeMaxPurchasesPerAction (4) times per roll.
Budget runs out mid-catch-up?  → buy what I can of that one, stop.
Everything already at target?  → (army only) keep buying anyway,
                                  splitting leftover cash evenly by priority.
```

| Knob | Effect |
|---|---|
| `targetMix` (archetype, army) | The troops/jets/turrets/tanks split it buys toward. **Turtle's 55% turrets lives here.** |
| `buildingMix` (archetype, economy) | The 8-way building split it builds toward. |
| `militarySpendFraction` / `buildSpendFraction` (archetype) | Cash it will commit to one such decision. |
| `buyPriority` / `buildPriority` (archetype) | Tie-breaker order once the mix is balanced. |
| `archetypeMaxPurchasesPerAction` (shared) | How many categories one roll can touch. |
| `maxBuyPerAction` (shared) | Unit cap per single buy call. |

Note the **factory output mix** (`production`) is separate — it runs
automatically every economy tick and is the only source of spies.

---

## 8. "Should I explore?"

Explore only enters the dice roll at all when empty land drops below
`archetypeExploreLandFraction` (10%) of total. And it's hard-capped: never
explore when empty land is at/above `exploreMaxEmptyLandFraction` (50%) — the
"can't explore a mostly-empty nation" rule. Between those, the archetype's
`explore` weight decides how eagerly it expands.

- **Raise `archetypeExploreLandFraction`:** AIs explore sooner / keep more
  spare land.
- **Raise the archetype's `explore` weight:** when it *is* allowed, it picks
  explore more often vs. building.

---

## 9. Decision brakes — the complete list

Every rule that blocks, forces, or overrides the weighted dice. Most run in
`applyTurn.ts` when the menu is built (Section 1); the last group is the
combat / economy backstop for when a brake was too late.

### 9a. Menu brakes — cross an action off this turn

| Brake | Applies to | Trigger | Knob |
|---|---|---|---|
| **Combat lock** | attack | Season hasn't reached the unlock day yet | `attackUnlockFraction` (tier) |
| **Sleeper hold** | attack | Day < season × the archetype's hold fraction (all 0 today) | `attackHoldUntilFraction` (archetype) |
| **No viable target** | attack | Every candidate is past the futility threshold (9c) or the list is empty | — |
| **No army** | attack | `battleUnits` (troops+jets+turrets+tanks *available*) ≤ 0 | — |
| **No oil** | attack | Oil ≤ 0 | — |
| **Not enough turns** | attack | Turns left < the government's `turnsToAttack` (1 Tyranny / 2 / 3 Democracy) | `turnsToAttack` (government) |
| **No spies / no target / short on turns** | spy | 0 spies, no candidates, or < 2 turns left | `turnCost.covertOp` |
| **Can't afford a unit** | build army | Cash < the cheapest purchasable unit | — |
| **Upkeep brake** ← the big one | build army | A dry run of the buy it *would* make this turn pushes **net cash < 0 OR net bushels < 0** | hard stop at 0; softening is a code change |
| **Can't afford a building / no room** | build economy | Cash < one building, or 0 empty acres | `buildSpendFraction` |
| **Explore preference gate** | explore | Empty land is still above `archetypeExploreLandFraction` (10%) of total | `archetypeExploreLandFraction` |
| **Explore hard cap** | explore | Empty land ≥ `exploreMaxEmptyLandFraction` (50%) — "can't explore a mostly-empty nation"; binds no matter the preference | `exploreMaxEmptyLandFraction` |

### 9b. Weight overrides — bend the dice instead of blocking

| Override | Trigger | Effect | Knob |
|---|---|---|---|
| **Season heat** | Always | Multiplies **attack** and **spy** weights, ×1 on day 1 → ×`seasonHeatMaxMult` at the deadline (Section 10) | `seasonHeatMaxMult` (tier) |
| **Land-hoard pull** | Sitting on ≥ 50% empty land it can still afford to build on | Forces **build-economy** weight up to at least `emptyLandBuildWeight` (9). In practice only ever bites the Raider | `emptyLandBuildWeight` |
| **Nothing-affordable fallback** | The whole menu got crossed off | Fully built out → explore. Otherwise → "cash a turn" for a ×`cashTurnBonus` (1.2) revenue bump — fixes the cash shortage that usually caused the empty menu | `cashTurnBonus` |

### 9c. Attack-futility gate (`attackViable`)

The one *persistent* attack brake — memory of getting bounced. Detailed in
Section 3a: `attackFutility` ≥ `attackFutilityThreshold` (3) drops a target
entirely; +2 per repelled attack, wiped by a win, decays 2/day.

### 9d. Purchase caps — limit one decision's spend

| Cap | Effect | Knob |
|---|---|---|
| **Purchases per roll** | One build/buy roll walks the priority list at most this many times, so it can't eat the whole day | `archetypeMaxPurchasesPerAction` (4) |
| **Units per buy call** | Hard ceiling on units bought in a single call | `maxBuyPerAction` (500) |
| **Spend fraction** | A build/buy decision commits at most this share of current cash | `militarySpendFraction` / `buildSpendFraction` (0.5) |

### 9e. Units unavailable after a battle *(combat.ts / brigades.ts)*

Not a decision, but it feeds the "no army?" brake above and the force-sizing
in Section 4 — both read **available** military, not total.

- **Post-battle defense suppression.** *Every* attack a nation suffers — won
  **or** repelled — benches **15%** of each of its unit types
  (`defenseSuppressionPct`) for **50 turns** (`defenseSuppressionTurns`).
  Entries **stack** per attack, so sustained pressure wears a wall down even
  through repeated repels. The units stay in `military` (they still count for
  net worth and upkeep) — only `availableMilitary` drops. Each entry counts
  down in the economy tick and the units rejoin when it expires.
- **Planned-strike brigade rest.** After a Planned attack, the surviving sent
  force goes into a brigade that rests `plannedStrikeRestTurns` before
  rejoining — unavailable to attack or defend meanwhile. (Only Planned; every
  other attack type returns its force immediately.)

### 9f. When a brake was too late — the economy-tick backstop *(economy.ts)*

Same rule for the player and every AI. Runs every economy tick:

| Crisis | Trigger | Consequence (per tick, until it clears) |
|---|---|---|
| **Treasury empty** | Net cash would go below 0 | Cash clamps to 0 · lose **3%** of population and **3%** of every unit type (`cashCrisisUnitLossPct`) · log: "TREASURY EMPTY — troops are deserting" |
| **Starvation** | Bushels would go below 0 | Bushels clamp to 0 · lose **4%** of population (`starvationPopLossPct`) and **3%** of every unit type (`starvationUnitLossPct`) · population growth throttled to 30% while empty · log: "STARVATION" |

Both self-correct: the over-large army shrinks a few percent each turn until
income / food covers what's left. The AI does **not** sell anything to escape
(there's no sell mechanism) — its only cash move is the "cash a turn"
fallback, and only when nothing else is affordable.

---

## 10. Season heat + difficulty — the multipliers on top

Two things scale the **attack** and **spy** weights *after* the archetype's
own numbers:

```
effective attack weight  =  decisionTable.attackPlayer  ×  seasonHeat(today)

seasonHeat  ramps linearly from  ×1  on day 1
                            to   ×(tier's seasonHeatMaxMult)  on the deadline
```

| Knob | Where | Effect |
|---|---|---|
| `seasonHeatMaxMult` | per difficulty tier (`difficultyTiers.ts`) | Late-game aggression ceiling. 1.6 on Militia → 2.4 on Veteran → 4.2 on Apex. |
| `attackUnlockFraction` | per tier | When combat opens. AI uses its tier value; player uses `min(tier value, 0.20)`. |
| `aiTurnPoolDelta` | per tier | AI actions per day vs. the base 50 (player always 50). −8 on Militia → +10 on Apex. |

So the same archetype on Militia vs. Apex is the *same personality* — it just
unlocks later or earlier, ramps to a higher fever pitch, and gets fewer or
more actions per day. There are no difficulty-specific code paths.

---

## Quick "I want to change X" index

| I want… | Turn this |
|---|---|
| Archetype attacks more / less often | its `decisionTable.attackPlayer` |
| Archetype builds economy more | its `decisionTable.buildEconomy` (and lower the others) |
| Turtle wall thicker / thinner | its `targetMix` turret share |
| AI gives up on a fortress sooner | `attackFutilityThreshold` down / `attackFutilityDecayPerDay` down |
| AI focuses the leader harder | `targeting.sizeRatioMax` up |
| Grudges matter more | `targeting.grudgeWeight` up |
| AI keeps more army home on attacks | `attackForceMargin` down |
| AI expands borders more | `archetypeExploreLandFraction` up, or archetype `explore` weight up |
| Aggressive archetype stops starving itself | give it a cheaper government, lean its `targetMix`, or (code) soften its upkeep brake |
| Being attacked hurts your defense more / less | `defenseSuppressionPct` (15%) or `defenseSuppressionTurns` (50) |
| Desertion / starvation losses bite harder | `cashCrisisUnitLossPct`, `starvationPopLossPct`, `starvationUnitLossPct` |
| Whole roster more aggressive late-game | tier `seasonHeatMaxMult` up |
| Whole roster attacks earlier | tier `attackUnlockFraction` down |
| AI gets more done per day | tier `aiTurnPoolDelta` up |
