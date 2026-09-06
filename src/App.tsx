import { useGame } from "./state/store";
import { SetupScreen } from "./ui/SetupScreen";
import { GameScreen } from "./ui/GameScreen";

export default function App() {
  const world = useGame((s) => s.world);

  return (
    <div className="min-h-full w-full">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-6 flex items-baseline justify-between border-b border-neutral-800 pb-3">
          <h1 className="text-lg font-bold tracking-tight text-neutral-100">
            EARTH 2025 <span className="text-emerald-400">REVIVAL</span>
          </h1>
          <span className="text-xs text-neutral-500">PvE nation-sim · vertical slice</span>
        </header>
        {world ? <GameScreen /> : <SetupScreen />}
      </div>
    </div>
  );
}
