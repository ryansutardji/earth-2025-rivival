import { useState } from "react";
import { useGame } from "../state/store";
import { config } from "../engine/config";
import { privateBuyPrice, resourceBuyPrice } from "../engine/military";
import { BUYABLE_GOODS } from "../engine/types";
import type { BuyableGood, Nation } from "../engine/types";
import { compact, money } from "./format";

const smallBtn = "rounded px-2 py-1 text-xs font-semibold disabled:opacity-40";

const isResource = (g: BuyableGood): g is "bushels" | "oil" => g === "bushels" || g === "oil";

function holding(n: Nation, g: BuyableGood): number {
  if (g === "bushels") return n.bushels;
  if (g === "oil") return n.oil;
  return n.military[g];
}

function unitPrice(player: Nation, g: BuyableGood): number {
  return isResource(g) ? resourceBuyPrice(g) : privateBuyPrice(player, g);
}

export function MarketPanel({ player, disabled }: { player: Nation; disabled: boolean }) {
  const act = useGame((s) => s.act);
  const [qty, setQty] = useState<Record<BuyableGood, number>>(
    () => Object.fromEntries(BUYABLE_GOODS.map((g) => [g, 100])) as Record<BuyableGood, number>,
  );

  return (
    <section className="space-y-3 rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <h3 className="text-xs uppercase tracking-wide text-neutral-500">Private Market</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-sm">
          <thead className="text-[10px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-1 text-left font-medium">Good</th>
              <th className="py-1 text-right font-medium">You hold</th>
              <th className="py-1 text-right font-medium">Price</th>
              <th className="py-1 text-right font-medium">Qty</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {BUYABLE_GOODS.map((g) => {
              const price = unitPrice(player, g);
              const total = Math.ceil(price * (qty[g] || 0));
              return (
                <tr key={g} className="border-t border-neutral-800">
                  <td className="py-1.5 text-neutral-200">{g}</td>
                  <td className="py-1.5 text-right text-neutral-400">{compact(holding(player, g))}</td>
                  <td className="py-1.5 text-right text-emerald-300">{money(price)}</td>
                  <td className="py-1.5 text-right">
                    <input
                      type="number"
                      min={1}
                      value={qty[g]}
                      onChange={(ev) => setQty((q) => ({ ...q, [g]: Number(ev.target.value) }))}
                      className="w-24 rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-right text-xs"
                    />
                  </td>
                  <td className="py-1.5 pl-2 text-right">
                    <button
                      className={`${smallBtn} bg-emerald-800 hover:bg-emerald-700`}
                      disabled={disabled}
                      onClick={() =>
                        act(
                          isResource(g)
                            ? { kind: "buyResource", good: g, qty: qty[g] }
                            : { kind: "buyMilitary", unitType: g, qty: qty[g] },
                        )
                      }
                      title={`total ${money(total)}`}
                    >
                      Buy
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-neutral-600">
        Instant, cash only. 1 turn per purchase, whatever the quantity (max{" "}
        {config.maxBuyPerAction.toLocaleString()} units per buy). Unit prices drop with Military tech,
        Military Bases, and government; bushels &amp; oil are flat.
      </p>
    </section>
  );
}
