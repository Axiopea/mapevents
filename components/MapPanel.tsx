"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl, { Map as MLMap, Popup } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { EventItem } from "./types";

type Props = {
  items: EventItem[];
  focusId?: string | null;
  onMarkerClick?: (id: string) => void;
};

function groupByCity(items: EventItem[]) {
  const map = new Map<string, EventItem[]>();

  for (const e of items) {
    // key by city + coordinates
    const key = `${e.city}__${e.lat.toFixed(4)}__${e.lng.toFixed(4)}`;
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }

  // sort events inside city by time
  return Array.from(map.entries()).map(([key, events]) => {
    events.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return { key, events };
  });
}

export default function MapPanel({ items, focusId, onMarkerClick }: Props) {
  const mapRef = useRef<MLMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<Popup | null>(null);

  // Easy style OSM raster (without keys)
  const style = useMemo<StyleSpecification>(
    () => ({
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "OpenStreetMap contributors",
        },
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm",
        },
      ],
    }),
    []
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [19.4, 52.1], // Poland
      zoom: 6,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    mapRef.current = map;

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [style]);

  // Render of markers as HTML elements (quickly for prototype)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old markers
    const old = document.querySelectorAll(".evt-marker");
    old.forEach((n) => n.remove());

    const groups = groupByCity(items);

    groups.forEach(({events}) => {
      const first = events[0];
      if (!first) return;
      const el = document.createElement("button");
      
      el.className = "evt-cal-stack";
      //el.title = e.title;
      el.type = "button";

      const d = new Date(first.startAt);

      // month shortly
      const mon = d
       .toLocaleDateString("en-us", { month: "short", timeZone: "UTC" })
       .replace(".", "")
       .toUpperCase();

      // day of month 1..31
      const day = d.toLocaleDateString("en-us", { day: "2-digit", timeZone: "UTC" });

      const tz = "UTC";
      const uniqueDays: string[] = [];
      const dayToEvent: EventItem[] = [];

      for (const ev of events) {
        const dayKey = new Date(ev.startAt).toLocaleDateString("en-us", { timeZone: tz }); // YYYY-MM-DD
        if (!uniqueDays.includes(dayKey)) {
         uniqueDays.push(dayKey);
         dayToEvent.push(ev);
        }
      }

      // show max 3 dates
      const shown = dayToEvent.slice(0, 3);
      const more = uniqueDays.length - shown.length;    

      const cardsHtml = shown
        .map((ev, idx) => {
        const d = new Date(ev.startAt);

        const mon = d
          .toLocaleDateString("en-us", { month: "short", timeZone: tz })
          .replace(".", "")
          .toUpperCase();

        const day = d.toLocaleDateString("pl-PL", { day: "2-digit", timeZone: tz });

        // every next card a little shifted
        const dx = idx * 8;
        const dy = idx * 3;

        return `
         <div class="evt-cal-card" style="transform: translate(${dx}px, ${dy}px)">
           <div class="evt-cal-top">${mon}</div>
           <div class="evt-cal-day">${day}</div>
         </div>
        `;
      })
      .join("");

      const badge =
       uniqueDays.length > 1
       ? `<div class="evt-cal-badge">${more > 0 ? `+${more}` : uniqueDays.length}</div>`
       : "";

      el.innerHTML = `
       ${badge}
       ${cardsHtml}
      `;
      
      el.title = events.length > 1 
       ? `${first.city}: ${events.length} events`
       : `${first.city} - ${first.place} - ${first.title}`;

      el.addEventListener("click", () => {
        onMarkerClick?.(first.id);

      popupRef.current?.remove();

      const listHtml = events
      .map((e) => {
        const tSt = new Date(e.startAt).toLocaleTimeString("en-us", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        });
        const link = e.sourceUrl
          ? ` <a href="${e.sourceUrl}" target="_blank" rel="noreferrer">link</a>`
          : "";
        return `<div style="margin-top:6px"><strong>${tSt}</strong>   ${escapeHtml(e.title)}${link}</div>`;
      })
      .join("");

      popupRef.current = new maplibregl.Popup({ offset: 16 })
          .setLngLat([first.lng, first.lat])
          .setHTML(
            `<div style="min-width:260px">
              <strong>${escapeHtml(first.city)}</strong>
              <div style="opacity:.8;margin-top:4px">${events.length} events</div>
              <div style="margin-top:8px">${listHtml}</div>
            </div>`             
          )
          .addTo(map);

        map.easeTo({ center: [first.lng, first.lat], zoom: Math.max(map.getZoom(), 15) });
      });

      // MapLibre Marker
      new maplibregl.Marker({ element: el,
                              anchor: "bottom",
                              offset: [0, -16] // draw marker a bit higher than city
                            })
      .setLngLat([first.lng, first.lat])
      .addTo(map);
    });
  }, [items, onMarkerClick]);

  // Focus on eventId (for example, clicked in calendar)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusId) return;
    const e = items.find((x) => x.id === focusId);
    if (!e) return;

    const evDate = new Date(e.startAt).toLocaleDateString("pl-pl");

    const start = new Date(e.startAt);
    const startTime = start.toLocaleTimeString("pl-pl", {hour: "2-digit", minute: "2-digit", timeZone:"UTC"});

    const end = e.endAt ? new Date(e.endAt) : null;
    const endTime = end 
     ? end.toLocaleTimeString("pl-pl", {hour: "2-digit", minute: "2-digit", timeZone:"UTC"})
     : "";

    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ offset: 16 })
      .setLngLat([e.lng, e.lat])
      .setHTML(
        `<div style="min-width:220px">
          <strong>${escapeHtml(e.title)}</strong>
          <div>${escapeHtml(e.city)}${e.place ? "   " + escapeHtml(e.place) : ""}</div>
          <div style="opacity:.8;margin-top:6px">${evDate} ${startTime} - ${endTime} </div>
        </div>`
      )
      .addTo(map);

    map.easeTo({ center: [e.lng, e.lat], zoom: Math.max(map.getZoom(), 10) });
  }, [focusId, items]);

  return <div className="map" ref={containerRef} />;
}

// HTML protect?
function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
