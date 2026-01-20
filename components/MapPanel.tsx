"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    // const key = `${e.city}__${e.lat.toFixed(4)}__${e.lng.toFixed(4)}`; //key by city + coordinates
    // key by city 
    const key = `${e.city}`;
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

  const [addMode, setAddMode] = useState(false);
  const draftMarkerRef = useRef<maplibregl.Marker | null>(null);
  const draftLngLatRef = useRef<{ lng: number; lat: number } | null>(null);

  const addModeRef = useRef(false);
  useEffect(() => { addModeRef.current = addMode; }, [addMode]);

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

    map.on("click", (ev) => {
      if (!addModeRef.current) return;

      const { lng, lat } = ev.lngLat;
      draftLngLatRef.current = { lng, lat };

      // убираем старый черновик
      draftMarkerRef.current?.remove();
      popupRef.current?.remove();

      // маленький маркер для "черновика"
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "999px";
      el.style.background = "#2563eb";
      el.style.border = "2px solid #fff";
      el.style.boxShadow = "0 6px 20px rgba(0,0,0,.25)";

      draftMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(map);

      // popup с формой
      const html = `
        <div style="width: 320px;max-width: calc(100% - 32px);padding: 12px;border-radius: 12px;">
          <div style="font-weight:800;margin-bottom:8px">New event</div>
          <form id="evt-form" style="display:flex;flex-direction:column;gap:8px">
            <input name="title" placeholder="Title" required style="width: 100%;box-sizing: border-box;padding:8px;border:1px solid #ddd;border-radius:8px"/>
            <input name="city" placeholder="City" required style="width: 100%;box-sizing: border-box;padding:8px;border:1px solid #ddd;border-radius:8px"/>
            <input name="place" placeholder="Place (optional)" style="width: 100%;box-sizing: border-box;padding:8px;border:1px solid #ddd;border-radius:8px"/>
            <label style="font-size:12px;opacity:.8">Start (UTC ISO or local)</label>
            <input name="startAt" type="datetime-local" required style="width: 100%;box-sizing: border-box;padding:8px;border:1px solid #ddd;border-radius:8px"/>
            <label style="font-size:12px;opacity:.8">End (optional)</label>
            <input name="endAt" type="datetime-local" style="width: 100%;box-sizing: border-box;padding:8px;border:1px solid #ddd;border-radius:8px"/>
            <input name="sourceUrl" placeholder="URL (optional)" style="width: 100%;box-sizing: border-box;padding:8px;border:1px solid #ddd;border-radius:8px"/>
            <button type="submit" style="padding:10px;border-radius:10px;border:0;background:#111;color:#fff;font-weight:800;cursor:pointer">
              Save
            </button>
            <button type="button" id="evt-cancel" style="padding:10px;border-radius:10px;border:1px solid #ddd;background:#fff;font-weight:800;cursor:pointer">
              Close
            </button>
          </form>
          <div id="evt-err" style="margin-top:8px;color:#b91c1c;font-size:12px"></div>
        </div>
      `;

      popupRef.current = new maplibregl.Popup({ offset: 14, closeOnClick: false })
        .setLngLat([lng, lat])
        .setHTML(html)
        .addTo(map);

      setTimeout(() => {
        const root = popupRef.current?.getElement();
        if (!root) return;

        const inputCity = root.querySelector('input[name="city"]') as HTMLInputElement | null;
        const inputPlace = root.querySelector('input[name="place"]') as HTMLInputElement | null;

        (async () => {
          try {
            if (!draftLngLatRef.current) return;

            const { lat, lng } = draftLngLatRef.current;

            const r = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
            if (!r.ok) return;
            const j = await r.json();

            if (inputCity && !inputCity.value && j.city) inputCity.value = j.city;
            if (inputPlace && !inputPlace.value && j.place) inputPlace.value = j.place;
          } catch {}
        })();

        const form = root.querySelector("#evt-form") as HTMLFormElement | null;
        const btnCancel = root.querySelector("#evt-cancel") as HTMLButtonElement | null;
        const errBox = root.querySelector("#evt-err") as HTMLDivElement | null;

        btnCancel?.addEventListener("click", () => {
          popupRef.current?.remove();
          draftMarkerRef.current?.remove();
          draftMarkerRef.current = null;
          draftLngLatRef.current = null;
        });

        form?.addEventListener("submit", async (e) => {
          e.preventDefault();
          if (!draftLngLatRef.current) return;

          const fd = new FormData(form);
          const title = String(fd.get("title") || "");
          const city = String(fd.get("city") || "");
          const place = String(fd.get("place") || "");
          const startAtLocal = String(fd.get("startAt") || "");
          const endAtLocal = String(fd.get("endAt") || "");
          const sourceUrl = String(fd.get("sourceUrl") || "");

          if (!startAtLocal) {
            errBox && (errBox.textContent = "Start date/time is required");
            return;
          }

          const startMs = Date.parse(startAtLocal);
          if (Number.isNaN(startMs)) {
            errBox && (errBox.textContent = "Start date/time is invalid");
            return;
          }

          if (endAtLocal) {
            const endMs = Date.parse(endAtLocal);
            if (Number.isNaN(endMs)) {
              errBox && (errBox.textContent = "End date/time is invalid");
              return;
            }
            if (endMs <= startMs) {
              errBox && (errBox.textContent = "End must be after Start");
              return;
            }
          }

          // datetime-local -> ISO (важно!)
          // interpret as local time on client and convert to ISO
          const startIso = startAtLocal ? new Date(startAtLocal).toISOString() : "";
          const endIso = endAtLocal ? new Date(endAtLocal).toISOString() : null;

          try {
            errBox && (errBox.textContent = "");

            const res = await fetch("/api/events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title,
                city,
                place: place || null,
                startAt: startIso,
                endAt: endIso,
                lat: draftLngLatRef.current.lat,
                lng: draftLngLatRef.current.lng,
                sourceUrl: sourceUrl || null,
              }),
            });

            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              throw new Error(j?.error || `HTTP ${res.status}`);
            }

            // закрыть popup/маркер и обновить страницу (MVP)
            popupRef.current?.remove();
            draftMarkerRef.current?.remove();
            draftMarkerRef.current = null;
            draftLngLatRef.current = null;

            // самый простой рефреш данных
            window.location.reload();
          } catch (err: any) {
            if (errBox) errBox.textContent = err?.message || "Failed to save";
          }
        });
      }, 0);
    });


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

    const oldGrp = document.querySelectorAll(".evt-cal-stack");
    oldGrp.forEach((n) => n.remove());

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
            `<div style="width: 320px;max-width: calc(100% - 32px);padding: 12px;border-radius: 12px;">
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
  
  return <div style={{ position: "relative", width: "100%", height: "100%" }}>
  <div className="map" ref={containerRef} style={{ position: "absolute", inset: 0 }} />

  <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, display: "flex", gap: 8 }}>
    <button
      onClick={() => setAddMode((v) => !v)}
      style={{
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid #ddd",
        background: addMode ? "#111" : "#fff",
        color: addMode ? "#fff" : "#111",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {addMode ? "Cancel" : "+ Add event"}
    </button>
  </div>
</div>

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
