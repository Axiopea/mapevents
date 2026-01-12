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
      zoom: 5.5,
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

    items.forEach((e) => {
      const el = document.createElement("button");
      el.className = "evt-marker";
      el.title = e.title;
      el.type = "button";
      el.addEventListener("click", () => {
        onMarkerClick?.(e.id);

        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ offset: 16 })
          .setLngLat([e.lng, e.lat])
          .setHTML(
            `<div style="min-width:220px">
              <strong>${escapeHtml(e.title)}</strong>
              <div>${escapeHtml(e.city)}${e.place ? "   " + escapeHtml(e.place) : ""}</div>
              <div style="opacity:.8;margin-top:6px">${new Date(e.startAt).toLocaleString("pl-PL")}</div>
              ${
                e.sourceUrl
                  ? `<div style="margin-top:8px"><a href="${e.sourceUrl}" target="_blank" rel="noreferrer">Link</a></div>`
                  : ""
              }
            </div>`
          )
          .addTo(map);

        map.easeTo({ center: [e.lng, e.lat], zoom: Math.max(map.getZoom(), 10) });
      });

      // MapLibre Marker
      new maplibregl.Marker({ element: el }).setLngLat([e.lng, e.lat]).addTo(map);
    });
  }, [items, onMarkerClick]);

  // Focus on eventId (for example, clicked in calendar)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusId) return;
    const e = items.find((x) => x.id === focusId);
    if (!e) return;

    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ offset: 16 })
      .setLngLat([e.lng, e.lat])
      .setHTML(
        `<div style="min-width:220px">
          <strong>${escapeHtml(e.title)}</strong>
          <div>${escapeHtml(e.city)}${e.place ? "   " + escapeHtml(e.place) : ""}</div>
          <div style="opacity:.8;margin-top:6px">${new Date(e.startAt).toLocaleString("pl-PL")}</div>
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
