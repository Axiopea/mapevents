"use client";

import React, { useMemo, useState } from "react";
import CountrySelect from "@/components/CountrySelect";

type Tab = "facebook" | "ics" | "excel";

// Polish month names are often used in a few forms on event pages.
// - standalone: "styczeń"
// - in dates: "stycznia"
const MONTHS_PL_NOM = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
];

function monthNamePl(m: number) {
  return MONTHS_PL_NOM[m - 1] ?? String(m);
}

function buildFacebookQuery(opts: { city: string; month: number; year: number }) {
  const city = (opts.city || "").trim();
  const cityOr = city ? `(${city})` : "";

  const mPl = monthNamePl(opts.month);
  const monthOr = `(${mPl})`;

  return [cityOr, monthOr, String(opts.year)]
    .filter(Boolean)
    .join(" ");
}

function isValidHttpUrl(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function AdminImportPanel(props: {
  onImported?: () => void;
  countryCode?: string | null;
  onCountryChange?: (countryCode: string | null) => void;
}) {
  const [tab, setTab] = useState<Tab>("facebook");

  const [localCountryCode, setLocalCountryCode] = useState<string | null>(null);
  const countryCode = props.countryCode ?? localCountryCode;
  const setCountryCode = props.onCountryChange ?? setLocalCountryCode;

  // Facebook
  const now = new Date();
  const [fbQuery, setFbQuery] = useState(() =>
    buildFacebookQuery({
      city: "Warszawa",
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    })
  );

  const [fbLimit, setFbLimit] = useState(50);

  const suggestedQuery = useMemo(
    () =>
      buildFacebookQuery({
        city: "Warszawa",
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ICS
  const [icsUrl, setIcsUrl] = useState("https://calendar.mit.edu/calendar.ics");
  const [icsLimit, setIcsLimit] = useState(200);
  const [icsFutureOnly, setIcsFutureOnly] = useState(true);

  const icsUrlOk = useMemo(() => isValidHttpUrl(icsUrl), [icsUrl]);

  // Excel
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelLimit, setExcelLimit] = useState(500);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runImport = async () => {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      let res: Response;

      if (tab === "facebook") {
        res = await fetch("/api/admin/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "facebook", query: fbQuery, limit: fbLimit, countryCode }),
        });
      } else if (tab === "ics") {
        res = await fetch("/api/admin/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "ics", url: icsUrl, limit: icsLimit, futureOnly: icsFutureOnly, countryCode }),
        });
      } else {
        if (!excelFile) throw new Error("Choose an Excel file first");

        const fd = new FormData();
        fd.set("file", excelFile);
        fd.set("limit", String(excelLimit));
        if (countryCode) fd.set("countryCode", countryCode);

        res = await fetch("/api/admin/import", { method: "POST", body: fd });
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data && (data.error || data.message)) || `Import failed (${res.status})`);
      }

      setResult(data);
      props.onImported?.();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  const tabs: Tab[] = ["facebook", "ics", "excel"];

  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 16,
        padding: 14,
        background: "#fff",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: tab === t ? "#111" : "#fff",
              color: tab === t ? "#fff" : "#111",
              cursor: "pointer",
              fontWeight: 900,
              textTransform: "uppercase",
              fontSize: 12,
              letterSpacing: 0.5,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <CountrySelect value={countryCode} onChange={setCountryCode} />
        <span style={{ fontSize: 12, opacity: 0.65, paddingBottom: 6 }}>
          When a country is selected, import will keep only events with that country code.
        </span>
      </div>

      {tab === "facebook" && (
        <div style={{ paddingTop: 12, display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Google query</span>
            <textarea
              value={fbQuery}
              onChange={(e) => setFbQuery(e.target.value)}
              rows={3}
              className="input"
              style={{ resize: "vertical" }}
            />
          </label>

          <label style={{ display: "grid", gap: 4, maxWidth: 220 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Fetch limit</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={5000}
              value={fbLimit}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setFbLimit(Math.max(1, Math.min(5000, Math.trunc(n))));
              }}
              className="input"
            />
          </label>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setFbQuery(suggestedQuery)}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              Use suggested query
            </button>
            <span style={{ fontSize: 12, opacity: 0.65 }}>
              Default: city “Warszawa”, month “{monthNamePl(now.getMonth() + 1)}”, year {now.getFullYear()}.
            </span>
          </div>
        </div>
      )}

      {tab === "ics" && (
        <div style={{ paddingTop: 12, display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>ICS URL</span>
            <input value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} className="input" />
            {!icsUrlOk && <span style={{ fontSize: 12, color: "crimson" }}>Invalid URL</span>}
          </label>

          <label style={{ display: "grid", gap: 4, maxWidth: 220 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Fetch limit</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={5000}
              value={icsLimit}
              onChange={(e) => setIcsLimit(Number(e.target.value))}
              className="input"
            />
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={icsFutureOnly}
              onChange={(e) => setIcsFutureOnly(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>Import future events only</span>
          </label>
        </div>
      )}

      {tab === "excel" && (
        <div style={{ paddingTop: 12, display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Excel file (.xlsx)</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <label style={{ display: "grid", gap: 4, maxWidth: 220 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Fetch limit</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={5000}
              value={excelLimit}
              onChange={(e) => setExcelLimit(Number(e.target.value))}
              className="input"
            />
          </label>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", paddingTop: 8 }}>
        <button
          type="button"
          onClick={runImport}
          disabled={running || (tab === "ics" && !icsUrlOk)}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: running ? "default" : "pointer",
            fontWeight: 900,
          }}
        >
          {running ? "Importing…" : "Run import"}
        </button>

        {error && <span style={{ color: "crimson", fontSize: 13 }}>{error}</span>}
        {result && <span style={{ color: "#111", fontSize: 13 }}>Done</span>}
      </div>

      {result && (
        <pre
          style={{
            marginTop: 10,
            padding: 12,
            background: "#fafafa",
            borderRadius: 12,
            border: "1px solid #eee",
            fontSize: 12,
            overflow: "auto",
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
