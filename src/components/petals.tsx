import type { CSSProperties } from "react";

const PETALS = [
  { left: "6%", dur: "14s", delay: "0s", drift: "40px" },
  { left: "18%", dur: "16s", delay: "2s", drift: "-30px" },
  { left: "32%", dur: "13s", delay: "4s", drift: "55px" },
  { left: "48%", dur: "18s", delay: "1s", drift: "-20px" },
  { left: "61%", dur: "15s", delay: "6s", drift: "35px" },
  { left: "74%", dur: "17s", delay: "3s", drift: "-45px" },
  { left: "88%", dur: "14s", delay: "5s", drift: "25px" },
];

export function Petals() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {PETALS.map((p) => (
        <span
          key={p.left}
          className="petal"
          style={
            {
              left: p.left,
              "--dur": p.dur,
              "--delay": p.delay,
              "--drift": p.drift,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
