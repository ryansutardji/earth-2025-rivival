/**
 * Re-export of the archetype catalogue for UI consumption, plus which ones the
 * setup screen offers by default. Raider + Economic are the slice-verified pair.
 */

import type { ArchetypeId } from "../engine/types";
import { ARCHETYPES } from "../engine/archetype/templates";

export { ARCHETYPES };

export const ALL_ARCHETYPE_IDS: ArchetypeId[] = ["raider", "economic", "turtle", "balanced"];

export const DEFAULT_ELIGIBLE_ARCHETYPES: ArchetypeId[] = ["raider", "economic"];

export interface ArchetypeMeta {
  id: ArchetypeId;
  label: string;
  blurb: string;
}

export const ARCHETYPE_META: ArchetypeMeta[] = ALL_ARCHETYPE_IDS.map((id) => ({
  id,
  label: ARCHETYPES[id].label,
  blurb: ARCHETYPES[id].blurb,
}));
