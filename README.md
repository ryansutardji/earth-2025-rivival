# Earth 2025 Revival

A solo-player, browser-playable nation-management strategy game modeled on
**Earth Empires / Earth 2025**. All player-vs-player is replaced by **AI
opponents that run the same real economy and take the same real actions you
do** (PvE) — no scripted growth curve.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine + store + UI smoke tests (vitest)
npm run build      # typecheck (tsc -b, strict) + production bundle
```

## How a game works

1. **Setup screen** — pick a difficulty tier, roster size (2–12), season length
   (10–60 days), your **government**, and which archetypes may spawn. "Randomize
   all" / "reroll" seed if you'd rather not choose. **Start Season** generates a
   fixed roster of enemy nations.
2. **Each turn** you spend from a turn pool (`turnPoolCap`, default 50) on one
   action (see below). **Every action advances the world one tick** — your
   economy runs, and every undefeated archetype takes its turn (a Raider may
   attack you back).
3. **End Day** refills the turn pool and advances the day. Each archetype gets
   one real action per action you take during the day, plus a catch-up pass on
   End Day that drains whatever turn budget it hasn't spent — so an idle
   player never shortchanges the AI and an active one never grants it extra.
4. **Win — hybrid condition (mirrors Earth 2025's "score at set end"):**
   - **Elimination victory** — wipe out every enemy nation before the deadline.
   - **Net-worth victory** — reach the season deadline holding the #1 net worth.
   - **Loss** — the deadline passes and an enemy out-scores you.

   The end-of-season screen shows the full net-worth ranking either way.

Game state is saved to `localStorage` after every action; reload and you resume
exactly (RNG stream included).

## Player actions

Mechanics and terminology are reconciled against the **Earth Empires wiki**
(`docs/earth-empires-wiki.md`) — building names/effects, the eight governments'
exact modifiers, the eleven tech areas, the five attack types, the explore
tables, oil-per-25-units, per-capita income, and military cash upkeep.

| Action | Cost | Effect |
|---|---|---|
| **Explore** | 1 turn | Claim land at the EE acres-per-turn rate for your total land (Republic gets the higher table). Turns only. |
| **Build / Demolish** | 1 turn | Up to Buildings-Per-Turn acres (raised by Construction Sites, cut by Dictatorship). Cost scales with total land. |
| **Cash** | 1 turn | This turn's revenue ×1.2. |
| **Private market** | 1 turn | Instant troop/jet/turret/tank buys at wiki base price, discounted by Military Bases + Military tech + government. Spies can't be bought. |
| **Public market** — buy / sell | 1 turn | Floating price/stock for units + bushels + oil. Selling production surplus is how you stay solvent. |
| **Set tax rate** (0–70%) | 1 turn | Higher take = more revenue, lower PCI + population growth. |
| **Set production** | 1 turn | The %-mix your Industrial Complexes turn out (troops/jets/turrets/tanks/spies). |
| **Set research focus** | 1 turn | Which of 11 areas your Research Labs feed. |
| **Change government** | 6 turns | Swap to another of the eight EE governments. |
| **Attack** — Standard / Planned / Guerilla / Bombing / Artillery | 1–3 turns + oil | Standard/Planned grab land + cash + bushels + buildings + tech; Guerilla (troops vs troops) kills population; Bombing (jets vs turrets) razes buildings; Artillery (tanks vs tanks) razes buildings. Oil = 1 barrel / 25 units sent. |
| **Covert op** — Spy / Espionage / Bomb Buildings / Raid Food / Sabotage Intel / Dissension | 2 turns | Success = your SPAL × Spy tech × government vs theirs. Spy lifts fog-of-war; the rest are harmful and build diminishing-returns "heat" on the target. |
| **Launch missile** — Chemical / Cruise / Nuclear | 1 turn + oil | Countered by the target's SDI tech. Chemical kills population + razes; Cruise wipes units; Nuclear destroys land. Missiles are produced passively by Warfare tech. |
| **End Day** | — | Refill turns, advance the day, cool covert heat, drift the market. |

Enemy detail (army, tech, stockpiles, missiles, government) is hidden until a
successful **Spy** op — the roster then shows a snapshot with its age.

### The economy (each tick)

- **Buildings** (8): **Enterprise Zones** (per-capita income) · **Residences**
  (population ceiling) · **Industrial Complexes** (unit production per your mix) ·
  **Military Bases** (cut upkeep + private-market prices) · **Research Labs**
  (research, labs ÷ land) · **Farms** (5.3 bushels/acre) · **Oil Rigs** (2
  barrels/acre) · **Construction Sites** (raise Buildings-Per-Turn).
- **Revenue** = population × per-capita income × tax rate. PCI rises with
  Enterprise-Zone density and Business tech, falls under a punishing tax rate.
- **Military upkeep** is cash per unit per turn — a big army runs the economy
  negative, so you sell production surplus on the market to stay afloat.
- **Bushels**: Farms produce, population + military eat. Zero → **starvation**
  (population + unit desertion). **Cash** zero → the same desertion.
- **Oil**: Oil Rigs produce; only attacks and missile launches consume it.
- **Research** (11 EE areas): Military (upkeep) · Medical (your defence losses) ·
  Business (PCI) · Residential (pop) · Agricultural (bushels) · Warfare (missile
  output) · Military Strategy (strike gains) · Weapons (strength) · Industrial
  (unit output) · Spy (covert) · SDI (missile interception). Effect runs from a
  base to a ceiling scaled by the government's tech modifier.
- **Governments** (all eight, wiki values): **Monarchy** (neutral default) ·
  **Democracy** (+tech ceiling, 0% commission, slow attacks) · **Republic**
  (+explore, +PCI, −strength) · **Theocracy** (−military cost, +build rate,
  +pop, −tech) · **Communism** (+industrial, +tech rate) · **Dictatorship**
  (+strength, +spy, +capture, −build rate) · **Tyranny** (1-turn attacks,
  +attack gains, −PCI) · **Fascism** (+bushels, +oil, −PCI, −pop).

## Architecture

```
src/
  engine/              pure TypeScript — no React, no DOM, fully deterministic
    types.ts           Nation / Buildings / Military / TechLevels / WorldState
    config.ts          EVERY tunable balance number
    rng.ts             mulberry32 seeded PRNG (state is one uint32 → serializable)
    economy.ts         applyEconomyTick — per-capita income, upkeep, production
                       mix, research, bushels/oil, starvation & treasury crisis
    tech.ts            the 11 tech areas: base→ceiling curve + system multipliers
    government.ts      the eight-government effect table + gov()
    market.ts          public market: floating price/stock, tick drift, buy/sell
    build.ts explore.ts military.ts policy.ts   the player actions
    combat.ts          resolveCombat(attacker, defender, attackType, rng) — one
                       formula, five EE attack types, identical for player or AI
    covert.ts          resolveCovertOp — SPAL vs counter-intel; 6 EE spy ops + heat
    missile.ts         resolveMissile — Chemical / Cruise / Nuclear vs SDI
    archetype/
      templates.ts     the 4 archetypes: decision table + unit/building target
                       mixes + priority lists + spend fractions + government
                       (all start from one shared baseline)
      decide.ts        weighted-random action selection (the "decision engine")
      applyTurn.ts     one archetype turn: real economy tick + one real action,
                       gated by genuine affordability (same as the player)
    networth.ts        netWorth(nation) + computeStandings(world) → season ranking
    season.ts          generateSeason(config, tier) → deterministic enemy roster
    turn.ts            applyPlayerTurn(world, action) → tick + resolve season end
    world.ts           createWorld(config) → a fresh season
  data/                UI-facing catalogues (tiers, archetypes, tech, governments)
  state/               Zustand store + versioned localStorage persistence
  ui/                  React + Tailwind, dark, dense-tabular
```

### Key invariants

- **The engine is pure and deterministic.** Same world + same actions ⇒ identical
  result. All randomness flows through one RNG rehydrated from `world.rngState`.
- **One combat formula.** `resolveCombat` takes two `Nation` stat bundles; it has
  no idea whether either side is human or AI. Combat and spying are
  multi-target — any nation can hit any other.
- **Archetypes play the real game.** They spend real cash and a real daily turn
  budget on the same actions the player uses (`build`, `buyMilitary`,
  `explore`, `setGovernment`, ...), gated by genuine affordability. No growth
  curve, no special-cased shortcut — their ceiling is the same one the player
  hits (land, income, turns).
- **Difficulty and government are data**, fed into the same code — no
  per-difficulty or per-government code paths.

## Extending it

- **Add an archetype:** entry in `src/engine/archetype/templates.ts` + id in
  `src/data/archetypes.ts`.
- **Add a difficulty tier:** entry in `src/data/difficultyTiers.ts`.
- **Add a government:** entry in `src/engine/government.ts`.
- **Tune balance:** every number lives in `src/engine/config.ts`.

## Open work

Everything unfinished, feeling wrong, or worth adding — balance & the
difficulty ladder, per-archetype AI calibration, the public market, UX,
tech debt, test gaps, open design questions — is tracked in
**[TODO.md](./TODO.md)**. Archetype behaviour specifically has its own
reference at **[docs/archetype-calibration.md](./docs/archetype-calibration.md)**.
