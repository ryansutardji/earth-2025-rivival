/** Re-export of the government catalogue for UI consumption. Effects + `gov()`
 * live in `engine/government.ts`. */

export {
  GOVERNMENTS,
  GOVERNMENT_IDS,
  DEFAULT_GOVERNMENT,
  gov,
  type GovernmentEffects,
} from "../engine/government";
