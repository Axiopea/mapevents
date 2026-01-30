export type EventItem = {
  id: string;
  title: string;
  countryCode: string; // ISO-3166 alpha-2, e.g. "PL"
  city: string;
  place: string | null;
  lat: number;
  lng: number;
  startAt: string; // ISO
  endAt: string | null; // ISO
  status?: "draft" | "pending" | "approved" | "rejected";
  sourceUrl: string | null;
};

export type DateRange = { from: string; to: string };