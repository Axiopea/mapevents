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
  defaultCountry?: string;      // "Poland"
  defaultCountryCode?: string;  // "PL"
};

export function parseStartEndFromPolishText(text: string): { startAt?: Date; endAt?: Date | null } {
  const t = (text || "").replace(/\u2013|\u2014/g, "-"); // en-dash/em-dash -> -

  // dd.mm.yyyy
  const dm = t.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
  if (!dm) return {};

  const day = Number(dm[1]);
  const month = Number(dm[2]) - 1;
  const year = Number(dm[3]);

  // time range "w godz. 09:00-15:00" or "09:00-15:00"
  const tr = t.match(/\b(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\b/);
  if (tr) {
    const sh = Number(tr[1]), sm = Number(tr[2]);
    const eh = Number(tr[3]), em = Number(tr[4]);
    const startAt = new Date(year, month, day, sh, sm, 0);
    const endAt = new Date(year, month, day, eh, em, 0);
    return { startAt, endAt };
  }

  // single time "godz. 18:00" or "o 18:00"
  const ts = t.match(/\b(?:godz\.?|o)\s*(\d{1,2}):(\d{2})\b/i);
  if (ts) {
    const h = Number(ts[1]), m = Number(ts[2]);
    const startAt = new Date(year, month, day, h, m, 0);
    return { startAt, endAt: null };
  }

  // fallback: date only -> noon (avoid timezone date shift)
  const startAt = new Date(year, month, day, 12, 0, 0);
  return { startAt, endAt: null };
}

export function parsePlaceQueryFromSnippet({
  title,
  snippet,
  defaultCountry = "Poland",
}: SnippetInput): string {
  const raw = `${title ?? ""}\n${snippet ?? ""}`.trim();
  const cleaned = sanitizeSnippet(raw);

  // 1) Если есть адресный хвост (ul./al./pl./rynek + номер) — это лучший кандидат
  const addr = extractPolishAddressTail(cleaned);
  if (addr) {
    // добавим город если можем достать
    const city = extractCityFromText(raw) ?? extractCityFromText(cleaned);
    return city ? `${addr}, ${city}, ${defaultCountry}` : `${addr}, ${defaultCountry}`;
  }

  // 2) Частый формат serp: "DATE ; ... ; VENUE. ul. ... , ..."
  // Возьмём куски после последних разделителей
  const parts = cleaned
    .split(/·|;|\n/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((p) => !looksLikeDateOrTime(p))
    .filter((p) => !looksLikeMeta(p));

  // если есть "Venue. ul. ..." — возьмём последний/предпоследний
  const best = pickBestPlaceCandidate(parts);
  if (best) {
    const city = extractCityFromText(raw) ?? extractCityFromText(best);
    // если best уже содержит город — не добавляем
    if (city && !new RegExp(`\\b${escapeRegExp(city)}\\b`, "i").test(best)) {
      return `${best}, ${city}, ${defaultCountry}`;
    }
    return `${best}, ${defaultCountry}`;
  }

  // 3) Если в title/snippet есть "Radom:" / "Kraków:" и т.п. — геокодим город
  const cityOnly = extractCityFromText(raw);
  if (cityOnly) return `${cityOnly}, ${defaultCountry}`;

  // 4) Fallback — страна
  return defaultCountry;
}

export function inferCityCountry(
  placeQuery: string,
  defaultCountryCode = "PL"
): { city: string; countryCode: string } {
  const pq = placeQuery.trim();

  const countryCode =
    /\bPL\b/i.test(pq) || /\bPoland\b/i.test(pq) || /\bPolska\b/i.test(pq)
      ? "PL"
      : defaultCountryCode;

  // city: ищем последнее "слово" перед Poland/PL если есть
  const m = pq.match(/,\s*([^,]+)\s*,\s*(Poland|Polska|PL)\s*$/i);
  if (m?.[1]) {
    return { city: m[1].trim(), countryCode };
  }

  // иначе попробуем вытащить из строки как "X, PL"
  const m2 = pq.match(/,\s*([^,]+)\s*,\s*([A-Z]{2})\s*$/);
  if (m2?.[1] && m2?.[2]) {
    return { city: m2[1].trim(), countryCode: m2[2].toUpperCase() };
  }

  // если нет — неизвестно
  return { city: "Unknown", countryCode };
}

export function extractCityFromQueryOrTitle(query?: string, title?: string, snippet?: string): string | null {
  // query like: site:facebook.com/events (Radom) ...
  if (query) {
    const m = query.match(/\(([^)]+)\)/); // первый ( ... )
    if (m?.[1] && m[1].length >= 3) return m[1].trim();
  }

  // title like: "Radom: ..."
  if (title) {
    const m = title.match(/^\s*([^:]{3,40}):/);
    if (m?.[1]) return m[1].trim();
  }

  // snippet sometimes contains "... Radom ..." (weak)
  const t = `${snippet ?? ""}`;
  const m2 = t.match(/\b([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]{2,})\b/);
  // слишком рискованно, поэтому только если явно есть "w <City>"
  const m3 = t.match(/\bw\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]{2,})\b/);
  if (m3?.[1]) return m3[1];

  return null;
}

export function parsePlaceQueryFromSnippetV2(opts: {
  title?: string;
  snippet?: string;
  query?: string; // <-- добавили!
  defaultCountry?: string;
}): { placeQuery: string; city: string; countryCode: string } {
  const { title, snippet, query, defaultCountry = "Poland" } = opts;

  const raw = `${title ?? ""}\n${snippet ?? ""}`.trim();
  const cleaned = sanitizeSnippet(raw);

  // City fallback from query/title
  const city = extractCityFromQueryOrTitle(query, title, snippet) ?? "Unknown";
  const countryCode = "PL";

  // 1) try address-like
  const addr = extractPolishAddressTail(cleaned);
  if (addr) {
    return {
      placeQuery: city !== "Unknown" ? `${addr}, ${city}, ${defaultCountry}` : `${addr}, ${defaultCountry}`,
      city,
      countryCode,
    };
  }

  // 2) try venue patterns like "Sala koncertowa R.O.K." / "Radomska Orkiestra Kameralna"
  const venue = extractVenueLike(cleaned);
  if (venue) {
    return {
      placeQuery: city !== "Unknown" ? `${venue}, ${city}, ${defaultCountry}` : `${venue}, ${defaultCountry}`,
      city,
      countryCode,
    };
  }

  // 3) if we know city -> city, country
  if (city !== "Unknown") {
    return { placeQuery: `${city}, ${defaultCountry}`, city, countryCode };
  }

  // 4) last resort
  return { placeQuery: defaultCountry, city: "Unknown", countryCode };
}

function extractVenueLike(text: string): string | null {
  // Выдернуть "Sala koncertowa R.O.K." или "Radomska Orkiestra Kameralna" если есть.
  // Берём предложения до точки, где есть ключевые слова
  const m = text.match(/\b(Sala|Dom|Centrum|Teatr|Filharmonia|Orkiestra|Klub|MOK|ROK)\b[\s\S]{0,80}/i);
  if (!m) return null;
  // обрежем по точке/точке с запятой
  const seg = m[0].split(/[.;]/)[0].trim();
  // отсекаем слишком общие/даты
  if (seg.length < 4) return null;
  if (looksLikeDateOrTime(seg)) return null;
  return seg;
}

// ---------- helpers ----------

function sanitizeSnippet(text: string) {
  let t = text;

  // унифицируем разделители
  t = t.replace(/\s+;\s+/g, " ; ");
  t = t.replace(/\s+/g, " ").trim();

  // выкинуть метки типа Public, Next week, Facebook UI слова
  t = t.replace(/\bPublic\b/gi, "");
  t = t.replace(/\bNext week\b/gi, "");
  t = t.replace(/\bCET\b/gi, "");
  t = t.replace(/\bUTC\b/gi, "");

  // убрать диапазоны времени "6:00PM – 7:30PM" / "6:00 PM - 7:30 PM"
  t = t.replace(
    /\b\d{1,2}:\d{2}\s*(AM|PM)\s*[–-]\s*\d{1,2}:\d{2}\s*(AM|PM)\b/gi,
    ""
  );

  // убрать одиночное время "at 6:00PM" (оставим дату)
  t = t.replace(/\bat\s*\d{1,2}:\d{2}\s*(AM|PM)\b/gi, "");

  // убрать "Sunday," / "Monday," и т.п.
  t = t.replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\b/gi, "");

  // нормализуем " . " и лишние знаки
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

function looksLikeMeta(s: string) {
  return /\bFacebook\b/i.test(s) || /^\s*\.\.\.\s*$/.test(s);
}

function extractPolishAddressTail(text: string): string | null {
  // Ищем фрагмент типа "ul. Żeromskiego 53" / "al. Jerozolimskie 12" / "pl. ..." с номером
  const m = text.match(/\b(ul\.|al\.|aleja|pl\.|plac|rynek)\s+[A-Za-zÀ-ž\u0100-\u017F\.\-\s]{2,}?\s+\d+[A-Za-z]?\b/i);
  return m?.[0]?.trim() ?? null;
}

function extractCityFromText(text: string): string | null {
  // 1) Часто в title: "Radom: ..."
  const m1 = text.match(/^\s*([A-Za-zÀ-ž\u0100-\u017F\-\s]{3,}):/);
  if (m1?.[1]) return m1[1].trim();

  // 2) Или в query/snippet: "(Radom)" или "in Radom"
  const m2 = text.match(/\b(in|w)\s+([A-Za-zÀ-ž\u0100-\u017F\-\s]{3,})\b/i);
  if (m2?.[2]) return m2[2].trim();

  // 3) Или "..., Radom, ..."
  const m3 = text.match(/,\s*([A-Za-zÀ-ž\u0100-\u017F\-\s]{3,})\s*,\s*(Poland|Polska|PL)\b/i);
  if (m3?.[1]) return m3[1].trim();

  return null;
}

function pickBestPlaceCandidate(parts: string[]) {
  if (!parts.length) return null;

  // предпочитаем то, что содержит адресный триггер
  const addr = parts.find((p) => /\b(ul\.|al\.|aleja|pl\.|plac|rynek)\b/i.test(p) && /\d/.test(p));
  if (addr) return addr;

  // затем то, что содержит точку (часто "Venue. ul. ...") — возьмём правую часть после последней точки
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    const dotIdx = p.lastIndexOf(".");
    if (dotIdx !== -1 && dotIdx < p.length - 2) {
      const tail = p.slice(dotIdx + 1).trim();
      if (tail && !looksLikeDateOrTime(tail)) return tail;
    }
  }

  // иначе последний “вменяемый”
  return parts[parts.length - 1];
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}