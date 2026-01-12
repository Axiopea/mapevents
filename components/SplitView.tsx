"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  left: React.ReactNode;
  right: React.ReactNode;
  /** initial width of left panel in % (0..100) */
  initialLeftPct?: number;
  /** minimal width of left panel in px */
  minLeftPx?: number;
  /** minimal width of right panel in px */
  minRightPx?: number;
};

export default function SplitView({
  left,
  right,
  initialLeftPct = 45,
  minLeftPx = 320,
  minRightPx = 360,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const [leftPct, setLeftPct] = useState(initialLeftPct);

  const clampPct = useMemo(() => {
    return (pct: number) => Math.max(5, Math.min(95, pct));
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;

      // consider minimal px limit
      const minLeftPctLocal = (minLeftPx / width) * 100;
      const maxLeftPctLocal = 100 - (minRightPx / width) * 100;

      const pct = (x / width) * 100;
      const clamped = Math.max(minLeftPctLocal, Math.min(maxLeftPctLocal, pct));
      setLeftPct(clampPct(clamped));
    };

    const onUp = () => {
      draggingRef.current = false;
      document.body.classList.remove("no-select");
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [clampPct, minLeftPx, minRightPx]);

  return (
    <div ref={containerRef} className="split">
      <div className="splitPane" style={{ width: `${leftPct}%` }}>
        {left}
      </div>

      <div
        className="splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        tabIndex={0}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          draggingRef.current = true;
          document.body.classList.add("no-select");
        }}
        onKeyDown={(e) => {
          // keyboard tuning
          if (e.key === "ArrowLeft") setLeftPct((p) => clampPct(p - 2));
          if (e.key === "ArrowRight") setLeftPct((p) => clampPct(p + 2));
        }}
      >
        <div className="splitterGrab" />
      </div>

      <div className="splitPane" style={{ width: `${100 - leftPct}%` }}>
        {right}
      </div>
    </div>
  );
}
