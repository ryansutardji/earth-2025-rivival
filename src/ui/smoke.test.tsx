// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "../App";
import { useGame } from "../state/store";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  useGame.setState({
    world: null,
    lastError: null,
    battleReport: null,
    setup: { tierId: "recruit", rosterSize: 3, eligibleArchetypes: ["raider", "economic"], seasonLengthDays: 30, playerGovernment: "republic", seed: 4242 },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = () => act(() => root.render(<App />));
const html = () => container.innerHTML;

describe("UI smoke", () => {
  it("renders the setup screen when there is no world", () => {
    render();
    expect(html()).toContain("New Season");
    expect(html()).toContain("Difficulty tier");
    expect(html()).toContain("Start Season");
  });

  it("renders the game screen after a season starts", () => {
    render();
    act(() => useGame.getState().newSeason());
    expect(html()).toContain("Your Nation");
    expect(html()).toContain("Enemy roster");
    expect(html()).toContain("Event log");
    expect(html()).toContain("End Day");
    expect(html()).toContain("Private Market");
    expect(html()).toContain("Explore");
    expect(html()).toContain("Spy to reveal");
  });

  it("renders the covert report overlay after an op resolves", () => {
    act(() => {
      useGame.getState().newSeason();
      const w = useGame.getState().world!;
      useGame.setState({
        world: { ...w, player: { ...w.player, military: { ...w.player.military, spies: 500000 } } },
      });
    });
    render();
    const enemyId = useGame.getState().world!.enemies[0]!.id;
    act(() => useGame.getState().act({ kind: "covertOp", targetId: enemyId, op: "spy" }));
    expect(html()).toMatch(/Spy/); // the covert-report modal title
    expect(html()).toContain("Estimated success chance");
  });

  it("renders the battle report overlay after an attack resolves", () => {
    act(() => {
      useGame.getState().newSeason();
      const w = useGame.getState().world!;
      useGame.setState({
        world: {
          ...w,
          day: 10, // past the season's no-attack build-up window
          player: { ...w.player, oil: 9_999_999, military: { ...w.player.military, troops: 999999, jets: 999999 } },
        },
      });
    });
    render();
    const enemyId = useGame.getState().world!.enemies[0]!.id;
    act(() => useGame.getState().act({ kind: "attack", targetId: enemyId, attackType: "standard" }));
    expect(html()).toContain("Battle Report");
  });

  it("renders the season-end overlay with standings once the season is over", () => {
    act(() => {
      useGame.getState().newSeason();
      const w = useGame.getState().world!;
      useGame.setState({
        world: { ...w, status: "won_elimination", enemies: w.enemies.map((e) => ({ ...e, defeated: true })) },
      });
    });
    render();
    expect(html()).toContain("Elimination Victory");
    expect(html()).toContain("Net worth");
    expect(html()).toContain("New Season");
  });

  it("renders the loss overlay for a net-worth defeat", () => {
    act(() => {
      useGame.getState().newSeason();
      const w = useGame.getState().world!;
      useGame.setState({ world: { ...w, status: "lost_networth" } });
    });
    render();
    expect(html()).toContain("Season Lost");
  });

  it("shows an error banner when an action is rejected", () => {
    act(() => {
      useGame.getState().newSeason();
      const w = useGame.getState().world!;
      useGame.setState({ world: { ...w, player: { ...w.player, cash: 0 }, turnsRemaining: 50 } });
    });
    render();
    act(() => useGame.getState().act({ kind: "build", buildingType: "farms", acres: 20 }));
    expect(html()).toMatch(/need|not enough/i);
  });
});
