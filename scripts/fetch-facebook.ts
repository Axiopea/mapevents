// scripts/fetch-facebook.ts
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

type RawFacebookFileEvent = {
  source: "facebook";
  sourceEventId: string;
  sourceUrl: string;

  title: string;
  description?: string;

  countryCode: string;
  city: string;
  place?: string;

  startAt: string; // ISO with timezone
  endAt?: string | null;

  lat: number;
  lng: number;

  raw: unknown; // store original payload-ish
};

function isoPlusDays(daysFromNow: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString(); // ok for MVP; later we need to preserve +01:00 formatting
}

function makeMockEvents(): RawFacebookFileEvent[] {
  // Warsaw-ish coords
  const warsaw = { lat: 52.2297, lng: 21.0122 };

  const events: RawFacebookFileEvent[] = [
    {
      source: "facebook",
      sourceEventId: "fb_mock_001",
      sourceUrl: "https://facebook.com/events/fb_mock_001",
      title: "Tech Meetup: MapEvents (Mock)",
      description: "Mock Facebook event for pipeline testing.",
      countryCode: "PL",
      city: "Warsaw",
      place: "Centrum, Warsaw",
      startAt: isoPlusDays(1, 18, 0),
      endAt: null,
      lat: warsaw.lat,
      lng: warsaw.lng,
      raw: {
        id: "fb_mock_001",
        provider: "facebook",
        fetchedAt: new Date().toISOString(),
        note: "This is mock payload",
      },
    },
    {
      source: "facebook",
      sourceEventId: "fb_mock_002",
      sourceUrl: "https://facebook.com/events/fb_mock_002",
      title: "Open Air Concert (Mock)",
      description: "Bring a blanket. Mock data.",
      countryCode: "PL",
      city: "Warsaw",
      place: "Lazienki Park",
      startAt: isoPlusDays(2, 20, 0),
      endAt: isoPlusDays(2, 22, 0),
      lat: 52.2153,
      lng: 21.0359,
      raw: {
        id: "fb_mock_002",
        fetchedAt: new Date().toISOString(),
        tags: ["music", "outdoor"],
      },
    },
    {
      source: "facebook",
      sourceEventId: "fb_mock_003",
      sourceUrl: "https://facebook.com/events/fb_mock_003",
      title: "Art Exhibition Opening (Mock)",
      countryCode: "PL",
      city: "Warsaw",
      place: "Art Gallery",
      startAt: isoPlusDays(5, 19, 0),
      endAt: null,
      lat: 52.2405,
      lng: 21.0074,
      raw: {
        id: "fb_mock_003",
        fetchedAt: new Date().toISOString(),
        organizer: { name: "Mock Gallery" },
      },
    },
  ];

  return events;
}

function writeNdjson(filePath: string, records: unknown[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const ndjson = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.writeFileSync(filePath, ndjson, "utf-8");
}

async function main() {
  // npx tsx scripts/fetch-facebook.ts storage/facebook.ndjson
  const outPath = process.argv[2] ?? "storage/facebook.ndjson";

  const records = makeMockEvents();
  writeNdjson(outPath, records);

  console.log(`Wrote ${records.length} events to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
