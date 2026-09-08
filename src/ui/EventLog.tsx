import { useEffect, useRef } from "react";

export function EventLog({ log }: { log: string[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  return (
    <section className="space-y-2">
      <h3 className="text-xs uppercase tracking-wide text-neutral-500">Event log</h3>
      <div
        ref={ref}
        className="h-48 overflow-y-auto rounded border border-neutral-800 bg-neutral-950/80 p-2 text-[12px] leading-relaxed"
      >
        {log.length === 0 && <div className="text-neutral-600">Nothing has happened yet.</div>}
        {log.map((line, i) => (
          <div
            key={i}
            className={
              line.startsWith("—")
                ? "mt-1 text-neutral-500"
                : line.startsWith("↳")
                  ? "pl-3 text-[11px] text-neutral-500 tabular-nums"
                  : /eliminated|won|overran|looted|seized/i.test(line)
                    ? "text-emerald-300"
                    : /repelled|assault|massing|EMPTY|STARVATION/i.test(line)
                      ? "text-rose-300"
                      : "text-neutral-300"
            }
          >
            {line}
          </div>
        ))}
      </div>
    </section>
  );
}
