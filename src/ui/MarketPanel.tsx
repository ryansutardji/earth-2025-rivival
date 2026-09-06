import { useState } from "react";
import { useGame } from "../state/store";
import { config } from "../engine/config";
import { MARKET_GOODS, buyPrice, sellPrice, holdingOf } from "../engine/market";
import type { MarketGood, Nation, WorldState } from "../engine/types";
import { compact, money } from "./format";

const smallBtn = "rounded px-2 py-1 text-xs font-semibold disabled:opacity-40";

export function MarketPanel({ player, market, disabled }: { player: Nation; market: WorldState["market"]; disabled: boolean }) {
  const act = useGame((s) => s.act);
  const [qty, setQty] = useState<Record<MarketGood, number>>(
    () => Object.fromEntries(MARKET_GOODS.map((g) => [g, 100])) as Record<MarketGood, number>,
  );

  return (
    <section className="space-y-3 rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <h3 className="text-xs uppercase tracking-wide text-neutral-500">Public Market</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-[10px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-1 text-left font-medium">Good</th>
              <th className="py-1 text-right font-medium">You hold</th>
              <th className="py-1 text-right font-medium">Buy</th>
              <th className="py-1 text-right font-medium">Sell</th>
              <th className="py-1 text-right font-medium">Stock</th>
              <th className="py-1 text-right font-medium">Qty</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {MARKET_GOODS.map((g) => {
              const e = market[g];
              return (
                <tr key={g} className="border-t border-neutral-800">
                  <td className="py-1.5 text-neutral-200">{g}</td>
                  <td className="py-1.5 text-right text-neutral-400">{compact(holdingOf(player, g))}</td>
                  <td className="py-1.5 text-right text-emerald-300">{money(buyPrice(e))}</td>
                  <td className="py-1.5 text-right text-amber-300">{money(sellPrice(e))}</td>
                  <td className="py-1.5 text-right text-neutral-400">{compact(e.stock)}</td>
                  <td className="py-1.5 text-right">
                    <input
                      type="number"
                      min={1}
                      value={qty[g]}
                      onChange={(ev) => setQty((q) => ({ ...q, [g]: Number(ev.target.value) }))}
                      className="w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-right text-xs"
                    />
                  </td>
                  <td className="py-1.5 pl-2 text-right">
                    <span className="inline-flex gap-1">
                      <button
                        className={`${smallBtn} bg-emerald-800 hover:bg-emerald-700`}
                        disabled={disabled}
                        onClick={() => act({ kind: "marketBuy", good: g, qty: qty[g] })}
                        title={`total ${money(Math.ceil(buyPrice(e) * qty[g]))}`}
                      >
                        Buy
                      </button>
                      <button
                        className={`${smallBtn} bg-amber-800 hover:bg-amber-700`}
                        disabled={disabled}
                        onClick={() => act({ kind: "marketSell", good: g, qty: qty[g] })}
                        title={`total ${money(Math.floor(sellPrice(e) * qty[g]))}`}
                      >
                        Sell
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-neutral-600">
        Cheaper than the private market, but stock is limited and prices drift each turn — your trades move them.
        Selling production surplus here is how most economies stay solvent. {config.turnCost.marketTrade}t per trade.
      </p>
    </section>
  );
}
