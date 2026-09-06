/**
 * Earth Empires explore-rate tables (wiki: Explore). The rate is an integer
 * acres-per-turn keyed to total land; `threshold` is the max land you can hold
 * before the rate drops to the next row. Republics use the higher table.
 *
 * Rate is NOT recalculated mid-batch — a batch explore at rate R for T turns
 * yields ~R × T acres regardless of thresholds crossed.
 */

/** [acresPerTurn, maxLandAtThisRate] */
type Row = readonly [number, number];

const NON_REPUBLIC: readonly Row[] = [
  [45, 1920], [44, 1983], [43, 2048], [42, 2117], [41, 2189], [40, 2265], [39, 2345],
  [38, 2429], [37, 2518], [36, 2612], [35, 2711], [34, 2816], [33, 2928], [32, 3047],
  [31, 3173], [30, 3308], [29, 3453], [28, 3608], [27, 3774], [26, 3954], [25, 4149],
  [24, 4360], [23, 4589], [22, 4841], [21, 5116], [20, 5420], [19, 5757], [18, 6132],
  [17, 6553], [16, 7028], [15, 7569], [14, 8189], [13, 8909], [12, 9755], [11, 10761],
  [10, 11979], [9, 13484], [8, 15389], [7, 17882], [6, 21280],
];

const REPUBLIC: readonly Row[] = [
  [54, 1915], [53, 1967], [52, 2021], [51, 2077], [50, 2135], [49, 2196], [48, 2259],
  [47, 2325], [46, 2394], [45, 2466], [44, 2541], [43, 2620], [42, 2703], [41, 2789],
  [40, 2881], [39, 2977], [38, 3077], [37, 3184], [36, 3297], [35, 3416], [34, 3542],
  [33, 3676], [32, 3818], [31, 3970], [30, 4132], [29, 4305], [28, 4491], [27, 4691],
  [26, 4907], [25, 5141], [24, 5394], [23, 5669], [22, 5971], [21, 6302], [20, 6666],
  [19, 7071], [18, 7521], [17, 8026], [16, 8596], [15, 9245], [14, 9989], [13, 10853],
  [12, 11868], [11, 13075], [10, 14537], [9, 16342], [8, 18629], [7, 21620],
];

/** Acres gained per explore turn for a nation at `land` total acres. */
export function exploreRate(land: number, republic: boolean): number {
  const table = republic ? REPUBLIC : NON_REPUBLIC;
  for (const [rate, threshold] of table) {
    if (land <= threshold) return rate;
  }
  return table[table.length - 1]![0]; // floor rate for huge empires
}
