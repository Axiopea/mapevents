"use client";

import { useEffect, useState } from "react";
import CalendarPanel from "@/components/CalendarPanel";
import MapPanel from "@/components/MapPanel";
import SplitView from "@/components/SplitView";
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
    <div className="appShell">
      <header className="topbar">
        <div className="topbarLeft">
          <strong>Map events</strong>
          <span className="topbarHint">Calendar + map</span>
        </div>
      </header>

      <div className="content">
        <SplitView
          initialLeftPct={42}
          left={
            <div className="panelFull">
              <div className="panelTitle">Calendar with events</div>
              <div className="panelBody">
                <CalendarPanel
                  items={items}
                  onRangeChange={(r) => setRange(r)}
                  onEventFocus={(id) => setFocusId(id)}
                />
              </div>
            </div>
          }
          right={
            <div className="panelFull">
              <div className="panelTitle">Map</div>
              <div className="panelBody">
                <MapPanel items={items} focusId={focusId} onMarkerClick={(id) => setFocusId(id)} />
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
