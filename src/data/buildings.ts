/** Building types — UI metadata (Earth Empires structure names). */

import type { Buildings } from "../engine/types";
import { BUILDING_TYPES } from "../engine/types";

export interface BuildingMeta {
  id: keyof Buildings;
  label: string;
  blurb: string;
}

export const BUILDING_META: Record<keyof Buildings, BuildingMeta> = {
  enterpriseZones: { id: "enterpriseZones", label: "Enterprise Zones", blurb: "Raise per-capita income (boosted by Business tech)." },
  residences: { id: "residences", label: "Residences", blurb: "Raise the population ceiling." },
  industrialComplexes: { id: "industrialComplexes", label: "Industrial Complexes", blurb: "Produce military units per your production mix." },
  militaryBases: { id: "militaryBases", label: "Military Bases", blurb: "Cut per-turn military upkeep and private-market prices." },
  researchLabs: { id: "researchLabs", label: "Research Labs", blurb: "Research points per turn (labs ÷ total land)." },
  farms: { id: "farms", label: "Farms", blurb: "Produce bushels (5.3/acre, +Agricultural tech)." },
  oilRigs: { id: "oilRigs", label: "Oil Rigs", blurb: "Produce oil (2 barrels/acre; Fascism +75%)." },
  constructionSites: { id: "constructionSites", label: "Construction Sites", blurb: "Raise buildings-per-turn. Always 1 turn each to build." },
};

export const BUILDING_META_LIST: BuildingMeta[] = BUILDING_TYPES.map((b) => BUILDING_META[b]);
