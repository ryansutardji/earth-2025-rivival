// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { useGame } from "./store";
import * as persist from "./persist";

beforeEach(() => {
  localStorage.clear();
  useGame.setState({
    world: null,
    lastError: null,
    battleReport: null,
    setup: {
      tierId: "recruit",
      rosterSize: 3,
      eligibleArchetypes: ["raider", "economic"],
      seasonLengthDays: 30,
      playerGovernment: "republic",
      seed: 4242,
    },
  });
});

describe("game store", () => {
  it("newSeason builds a world and persists it", () => {
    useGame.getState().newSeason();
    const world = useGame.getState().world;
    expect(world).not.toBeNull();
    expect(world!.enemies).toHaveLength(3);

    const saved = persist.load();
    expect(saved?.world.config.seed).toBe(4242);
  });

  it("a successful action is saved; reloading restores identical state", () => {
    useGame.getState().newSeason();
    useGame.getState().act({ kind: "build", buildingType: "enterpriseZones", acres: 5 });

    const inMemory = useGame.getState().world!;
    const reloaded = persist.load()!.world;
    expect(reloaded).toEqual(inMemory);
  });

  it("restored RNG state continues the exact same stream", () => {
    useGame.getState().newSeason();
    // Advance a few ticks so the RNG has moved.
    for (let i = 0; i < 5; i++) useGame.getState().act({ kind: "endDay" });
    const afterFive = useGame.getState().world!;

    // Simulate a page reload: rebuild the store's world from the save blob.
    const blob = persist.load()!;
    useGame.setState({ world: blob.world });
    useGame.getState().act({ kind: "endDay" });
    const continued = useGame.getState().world!;

    // And the "no reload" path taken from the same point.
    useGame.setState({ world: afterFive });
    useGame.getState().act({ kind: "endDay" });
    const straight = useGame.getState().world!;

    expect(continued).toEqual(straight);
  });

  it("rejected actions set an error and do not persist a change", () => {
    useGame.getState().newSeason();
    useGame.setState({ world: { ...useGame.getState().world!, player: { ...useGame.getState().world!.player, cash: 0 } } });
    const before = JSON.stringify(useGame.getState().world);

    useGame.getState().act({ kind: "build", buildingType: "farms", acres: 20 });
    expect(useGame.getState().lastError).toBeTruthy();
    expect(JSON.stringify(useGame.getState().world)).toBe(before);
  });

  it("toggleArchetype never empties the pool", () => {
    useGame.setState({
      setup: { ...useGame.getState().setup, eligibleArchetypes: ["raider"] },
    });
    useGame.getState().toggleArchetype("raider");
    expect(useGame.getState().setup.eligibleArchetypes).toEqual(["raider"]);
  });

  it("abandonSeason clears the world and the save", () => {
    useGame.getState().newSeason();
    useGame.getState().abandonSeason();
    expect(useGame.getState().world).toBeNull();
    expect(persist.load()).toBeNull();
  });
});
