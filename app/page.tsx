"use client";

import { useEffect, useState } from "react";
import CalendarPanel from "@/components/CalendarPanel";
import CountrySelect from "@/components/CountrySelect";
import MapPanel from "@/components/MapPanel";
import SplitView from "@/components/SplitView";
import type { EventItem, DateRange } from "@/components/types";

export default function Page() {
  const [items, setItems] = useState<EventItem[]>([]);
  const [range, setRange] = useState<DateRange | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const url = new URL("/api/events", window.location.origin);
      if (range?.from) url.searchParams.set("from", range.from);
      if (range?.to) url.searchParams.set("to", range.to);
      if (countryCode) url.searchParams.set("country", countryCode);

      // Public view: only approved events
      url.searchParams.set("statusMode", "approved");

      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = await res.json();
      setItems(data.items ?? []);
    };
    load();
  }, [range, countryCode]);

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="topbarLeft">
          <strong>Map events</strong>
          <span className="topbarHint">Calendar + map</span>
        </div>
        <div className="topbarRight" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CountrySelect value={countryCode} onChange={setCountryCode} />
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
                <MapPanel
                  items={items}
                  countryCode={countryCode}
                  focusId={focusId}
                  onMarkerClick={(id) => setFocusId(id)}
                />
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
