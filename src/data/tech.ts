/** The eleven Earth Empires research areas — UI metadata. Maths in `engine/tech.ts`. */

import type { TechCategory } from "../engine/types";
import { TECH_CATEGORIES } from "../engine/types";

export interface TechMeta {
  id: TechCategory;
  label: string;
  blurb: string;
}

export const TECH_META: Record<TechCategory, TechMeta> = {
  military: { id: "military", label: "Military", blurb: "Reduces military upkeep and private-market buy prices." },
  medical: { id: "medical", label: "Medical", blurb: "Reduces your unit losses when attacked." },
  business: { id: "business", label: "Business", blurb: "Raises the per-capita income ceiling." },
  residential: { id: "residential", label: "Residential", blurb: "Raises the population ceiling." },
  agricultural: { id: "agricultural", label: "Agricultural", blurb: "Raises the bushels-per-turn ceiling." },
  warfare: { id: "warfare", label: "Warfare", blurb: "Increases missile production per turn." },
  militaryStrategy: { id: "militaryStrategy", label: "Military Strategy", blurb: "More land & resources from Standard/Planned strikes." },
  weapons: { id: "weapons", label: "Weapons", blurb: "Raises overall military strength without buying units." },
  industrial: { id: "industrial", label: "Industrial", blurb: "Raises Industrial Complex output per turn." },
  spy: { id: "spy", label: "Spy", blurb: "Raises covert-op success and counter-intelligence." },
  sdi: { id: "sdi", label: "SDI", blurb: "Chance to intercept incoming missiles." },
};

export const TECH_META_LIST: TechMeta[] = TECH_CATEGORIES.map((c) => TECH_META[c]);
