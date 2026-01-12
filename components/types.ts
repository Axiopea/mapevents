export type EventItem = {
  id: string;
  title: string;
  city: string;
  place: string | null;
  lat: number;
  lng: number;
  startAt: string; // ISO
  endAt: string | null; // ISO
  sourceUrl: string | null;
};

export type DateRange = { from: string; to: string };