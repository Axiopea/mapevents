import { EventSource } from "@prisma/client";

export type ExternalEvent = {
  title: string,
  description: string | null,
  countryCode: string,
  city: string,
  place: string | null,
  startAt: Date,
  endAt: Date | null,
  lat: string,
  lng: string,
  source: EventSource,
  sourceId: string,
  sourceUrl: string | null
  rawPayload: any
};