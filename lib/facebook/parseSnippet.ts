export function parseStartEndFromText(text: string): { startAt?: Date; endAt?: Date | null } {
  const t = text || "";

  const m = t.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s*(20\d{2})(?:\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM))?/i
  );

  if (!m) return {};

  const monthName = m[1].toLowerCase();
  const day = Number(m[2]);
  const year = Number(m[3]);

  const monthMap: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };

  const mm = monthMap[monthName] ?? 0;

  let hh = 12;
  let min = 0;

  if (m[4] && m[5] && m[6]) {
    hh = Number(m[4]);
    min = Number(m[5]);
    const ampm = m[6].toUpperCase();
    if (ampm === "PM" && hh !== 12) hh += 12;
    if (ampm === "AM" && hh === 12) hh = 0;
  } else {
    hh = 12;
    min = 0;
  }

  const startAt = new Date(year, mm, day, hh, min, 0);
  return { startAt, endAt: null };
}

export type SnippetInput = {
  title?: string;
  snippet?: string;
  query?: string;
  defaultCountry?: string;      // "Poland"
  defaultCountryCode?: string;  // "PL"
};

type ParsedDate = { year: number; month: number; day: number };

function inferYearFromQuery(query?: string): number | null {
  if (!query) return null;
  const m = query.match(/\b(20\d{2})\b/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

function normalizeText(s: string) {
  return (s || "")
    .replace(/\u2013|\u2014|\u2212/g, "-") // en-dash/em-dash/minus -> -
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateFromPolishText(t: string, yearHint?: number | null): ParsedDate | null {
  // 1) dd.mm.yyyy | dd-mm-yyyy | dd/mm/yyyy
  let m = t.match(/\b(\d{1,2})[.\/\-](\d{1,2})[.\/\-](20\d{2})\b/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const year = Number(m[3]);
    if (isFinite(day) && isFinite(month) && isFinite(year)) return { year, month, day };
  }

  // 2) yyyy-mm-dd
  m = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    if (isFinite(day) && isFinite(month) && isFinite(year)) return { year, month, day };
  }

  // 3) dd.mm (без года) -> берём yearHint
  m = t.match(/\b(\d{1,2})[.\/\-](\d{1,2})\b/);
  if (m && yearHint) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const year = yearHint;
    if (isFinite(day) && isFinite(month) && isFinite(year)) return { year, month, day };
  }

  // 4) "17 stycznia 2026" / "17 sty 2026" / "17 sty." / "17 stycznia" (год может отсутствовать)
  const polMonth: Record<string, number> = {
    // genitive (самое частое)
    stycznia: 0,
    lutego: 1,
    marca: 2,
    kwietnia: 3,
    maja: 4,
    czerwca: 5,
    lipca: 6,
    sierpnia: 7,
    wrzesnia: 8, "września": 8,
    pazdziernika: 9, "października": 9,
    listopada: 10,
    grudnia: 11,

    // short (с точкой и без)
    sty: 0, "sty.": 0,
    lut: 1, "lut.": 1,
    mar: 2, "mar.": 2,
    kwi: 3, "kwi.": 3,
    maj: 4, "maj.": 4,
    cze: 5, "cze.": 5,
    lip: 6, "lip.": 6,
    sie: 7, "sie.": 7,
    wrz: 8, "wrz.": 8,
    paz: 9, "paz.": 9, "paź": 9, "paź.": 9,
    lis: 10, "lis.": 10,
    gru: 11, "gru.": 11,
  };

  m = t.match(/\b(\d{1,2})\s+([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż\.]{3,})\s*(20\d{2})?\b/);
  if (m) {
    const day = Number(m[1]);
    const mk = m[2].toLowerCase().trim();
    const month = polMonth[mk];
    const year = m[3] ? Number(m[3]) : (yearHint ?? null);
    if (month !== undefined && year && isFinite(day) && isFinite(year)) return { year, month, day };
  }

  return null;
}

function parseTimeRange(t: string): { sh: number; sm: number; eh: number; em: number } | null {
  // 09:00-15:00 / 09.00-15.00
  let m = t.match(/\b(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})\b/);
  if (m) return { sh: Number(m[1]), sm: Number(m[2]), eh: Number(m[3]), em: Number(m[4]) };

  // od 9:00 do 15:00
  m = t.match(/\bod\s*(\d{1,2})[:.](\d{2})\s*do\s*(\d{1,2})[:.](\d{2})\b/i);
  if (m) return { sh: Number(m[1]), sm: Number(m[2]), eh: Number(m[3]), em: Number(m[4]) };

  // w godz. 09:00-15:00
  m = t.match(/\bw\s*godz\.?\s*(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})\b/i);
  if (m) return { sh: Number(m[1]), sm: Number(m[2]), eh: Number(m[3]), em: Number(m[4]) };

  return null;
}

function parseSingleTime(t: string): { h: number; m: number } | null {
  const m = t.match(/\b(?:godz\.?|o|start)\s*(\d{1,2})[:.](\d{2})\b/i);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

function normalizeDateText(s: string) {
  return (s || "")
    .replace(/\u2013|\u2014|\u2212/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseStartEndFromPolishText(
  text: string,
  opts?: { query?: string }
): { startAt?: Date; endAt?: Date | null } {
  const t = normalizeDateText(text);
  const yearHint = inferYearFromQuery(opts?.query);

  const polMonth: Record<string, number> = {
    stycznia: 0,
    lutego: 1,
    marca: 2,
    kwietnia: 3,
    maja: 4,
    czerwca: 5,
    lipca: 6,
    sierpnia: 7,
    wrzesnia: 8,
    "września": 8,
    pazdziernika: 9,
    "października": 9,
    listopada: 10,
    grudnia: 11,
    sty: 0, "sty.": 0,
    lut: 1, "lut.": 1,
    mar: 2, "mar.": 2,
    kwi: 3, "kwi.": 3,
    maj: 4, "maj.": 4,
    cze: 5, "cze.": 5,
    lip: 6, "lip.": 6,
    sie: 7, "sie.": 7,
    wrz: 8, "wrz.": 8,
    paz: 9, "paz.": 9, "paź": 9, "paź.": 9,
    lis: 10, "lis.": 10,
    gru: 11, "gru.": 11,
  };

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  // dd.mm.yyyy | dd-mm-yyyy | dd/mm/yyyy
  let m = t.match(/\b(\d{1,2})[.\/\-](\d{1,2})[.\/\-](20\d{2})\b/);
  if (m) {
    day = Number(m[1]);
    month = Number(m[2]) - 1;
    year = Number(m[3]);
  }

  // yyyy-mm-dd
  if (day == null) {
    m = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (m) {
      year = Number(m[1]);
      month = Number(m[2]) - 1;
      day = Number(m[3]);
    }
  }

  // dd.mm (no year) -> yearHint
  if (day == null && yearHint) {
    m = t.match(/\b(\d{1,2})[.\/\-](\d{1,2})\b/);
    if (m) {
      day = Number(m[1]);
      month = Number(m[2]) - 1;
      year = yearHint;
    }
  }

  // 17 stycznia 2026 / 17 sty 2026 / 17 sty
  if (day == null) {
    m = t.match(/\b(\d{1,2})\s+([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż\.]{3,})\s*(20\d{2})?\b/);
    if (m) {
      const mk = m[2].toLowerCase().trim();
      const mm = polMonth[mk];
      const yy = m[3] ? Number(m[3]) : yearHint;
      if (mm !== undefined && yy) {
        day = Number(m[1]);
        month = mm;
        year = yy;
      }
    }
  }

  if (day == null || month == null || year == null) return {};

  // range 09:00-15:00 / 09.00-15.00
  m = t.match(/\b(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})\b/);
  if (m) {
    const startAt = new Date(year, month, day, Number(m[1]), Number(m[2]), 0);
    const endAt = new Date(year, month, day, Number(m[3]), Number(m[4]), 0);
    return { startAt, endAt };
  }

  // od 9:00 do 15:00
  m = t.match(/\bod\s*(\d{1,2})[:.](\d{2})\s*do\s*(\d{1,2})[:.](\d{2})\b/i);
  if (m) {
    const startAt = new Date(year, month, day, Number(m[1]), Number(m[2]), 0);
    const endAt = new Date(year, month, day, Number(m[3]), Number(m[4]), 0);
    return { startAt, endAt };
  }

  // single time
  m = t.match(/\b(?:w\s*godz\.?|godz\.?|o|start)\s*(\d{1,2})[:.](\d{2})\b/i);
  if (m) {
    const startAt = new Date(year, month, day, Number(m[1]), Number(m[2]), 0);
    return { startAt, endAt: null };
  }

  return { startAt: new Date(year, month, day, 12, 0, 0), endAt: null };
}

/**
 * Улучшенный placeQuery парсер (как было у тебя), но оставляю без ломки API.
 * В sync-facebook.ts мы дополнительно пытаемся вытянуть venue/address из Facebook HTML meta.
 */
export function parsePlaceQueryFromSnippetV2(opts: {
  title?: string;
  snippet?: string;
  query?: string;
  defaultCountry?: string;
}): { placeQuery: string; city: string; countryCode: string } {
  const { title, snippet, query, defaultCountry = "Poland" } = opts;

  const raw = `${title ?? ""}\n${snippet ?? ""}`.trim();
  const cleaned = sanitizeSnippet(raw);

  const city = extractCityFromQueryOrTitle(query, title, snippet) ?? "Unknown";
  const countryCode = "PL";

  const addr = extractPolishAddressTail(cleaned);
  if (addr) {
    return {
      placeQuery: city !== "Unknown" ? `${addr}, ${city}, ${defaultCountry}` : `${addr}, ${defaultCountry}`,
      city,
      countryCode,
    };
  }

  const venue = extractVenueLike(cleaned);
  if (venue) {
    return {
      placeQuery: city !== "Unknown" ? `${venue}, ${city}, ${defaultCountry}` : `${venue}, ${defaultCountry}`,
      city,
      countryCode,
    };
  }

  if (city !== "Unknown") {
    return { placeQuery: `${city}, ${defaultCountry}`, city, countryCode };
  }

  return { placeQuery: defaultCountry, city: "Unknown", countryCode };
}

export function extractCityFromQueryOrTitle(query?: string, title?: string, snippet?: string): string | null {
  if (query) {
    const m = query.match(/\(([^)]+)\)/);
    if (m?.[1] && m[1].length >= 3) return m[1].trim();
  }
  if (title) {
    const m = title.match(/^\s*([^:]{3,40}):/);
    if (m?.[1]) return m[1].trim();
  }

  const t = `${snippet ?? ""}`;
  const m3 = t.match(/\bw\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]{2,})\b/);
  if (m3?.[1]) return m3[1];

  return null;
}

// ---------- helpers ----------

function extractVenueLike(text: string): string | null {
  const m = text.match(/\b(Sala|Dom|Centrum|Teatr|Filharmonia|Orkiestra|Klub|MOK|ROK)\b[\s\S]{0,80}/i);
  if (!m) return null;
  const seg = m[0].split(/[.;]/)[0].trim();
  if (seg.length < 4) return null;
  if (looksLikeDateOrTime(seg)) return null;
  return seg;
}

function sanitizeSnippet(text: string) {
  let t = text;
  t = t.replace(/\s+;\s+/g, " ; ");
  t = t.replace(/\s+/g, " ").trim();

  t = t.replace(/\bPublic\b/gi, "");
  t = t.replace(/\bNext week\b/gi, "");
  t = t.replace(/\bCET\b/gi, "");
  t = t.replace(/\bUTC\b/gi, "");

  t = t.replace(
    /\b\d{1,2}:\d{2}\s*(AM|PM)\s*[–-]\s*\d{1,2}:\d{2}\s*(AM|PM)\b/gi,
    ""
  );
  t = t.replace(/\bat\s*\d{1,2}:\d{2}\s*(AM|PM)\b/gi, "");
  t = t.replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\b/gi, "");

  t = t.replace(/\s+\.\s+/g, ". ");
  t = t.replace(/\s+,\s+/g, ", ");
  t = t.replace(/\s+;\s+/g, " ; ");
  t = t.replace(/\s{2,}/g, " ").trim();

  return t;
}

function looksLikeDateOrTime(s: string) {
  return /\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/i.test(
    s
  ) || /\b\d{1,2}:\d{2}\b/.test(s);
}

function extractPolishAddressTail(text: string): string | null {
  const m = text.match(/\b(ul\.|al\.|aleja|pl\.|plac|rynek)\s+[A-Za-zÀ-ž\u0100-\u017F\.\-\s]{2,}?\s+\d+[A-Za-z]?\b/i);
  return m?.[0]?.trim() ?? null;
}
