/**
 * Every tunable number in the simulation. Balance changes should not require
 * touching logic files. Values follow Earth Empires' shape (wiki) where a
 * source figure exists; the rest are tuned for this game's compressed season.
 */

export const SCHEMA_VERSION = 10;

export const config = {
  // ---- Season ----
  seasonLengthDays: 30,
  /** The economy's rates (cash, food, oil, tech, factory output, population
   * growth) are tuned for a season this long. A different `seasonLengthDays`
   * scales them by `pacingBaselineSeasonDays / seasonLengthDays` — a 60-day
   * season runs at half speed, a 15-day season at double — so a season always
   * has roughly the same *shape*, not just a shorter/longer flat clock. */
  pacingBaselineSeasonDays: 30,
  /** No attacking (combat or missiles), by anyone, until this fraction of the
   * season has passed — floor(seasonLengthDays * this). Gives every nation a
   * build-up window before anyone can start a fight. See `pacing.ts`. */
  noAttackDaysFraction: 0.2,
  netWorthWeights: {
    land: 10,
    building: 30,
    cashPerDollar: 0.0025,
    population: 2.5,
    bushelsPerUnit: 0.03,
    oilPerUnit: 0.3,
    techPerPoint: 1.2,
    troops: 4,
    jets: 6,
    turrets: 5,
    tanks: 16,
    spies: 5,
    missile: 400,
  },

  // ---- Turn economy ----
  turnPoolCap: 50,
  turnCost: {
    build: 1,
    explore: 1,
    cash: 1,
    buyMilitary: 1,
    marketTrade: 1,
    setTaxRate: 1,
    setProduction: 1,
    setResearchFocus: 1,
    setGovernment: 6,
    covertOp: 2,
    launchMissile: 1,
    // Standard/Planned strikes cost the government's `turnsToAttack` (2, or
    // Democracy 3 / Tyranny 1). Guerilla / Bombing / Artillery cost `attackOther`.
    attackOther: 2,
  },
  /** "Cash" turn: revenue for that tick is multiplied by this. */
  cashTurnBonus: 1.2,
  /** Leaving Monarchy is always free. Leaving any other government — even
   * switching straight back to Monarchy — costs this fraction of cash,
   * military, tech, and buildings to instability. Matches the wiki: "If your
   * current government is Monarchy, then there is no penalty..."; every other
   * change "incurred due to your country's instability." */
  governmentChangePenaltyPct: {
    cash: 0.08,
    military: 0.05,
    tech: 0.05,
    buildings: 0.05,
  },

  // ---- Population & per-capita income ----
  popBaseCapacity: 400,
  popPerResidence: 45,
  popGrowthRate: 0.035,
  /** Base per-capita income per citizen per turn (pre-tax, pre-modifiers). */
  basePci: 7,
  /** PCI multiplier from Enterprise-Zone density: 1 + (EZ/land) * this. */
  ezPciFactor: 2.6,
  /** Unused acres hold only a handful of citizens and earn a trickle of PCI. */
  unusedLandPciFactor: 0.05,
  unusedLandPopFactor: 0.02,
  /** Tax above this fraction starts eroding PCI and population growth. Rolled
   * once per season from `taxComfortThresholdRange`, seeded — the sweet spot
   * moves around each game instead of being one number you memorize forever.
   * Wide on purpose: threshold 0 rolls a harsh 30% sweet spot (real cost for
   * guessing wrong), threshold 0.70 rolls a season where tax has *no* PCI
   * penalty anywhere in the legal range — maxing to the 70% cap is
   * genuinely free that game, if you experiment enough to realize it.
   * `taxComfortThresholdDefault` is only the fallback for callers that don't
   * have a `WorldState` (tests, isolated previews). */
  taxComfortThresholdRange: [0, 0.7] as [number, number],
  taxComfortThresholdDefault: 0.18,
  /** Raised from 0.9: strong enough that a low-threshold season's PCI curve
   * peaks around 30% tax and clearly declines from there, instead of still
   * (barely) climbing all the way to the cap — maxing tax should be able to
   * cost real, immediate cash, not just a slow-burn population penalty. */
  taxPciSlope: 1.6667,
  taxUnhappySlope: 1.0,

  // ---- Bushels (food) ----
  bushelsPerFarmAcre: 5.3,
  bushelsPerUnusedAcre: 0.2,
  bushelsPerCitizen: 0.013,
  bushelsPerUnit: 0.004,
  /** Out of bushels: flat losses, then clamp the stockpile to 0. */
  starvationPopLossPct: 0.04,
  starvationUnitLossPct: 0.03,

  // ---- Oil ----
  oilPerRigAcre: 2,
  /** Attack oil cost = ceil(unitsSent / this). */
  unitsPerOilBarrel: 25,

  // ---- Military upkeep (cash per unit per turn) ----
  upkeepPerUnit: { troops: 1.3, jets: 1.9, turrets: 1.4, tanks: 5.2, spies: 1.5 },
  /** Military Bases cut upkeep + private-market price: 1 - min(cap, bases/land * factor). */
  militaryBaseUpkeepFactor: 2.2,
  militaryBaseUpkeepCap: 0.5,
  /** Cash hits zero mid-turn: same desertion as starvation. */
  cashCrisisUnitLossPct: 0.03,

  // ---- Industrial production ----
  /** Units produced per industrial-complex acre per turn (before modifiers). */
  unitsPerComplexAcre: 2.4,
  defaultProductionMix: { troops: 20, jets: 20, turrets: 20, tanks: 20, spies: 20 },

  // ---- Research ----
  techPerLabAcre: 0.16,
  /** base = neutral value; max = ceiling at full research (× government maxTechMult). */
  techBonus: {
    military: { base: 1.0, max: 0.82, scale: 2200 }, // costs → 82% of base
    medical: { base: 1.0, max: 0.7, scale: 2000 }, // your losses → 70%
    business: { base: 1.0, max: 1.8, scale: 2000 }, // +80% PCI ceiling
    residential: { base: 1.0, max: 1.8, scale: 2000 }, // +80% pop ceiling
    agricultural: { base: 1.0, max: 2.3, scale: 1800 }, // +130% bushels
    warfare: { base: 0.002, max: 0.06, scale: 2600 }, // missile production rate
    militaryStrategy: { base: 1.0, max: 1.4, scale: 2100 }, // +40% strike gains
    weapons: { base: 1.0, max: 1.5, scale: 2100 }, // +50% strength
    industrial: { base: 1.0, max: 1.6, scale: 1900 }, // +60% unit output
    spy: { base: 1.0, max: 1.5, scale: 1600 }, // +50% covert
    sdi: { base: 0.01, max: 0.9, scale: 2400 }, // interception chance
  },

  // ---- Construction ----
  buildCostBase: 140,
  buildCostPerLandAcre: 0.5,
  demolishRefundPct: 0.15,
  /** Buildings per turn = (bptBase + constructionSites * bptPerSite) * gov buildRate. */
  bptBase: 8,
  bptPerSite: 0.25,

  // ---- Private market (instant unit buys, cash) — wiki base costs ----
  unitCost: { troops: 144, jets: 192, turrets: 210, tanks: 588, spies: 0 },
  /** Sell fraction of buy price on the private market. */
  privateSellFraction: 0.25,
  maxBuyPerAction: 500,

  // ---- Public market (floating price/stock; wiki base costs where given) ----
  market: {
    spread: 0.07,
    volatility: 0.05,
    revertRate: 0.06,
    priceImpactPerFill: 0.35,
    minPriceFactor: 0.4,
    maxPriceFactor: 2.5,
    goods: {
      troops: { base: 108, restock: 400, stockCap: 6000 },
      jets: { base: 150, restock: 250, stockCap: 4000 },
      turrets: { base: 165, restock: 350, stockCap: 5000 },
      tanks: { base: 450, restock: 120, stockCap: 2000 },
      spies: { base: 130, restock: 60, stockCap: 1000 },
      bushels: { base: 30, restock: 20_000, stockCap: 400_000 },
      oil: { base: 40, restock: 6000, stockCap: 120_000 },
    },
  },

  // ---- Combat: unit power by attack type (wiki: Private market) ----
  power: {
    standard: {
      off: { troops: 1, jets: 2, turrets: 0, tanks: 4, spies: 0 },
      def: { troops: 1, jets: 0, turrets: 2, tanks: 4, spies: 0 },
    },
    planned: {
      off: { troops: 1.5, jets: 3, turrets: 0, tanks: 6, spies: 0 },
      def: { troops: 1, jets: 0, turrets: 2, tanks: 4, spies: 0 },
    },
    guerilla: {
      off: { troops: 1, jets: 0, turrets: 0, tanks: 0, spies: 0 },
      def: { troops: 1, jets: 0, turrets: 0, tanks: 0, spies: 0 },
    },
    bombing: {
      off: { troops: 0, jets: 2, turrets: 0, tanks: 0, spies: 0 },
      def: { troops: 0, jets: 0, turrets: 2, tanks: 0, spies: 0 },
    },
    artillery: {
      off: { troops: 0, jets: 0, turrets: 0, tanks: 4, spies: 0 },
      def: { troops: 0, jets: 0, turrets: 0, tanks: 4, spies: 0 },
    },
  },
  homeDefenseBonus: 300,
  /** Extra home defence per acre of land — bigger, established nations get
   * meaningfully tougher to crack, not just flat-bonus-forever small ones. */
  homeDefenseLandFactor: 0.15,
  /** Base combat swing (±) for an even fight. Widens as the matchup gets more
   * lopsided — see combatVarianceGrowth/Max — so close fights stay exactly
   * this contested, but a blowout isn't mathematically guaranteed. */
  combatVariance: 0.12,
  /** How fast the swing widens per unit of mismatch: swing = combatVariance +
   * this × (strongerSide/weakerSide − 1), capped at combatVarianceMax. */
  combatVarianceGrowth: 0.55,
  /** Hard ceiling on the swing, even for a total mismatch. */
  combatVarianceMax: 0.75,

  // ---- Spoils / losses ----
  /** Standard/Planned capture 3–8% of land, scaled by attacker:defender size. */
  landCaptureMinPct: 0.03,
  landCaptureMaxPct: 0.08,
  minLandCapture: 20,
  plannedStrikeBonus: 1.5,
  /** Planned Strike brigades: how long committed forces rest (unavailable for
   * attack or defense) before returning to the standing army — counted in
   * actual turns spent, carrying over across day boundaries, not reset by
   * End Day. Real EE caps concurrent brigades at 5. */
  plannedStrikeRestTurns: 100,
  maxBrigades: 5,
  cashLootPct: 0.15,
  bushelLootPct: 0.12,
  techLootPct: 0.08,
  buildingCapturePct: 0.5, // of the land captured, this share arrives as buildings
  winnerUnitLossPct: 0.05,
  loserUnitLossPct: 0.16,
  repelledLossPct: 0.12,
  /** Guerilla / Bombing / Chemical population kill on a hit. */
  populationKillPct: 0.06,
  /** Bombing / Artillery building raze on a hit. */
  buildingRazePct: 0.07,
  minRaze: 10,

  // ---- Missiles ----
  missile: {
    /** Fraction of warfare-rate that becomes a missile per turn. */
    productionScale: 1.0,
    /** Split of produced missiles. */
    mix: { chemical: 0.6, cruise: 0.3, nuclear: 0.1 },
    oilCost: { chemical: 200, cruise: 260, nuclear: 340 },
    chemical: { populationKillPct: 0.08, buildingRazePct: 0.03 },
    cruise: { unitKillPct: 0.06 },
    nuclear: { landDestroyPct: 0.05, buildingRazePct: 0.06, populationKillPct: 0.05, minLand: 60 },
  },

  // ---- Covert ops ----
  covert: {
    baseCounterIntel: 0.02, // SPAL-equivalent floor
    spyDefWeight: 1.3,
    opFactor: { spy: 1.6, espionage: 0.8, bombBuildings: 0.9, raidFoodStores: 1.0, sabotageIntelligence: 0.9, causeDissensions: 0.9 },
    minSuccess: 0.05,
    maxSuccess: 0.95,
    failSpyLossPct: 0.2,
    successSpyLossPct: 0.03,
    detectChanceOnFail: 0.6,
    detectChanceOnSuccess: 0.12,
    /** Each harmful op on a target adds this to its heat; heat cuts success. */
    heatPerOp: 0.12,
    heatSuccessPenalty: 0.5,
    heatDecayPerDay: 0.25,
    // effect magnitudes
    espionageTechPct: 0.1,
    bombBuildingsPct: 0.05,
    bombBuildingsMinAcres: 8,
    raidBushelsDestroyPct: 0.18,
    raidBushelsCapturePct: 0.06,
    sabotageSpiesPct: 0.15,
    dissentTroopsPct: 0.08,
  },

  // ---- Defeat thresholds — same rule for the player and AI nations: land
  // below defeatLandFloor OR total military below defeatMilFloor is eliminated.
  defeatLandFloor: 120,
  defeatMilFloor: 45,

  // ---- Tax rate bounds (wiki: 0%–70%) ----
  taxRateMin: 0.0,
  taxRateMax: 0.7,

  // ---- Archetype behaviour (real economy — no made-up growth ceiling) ----
  // Per-decision spend fractions (military / build) now live per-archetype on
  // `ArchetypeTemplate` — see `templates.ts` and docs/archetype-calibration.md.
  /** Max individual buy/build calls walked down the priority list in one
   * decision-table roll, so one roll can't eat the whole day's turns. */
  archetypeMaxPurchasesPerAction: 4,
  /** "Explore" only becomes a rollable decision-table action once empty
   * (unbuilt) land drops to this fraction of total land owned — otherwise
   * the affordability mask zeroes its weight. Keeps archetypes expanding
   * their borders like a player does (explore → fill with buildings →
   * explore again) instead of plateauing on their starting acreage. This is
   * a tuning preference, always stricter than `exploreMaxEmptyLandFraction`. */
  archetypeExploreLandFraction: 0.1,
  /** Hard cap: an archetype never explores when empty land is at or above
   * this fraction of total — the Earth Empires "can't explore with a mostly
   * empty nation" rule. Binds regardless of how `archetypeExploreLandFraction`
   * is tuned, so a loose preference can't make the AI waste turns claiming
   * land it can't build on. A broke archetype in this state falls back to
   * cashing a turn instead. */
  exploreMaxEmptyLandFraction: 0.5,
  /** A spy snapshot older than this many days is too stale to inform a
   * "smart" target/attack-type choice — falls back to the cautious default. */
  intelStalenessDays: 10,
  /** Grudge score added from getting attacked, or from a failed spy attempt
   * against you being detected — stacks with any existing grudge against
   * that same nation. Decays by grudgeDecayPerDay once a new day starts.
   * Deliberately steep relative to the per-event gains: a grudge is meant to
   * read as "actively hot right now," not a rivalry that lingers for days —
   * it only survives the night if that nation hit you several times in the
   * same day, otherwise it's wiped by morning. Stops a feud between two
   * archetypes from compounding forever and permanently locking out every
   * other target (including the player) — see TODO.md §2. */
  grudgeAttackedScore: 3,
  grudgeFailedSpyScore: 2,
  grudgeDecayPerDay: 10,
  /** Sizing an attack against a target you have real intel on: aim to
   * outnumber their known defense by this multiple, instead of sending
   * everything available. */
  attackForceMargin: 1.3,
  /** Before committing to an attack, an archetype drops any target it can't
   * realistically beat right now — from real intel (fresh spy snapshot says
   * my offense < their defense × attackViabilityMargin) or from experience
   * (attackFutility score ≥ threshold: it's been repelled by them recently).
   * A repelled attack adds `attackFutilityRepelledScore`, a successful one
   * clears the score; it decays by `attackFutilityDecayPerDay` once a new
   * day starts. Score 2 + threshold 3 means ~two losses in a row before it
   * backs off, so one unlucky roll (combat has real variance) doesn't spook
   * it. If *every* target gets filtered out, "attack" is simply dropped from
   * the decision roll for that turn — see TODO.md §2. */
  attackViabilityMargin: 1.15,
  attackFutilityRepelledScore: 2,
  attackFutilityThreshold: 3,
  attackFutilityDecayPerDay: 2,
  /** Season heat: hostile decision weights (attackPlayer/covertPlayer) ramp
   * linearly from ×1 on day 1 to ×seasonHeatMaxMult on the final day. Early
   * game is a build race; late game everyone comes for you. */
  seasonHeatMaxMult: 2.4,

  /** Attack target-selection score (see `pickAttackTarget` in
   * archetype/applyTurn.ts). Among targets that already cleared
   * `attackViable`, each candidate gets
   *   sizeScore × winScore × grudgeBonus × futilityDrag
   * and the highest wins. Replaces the old "whoever I spied most recently"
   * pecking order, which funnelled every AI onto the same weak nation. */
  targeting: {
    /** sizeScore = clamp(theirLand / myLand, min, max). Bigger-than-me
     * nations are juicier (matches the land-capture % curve); a crippled
     * nation floors out low so the pack stops farming it. */
    sizeRatioMin: 0.5,
    sizeRatioMax: 2.0,
    /** winScore, when there's a fresh spy snapshot: linear map of the real
     * power ratio (offense / [defense + home bonus]) from
     * `attackViabilityMargin` → winScoreMin up to winScoreRatioHi →
     * winScoreMax. Barely-viable scouted targets score *below*
     * `unknownWinScore` — looking and finding a coin-flip actively steers
     * the AI toward an easier or unscouted target. */
    winScoreMin: 0.6,
    winScoreMax: 1.5,
    winScoreRatioHi: 1.6,
    /** winScore with no fresh intel — neutral: the AI genuinely doesn't know. */
    unknownWinScore: 1.0,
    /** grudgeBonus = 1 + grudgeWeight × min(grudgeScore / grudgeSaturation, 1).
     * A multiplicative nudge (≤1.5×), never an override: it lifts a fresh
     * grievance up an even field but can't force a pick onto a picked-clean
     * or unbeatable nation. */
    grudgeWeight: 0.5,
    grudgeSaturation: 6,
    /** futilityDrag = clamp(1 - futilityDrag × attackFutility / threshold,
     * floor, 1). Eases the AI off a target it's bounced off once or twice
     * *before* `attackFutilityThreshold` removes it outright. */
    futilityDrag: 0.5,
    futilityDragFloor: 0.34,
  },
} as const;

export type Config = typeof config;
