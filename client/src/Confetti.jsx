import { useMemo } from "react";

const COLORS = ["#e2b714", "#9fd18b", "#5a8dd6", "#e06c75", "#d6dae0"];

// Pure-CSS confetti burst. Rendered once; pieces fall and fade via animation.
export default function Confetti({ count = 70 }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.6,
        dur: 2.4 + Math.random() * 2,
        size: 6 + Math.random() * 7,
        color: COLORS[i % COLORS.length],
        rot: Math.random() * 360,
      })),
    [count]
  );

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.45,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}
