"use client";

import { useEffect, useState } from "react";
import CalendarPanel from "@/components/CalendarPanel";
import CountrySelect from "@/components/CountrySelect";
import MapPanel from "@/components/MapPanel";
import SplitView from "@/components/SplitView";
import AdminImportPanel from "@/components/AdminImportPanel";
import type { DateRange, EventItem } from "@/components/types";

export default function AdminPage() {
  const [items, setItems] = useState<EventItem[]>([]);
  const [range, setRange] = useState<DateRange | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);

  const [statusMode, setStatusMode] = useState<"approved" | "notApproved">("approved");
  const [reloadToken, setReloadToken] = useState(0);
  const [showImportPanel, setShowImportPanel] = useState(false);

  useEffect(() => {
    const load = async () => {
      const url = new URL("/api/events", window.location.origin);
      if (range?.from) url.searchParams.set("from", range.from);
      if (range?.to) url.searchParams.set("to", range.to);
      if (countryCode) url.searchParams.set("country", countryCode);
      url.searchParams.set("statusMode", statusMode);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = await res.json();
      setItems(data.items ?? []);
    };
    load();
  }, [range, statusMode, countryCode, reloadToken]);

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="topbarLeft">
          <strong>Map events</strong>
          <span className="topbarHint">Admin</span>
        </div>
        <div className="topbarRight" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CountrySelect value={countryCode} onChange={setCountryCode} />
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

          <button
            onClick={() => setShowImportPanel((v) => !v)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: showImportPanel ? "#111" : "#fff",
              color: showImportPanel ? "#fff" : "#111",
              fontWeight: 800,
              cursor: "pointer",
              marginLeft: 8,
            }}
            aria-expanded={showImportPanel}
            aria-controls="admin-import-panel"
          >
            {showImportPanel ? "Hide Import" : "Show Import"}
          </button>
        </div>

        {showImportPanel && (
          <div id="admin-import-panel">
            <AdminImportPanel
              countryCode={countryCode}
              onCountryChange={setCountryCode}
              onImported={() => setReloadToken((x) => x + 1)}
            />
          </div>
        )}

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
                  admin
                  items={items}
                  countryCode={countryCode}
                  focusId={focusId}
                  onMarkerClick={(id) => setFocusId(id)}
                  onEventDeleted={(id) => {
                    setItems((prev) => prev.filter((x) => x.id !== id));
                  }}
                  onEventStatusChanged={(id, status) => {
                    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
                  }}
                  onEventEdited={(id, patch) => {
                    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
                  }}
                />
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
