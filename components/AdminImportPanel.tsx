"use client";

import React, { useMemo, useState } from "react";

type Tab = "facebook" | "ics" | "excel";

function monthName(m: number) {
  const en = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return en[m - 1] ?? String(m);
}

function buildFacebookQuery(opts: { city: string; month: number; year: number; keywords: string }) {
  const parts: string[] = [];
  parts.push("site:facebook.com/events");
  if (opts.city.trim()) parts.push(`(${opts.city.trim()})`);
  const mName = monthName(opts.month);

  const monthOr = `(${mName} OR ${mName.slice(0, 3)})`;
  parts.push(monthOr);
  parts.push(String(opts.year));
  if (opts.keywords.trim()) parts.push(opts.keywords.trim());
  return parts.join(" ");
}

function isValidHttpUrl(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function AdminImportPanel(props: { onImported?: () => void }) {
  const [tab, setTab] = useState<Tab>("facebook");

  // Facebook: builder
  const now = new Date();
  const [fbCity, setFbCity] = useState("Bydgoszcz");
  const [fbMonth, setFbMonth] = useState(now.getMonth() + 1);
  const [fbYear, setFbYear] = useState(now.getFullYear());
  const [fbKeywords, setFbKeywords] = useState("");
  const [fbQuery, setFbQuery] = useState(() =>
    buildFacebookQuery({ city: "Bydgoszcz", month: now.getMonth() + 1, year: now.getFullYear(), keywords: "" })
  );
  const [fbManual, setFbManual] = useState(false);
  const builtFbQuery = useMemo(
    () => buildFacebookQuery({ city: fbCity, month: fbMonth, year: fbYear, keywords: fbKeywords }),
    [fbCity, fbMonth, fbYear, fbKeywords]
  );

  // keep query in sync unless manually edited
  // (useEffect to avoid setState during render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!fbManual) setFbQuery(builtFbQuery);
  }, [builtFbQuery, fbManual]);

  const [fbLimit, setFbLimit] = useState(50);

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
          body: JSON.stringify({ type: "facebook", query: fbQuery, limit: fbLimit }),
        });
      } else if (tab === "ics") {
        res = await fetch("/api/admin/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "ics", url: icsUrl, limit: icsLimit, futureOnly: icsFutureOnly }),
        });
      } else {
        if (!excelFile) throw new Error("Choose an Excel file first");

        const fd = new FormData();
        fd.set("file", excelFile);
        fd.set("limit", String(excelLimit));

        res = await fetch("/api/admin/import", { method: "POST", body: fd });
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? `Import failed (${res.status})`);
      }

      setResult(json);
      props.onImported?.();
    } catch (e: any) {
      setError(e?.message ?? "Import failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ border: "1px solid #e6e6e6", borderRadius: 16, padding: 12, margin: 8, background: "#fff" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <strong style={{ fontSize: 14 }}>Import events</strong>
        <span style={{ opacity: 0.6, fontSize: 12 }}>Facebook / ICS / Excel</span>
      </div>

      <div style={{ display: "flex", gap: 8, paddingTop: 10, flexWrap: "wrap" }}>
        {(["facebook", "ics", "excel"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "7px 10px",
              borderRadius: 999,
              border: "1px solid #ddd",
              background: tab === t ? "#111" : "#fff",
              color: tab === t ? "#fff" : "#111",
              fontWeight: 800,
              cursor: "pointer",
              textTransform: "uppercase",
              fontSize: 12,
              letterSpacing: 0.5,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "facebook" && (
        <div style={{ paddingTop: 12, display: "grid", gap: 10 }}>
          <div style={{
            display: "grid",
            gap: 8,
            gridTemplateColumns: "minmax(0, 200px) minmax(120px, 160px) minmax(96px, 120px)",
          }}>
            <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>City</span>
              <input value={fbCity} onChange={(e) => { setFbCity(e.target.value); setFbManual(false); }} className="input" />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Month</span>
              <select
                value={fbMonth}
                onChange={(e) => { setFbMonth(Number(e.target.value)); setFbManual(false); }}
                className="input"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {monthName(m)}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Year</span>
              <input
                value={fbYear}
                type="number"
                onChange={(e) => { setFbYear(Number(e.target.value)); setFbManual(false); }}
                className="input"
              />
            </label>
          </div>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Extra keywords (optional)</span>
            <input value={fbKeywords} onChange={(e) => { setFbKeywords(e.target.value); setFbManual(false); }} className="input" />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              Google query (editable){fbManual ? " • manual override" : ""}
            </span>
            <textarea
              value={fbQuery}
              onChange={(e) => { setFbQuery(e.target.value); setFbManual(true); }}
              rows={3}
              className="input"
              style={{ resize: "vertical" }}
            />
          </label>

          {fbManual && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => { setFbManual(false); setFbQuery(builtFbQuery); }}
                style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 800 }}
              >
                Reset to builder
              </button>
              <span style={{ fontSize: 12, opacity: 0.65 }}>Builder is still available above.</span>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Fetch limit</span>
              <input
                value={fbLimit}
                type="number"
                min={1}
                max={100}
                onChange={(e) => setFbLimit(Number(e.target.value))}
                className="input"
                style={{ width: 140 }}
              />
            </label>
          </div>
        </div>
      )}

      {tab === "ics" && (
        <div style={{ paddingTop: 12, display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>ICS URL</span>
            <input value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} className="input" />
            {!icsUrlOk && <span style={{ fontSize: 12, color: "#b00020" }}>URL must start with http:// or https://</span>}
          </label>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Fetch limit</span>
              <input
                value={icsLimit}
                type="number"
                min={1}
                max={5000}
                onChange={(e) => setIcsLimit(Number(e.target.value))}
                className="input"
                style={{ width: 140 }}
              />
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 18 }}>
              <input type="checkbox" checked={icsFutureOnly} onChange={(e) => setIcsFutureOnly(e.target.checked)} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Future only</span>
              <span style={{ fontSize: 12, opacity: 0.65 }}>(skip past events)</span>
            </label>
          </div>
        </div>
      )}

      {tab === "excel" && (
        <div style={{ paddingTop: 12, display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Excel file (.xlsx/.xls)</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Row limit</span>
            <input
              value={excelLimit}
              type="number"
              min={1}
              max={5000}
              onChange={(e) => setExcelLimit(Number(e.target.value))}
              className="input"
              style={{ width: 140 }}
            />
          </label>

          <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
            Supported columns (case-insensitive): <code>title</code>, <code>description</code>, <code>startAt</code> /
            <code>start</code> / <code>date</code>, <code>endAt</code> / <code>end</code>, <code>place</code> /
            <code>location</code> / <code>address</code>, <code>city</code>, <code>countryCode</code>, <code>lat</code>,{" "}
            <code>lng</code>, <code>sourceUrl</code>, <code>sourceId</code>.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 12 }}>
        <button
          onClick={runImport}
          disabled={running || (tab === "ics" && !icsUrlOk)}
          style={{
            padding: "9px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: running ? "#f3f3f3" : "#111",
            color: running ? "#111" : "#fff",
            fontWeight: 900,
            cursor: running ? "default" : "pointer",
          }}
        >
          {running ? "Running..." : "Run import"}
        </button>

        {error && <span style={{ color: "#b00020", fontWeight: 800 }}>{error}</span>}
        {!error && result?.ok && <span style={{ color: "#0b7a0b", fontWeight: 900 }}>Done</span>}
      </div>

      {result && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 900 }}>Result</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 8 }}>{JSON.stringify(result, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
