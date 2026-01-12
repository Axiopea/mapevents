"use client";

import { useEffect, useState } from "react";
import CalendarPanel from "@/components/CalendarPanel";
import MapPanel from "@/components/MapPanel";
import type { EventItem, DateRange } from "@/components/types";

export default function Page() {
  const [items, setItems] = useState<EventItem[]>([]);
  const [range, setRange] = useState<DateRange | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const url = new URL("/api/events", window.location.origin);
      if (range?.from) url.searchParams.set("from", range.from);
      if (range?.to) url.searchParams.set("to", range.to);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = await res.json();
      setItems(data.items ?? []);
    };
    run();
  }, [range]);

  return (
    <div className="layout">
      <header className="header">
        <h1>Events map</h1>
        <p>Next.js + MapLibre + FullCalendar (Prototype)</p>
      </header>

      <main className="grid">
        <section className="panel">
          <h2>Calendar with events</h2>
          <CalendarPanel
            items={items}
            onRangeChange={(r) => setRange(r)}
            onEventFocus={(id) => setFocusId(id)}
          />
        </section>

        <section className="panel">
          <h2>Map</h2>
          <MapPanel
            items={items}
            focusId={focusId}
            onMarkerClick={(id) => setFocusId(id)}
          />
        </section>
      </main>
    </div>
  );
}
