"use client";

import React, { useEffect, useMemo, useState } from "react";
import { COUNTRIES, formatCountryLabel, normalizeCountryCode } from "@/lib/countries";

type Props = {
  value: string | null | undefined;
  onChange: (countryCode: string | null) => void;
  placeholder?: string;
  /** When true, shows an explicit "All countries" option. */
  allowAll?: boolean;
};

function matchCountry(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Accept "Name (CC)" or "Name".
  const m = raw.match(/\(([A-Za-z]{2})\)\s*$/);
  if (m) {
    const cc2 = normalizeCountryCode(m[1]);
    if (cc2) return cc2;
  }

  const q = raw.toLowerCase();
  const hit = COUNTRIES.find((c) => c.name.toLowerCase() === q);
  if (hit) return hit.code;

  // Important: do NOT auto-pick a country for partial input.
  // We only accept an exact match (code or full country name or "Name (CC)").
  return null;
}

export default function CountrySelect({ value, onChange, placeholder, allowAll = true }: Props) {
  const [text, setText] = useState("");

  // Keep input text in sync with external value
  useEffect(() => {
    if (!value) {
      setText("");
    } else {
      setText(formatCountryLabel(value));
    }
  }, [value]);

  const options = useMemo(() => {
    const base = COUNTRIES.map((c) => `${c.name} (${c.code})`);
    return allowAll ? ["All countries", ...base] : base;
  }, [allowAll]);

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, opacity: 0.7 }}>Country</span>
      <input
        className="input"
        list="country-options"
        value={text}
        placeholder={placeholder ?? (allowAll ? "All countries" : "Type a country")}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (allowAll && v.trim().toLowerCase() === "all countries") {
            onChange(null);
            return;
          }
          const cc = matchCountry(v);
          if (cc) onChange(cc);
          if (!v.trim()) onChange(null);
        }}
        onBlur={() => {
          const v = text;
          if (allowAll && v.trim().toLowerCase() === "all countries") {
            setText("");
            onChange(null);
            return;
          }
          const cc = matchCountry(v);
          if (!v.trim()) {
            onChange(null);
            setText("");
            return;
          }
          if (cc) {
            setText(formatCountryLabel(cc));
            onChange(cc);
          } else {
            // Unknown input: revert to last known value
            setText(value ? formatCountryLabel(value) : "");
          }
        }}
        style={{ minWidth: 220 }}
      />
      <datalist id="country-options">
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}
