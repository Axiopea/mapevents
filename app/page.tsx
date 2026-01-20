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

  const [statusMode, setStatusMode] = useState<"approved" | "notApproved">("approved");

  useEffect(() => {
    const load = async () => {
      const url = new URL("/api/events", window.location.origin);
      if (range?.from) url.searchParams.set("from", range.from);
      if (range?.to) url.searchParams.set("to", range.to);

      url.searchParams.set("statusMode", statusMode);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = await res.json();
      setItems(data.items ?? []);
    };
    load();
  }, [range, statusMode]);

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="topbarLeft">
          <strong>Map events</strong>
          <span className="topbarHint">Calendar + map</span>
        </div>
      </header>

      <div className="content">
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 8 }}>
          <button
            onClick={() => setStatusMode("approved")}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: statusMode === "approved" ? "#111" : "#fff",
              color: statusMode === "approved" ? "#fff" : "#111",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Events
          </button>

          <button
            onClick={() => setStatusMode("notApproved")}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: statusMode === "notApproved" ? "#111" : "#fff",
              color: statusMode === "notApproved" ? "#fff" : "#111",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Not Approved
          </button>
        </div>

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
