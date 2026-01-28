"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Popup } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { EventItem } from "./types";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = {
  items: EventItem[];
  focusId?: string | null;
  onMarkerClick?: (id: string) => void;
  /** Enables admin-only UI: add event + approve/reject controls */
  admin?: boolean;

  onEventDeleted?: (id: string) => void;
  onEventStatusChanged?: (id: string, status: "approved" | "rejected") => void;
  onEventEdited?: (
    id: string,
    patch: { title?: string; place?: string | null; startAt?: string; endAt?: string | null }
  ) => void;
};

const GROUP_UNTIL_ZOOM = 11;

function groupByCity(items: EventItem[]) {
  const map = new Map<string, EventItem[]>();
  for (const e of items) {
    const key = `${e.city}`;
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([key, events]) => {
    events.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return { key, events };
  });
}

/** Group events by identical coordinates (strict match). */
function groupByLngLat(items: EventItem[]) {
  const map = new Map<string, EventItem[]>();
  for (const e of items) {
    const key = `${e.lng}:${e.lat}`;
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([key, events]) => {
    events.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return { key, events };
  });
}

type ActivePopup =
  | { kind: "single"; id: string }
  | { kind: "group"; city: string; lng: number; lat: number }
  | { kind: "edit"; id: string }
  | null;

export default function MapPanel({
  items,
  focusId,
  onMarkerClick,
  admin = false,
  onEventDeleted,
  onEventStatusChanged,
  onEventEdited,
}: Props) {
  const mapRef = useRef<MLMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<Popup | null>(null);

  // Markers
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [zoomTick, setZoomTick] = useState(0);

  // Admin add-mode
  const [addMode, setAddMode] = useState(false);
  const draftMarkerRef = useRef<maplibregl.Marker | null>(null);
  const draftLngLatRef = useRef<{ lng: number; lat: number } | null>(null);

  // Popup event listeners cleanup
  const popupListenersAbortRef = useRef<AbortController | null>(null);

  // Keep popup "context" stable across updates (delete/approve/reject/edit)
  const activePopupRef = useRef<ActivePopup>(null);

  const addModeRef = useRef(false);
  useEffect(() => {
    addModeRef.current = addMode;
  }, [addMode]);

  useEffect(() => {
    if (!admin) setAddMode(false);
  }, [admin]);

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
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    }),
    []
  );

  function clearPopupListeners() {
    popupListenersAbortRef.current?.abort();
    popupListenersAbortRef.current = new AbortController();
  }

  function closePopup() {
    clearPopupListeners();
    popupRef.current?.remove();
    popupRef.current = null;
  }

  function renderGroupPopup(map: MLMap, anchor: { lng: number; lat: number }, city: string, events: EventItem[]) {
    clearPopupListeners();
    closePopup();

    const listHtml = events
      .map((e) => {
        const d = new Date(e.startAt);

        // In the group list we show BOTH date and time (previously only time)
        const dSt = d.toLocaleDateString("pl-PL", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone: "UTC",
        });

        const tSt = d.toLocaleTimeString("en-us", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        });

        const link = e.sourceUrl ? ` <a href="${e.sourceUrl}" target="_blank" rel="noreferrer">link</a>` : "";
        const st = (e as any).status as string | undefined;
        const canEditRow = admin && (st === "draft" || st === "pending");

        const rowAdminControls = admin
          ? `
            <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
              ${
                canEditRow
                  ? `
                <button data-action="edit" data-id="${e.id}"
                  style="padding:6px 10px;border-radius:10px;border:1px solid #111;background:#fff;font-weight:800;cursor:pointer">
                  Edit
                </button>
              `
                  : ""
              }
              <button data-action="delete" data-id="${e.id}"
                style="padding:6px 10px;border-radius:10px;border:0;background:#111;color:#fff;font-weight:800;cursor:pointer">
                Delete
              </button>
            </div>
          `
          : "";

        const approveRejectControls =
          admin && (st === "draft" || st === "pending")
            ? `
              <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
                <button data-action="approve" data-id="${e.id}"
                  style="padding:6px 10px;border-radius:10px;border:0;background:#16a34a;color:white;font-weight:800;cursor:pointer">
                  Approve
                </button>
                <button data-action="reject" data-id="${e.id}"
                  style="padding:6px 10px;border-radius:10px;border:0;background:#dc2626;color:white;font-weight:800;cursor:pointer">
                  Reject
                </button>
              </div>
            `
            : "";

        return `
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid #eee">
            <div>
              <strong>${dSt} ${tSt}</strong>
              ${escapeHtml(e.title)}
              ${statusBadge(st)}
              ${link}
            </div>
            ${rowAdminControls}
            ${approveRejectControls}
          </div>
        `;
      })
      .join("");

    // Scrollable body (variant 1)
    popupRef.current = new maplibregl.Popup({ offset: 16 })
      .setLngLat([anchor.lng, anchor.lat])
      .setHTML(
        `<div style="width: 340px;max-width: calc(100% - 32px);padding: 12px;border-radius: 12px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
            <div>
              <strong>${escapeHtml(city)}</strong>
              <div style="opacity:.8;margin-top:4px">${events.length} events</div>
            </div>
          </div>

          <div style="
            margin-top:10px;
            max-height: min(55vh, 360px);
            overflow:auto;
            padding-right: 6px;
          ">
            ${listHtml}
          </div>
        </div>`
      )
      .addTo(map);

    // bind actions for buttons
    setTimeout(() => {
      const root = popupRef.current?.getElement();
      if (!root) return;
      const signal = popupListenersAbortRef.current!.signal;

      const onClick = async (ev: MouseEvent) => {
        const target = ev.target as HTMLElement;
        const btn = target.closest("button[data-action][data-id]") as HTMLButtonElement | null;
        if (!btn) return;

        ev.preventDefault();
        ev.stopPropagation();

        if (btn.dataset.busy === "1") return;
        btn.dataset.busy = "1";
        btn.disabled = true;
        btn.style.opacity = "0.6";

        const action = btn.dataset.action!;
        const id = btn.dataset.id!;

        try {
          if (action === "delete") {
            if (!confirm("Delete this event?")) return;

            const r = await fetch(`/api/events/${id}`, { method: "DELETE" });
            if (!r.ok) {
              const txt = await r.text();
              throw new Error(txt || `HTTP ${r.status}`);
            }

            onEventDeleted?.(id);
            // keep the SAME active group context; popup will be re-rendered by the "rehydrate" effect
            return;
          }

          if (action === "approve" || action === "reject") {
            const status = action === "approve" ? "approved" : "rejected";
            const r = await fetch(`/api/events/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status }),
            });
            if (!r.ok) {
              const txt = await r.text();
              throw new Error(txt || `HTTP ${r.status}`);
            }

            onEventStatusChanged?.(id, status);
            return;
          }

          if (action === "edit") {
            const evObj = items.find((x) => x.id === id);
            if (evObj) {
              activePopupRef.current = { kind: "edit", id };
              openEditPopup(map, evObj, false);
            }
            return;
          }
        } finally {
          btn.dataset.busy = "0";
          btn.disabled = false;
          btn.style.opacity = "1";
        }
      };

      root.addEventListener("click", onClick, { signal });
    }, 0);
  }

  function renderSinglePopup(map: MLMap, e: EventItem, doEase: boolean) {
    clearPopupListeners();
    closePopup();

    const evDate = new Date(e.startAt).toLocaleDateString("pl-pl", { timeZone: "UTC" });

    const start = new Date(e.startAt);
    const startTime = start.toLocaleTimeString("pl-pl", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });

    const end = e.endAt ? new Date(e.endAt) : null;
    const endTime = end
      ? end.toLocaleTimeString("pl-pl", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
      : "";

    const st = (e as any).status as string | undefined;
    const canEdit = admin && (st === "draft" || st === "pending");

    const controls =
      admin && (st === "draft" || st === "pending")
        ? `
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
            <button data-action="approve" data-id="${e.id}"
              style="padding:6px 10px;border-radius:10px;border:0;background:#16a34a;color:white;font-weight:800;cursor:pointer">
              Approve
            </button>
            <button data-action="reject" data-id="${e.id}"
              style="padding:6px 10px;border-radius:10px;border:0;background:#dc2626;color:white;font-weight:800;cursor:pointer">
              Reject
            </button>
          </div>
        `
        : "";

    const editDeleteControls = admin
      ? `
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          ${
            canEdit
              ? `
            <button data-action="edit" data-id="${e.id}"
              style="padding:6px 10px;border-radius:10px;border:1px solid #111;background:#fff;font-weight:800;cursor:pointer">
              Edit
            </button>
          `
              : ""
          }
          <button data-action="delete" data-id="${e.id}"
            style="padding:6px 10px;border-radius:10px;border:0;background:#111;color:#fff;font-weight:800;cursor:pointer">
            Delete
          </button>
        </div>
      `
      : "";

    popupRef.current = new maplibregl.Popup({ offset: 16 })
      .setLngLat([e.lng, e.lat])
      .setHTML(
        `<div style="width: 320px;max-width: calc(100% - 32px);padding: 12px;border-radius: 12px;">
          <div style="display:flex;align-items:center;gap:8px">
            <strong>${escapeHtml(e.title)}</strong>
            ${statusBadge(st)}
          </div>
          <div style="margin-top:4px">${escapeHtml(e.city)}${e.place ? " · " + escapeHtml(e.place) : ""}</div>
          <div style="opacity:.8;margin-top:6px">${evDate} ${startTime}${endTime ? " - " + endTime : ""}</div>
          ${editDeleteControls}
          ${controls}
        </div>`
      )
      .addTo(map);

    setTimeout(() => {
      const root = popupRef.current?.getElement();
      if (!root) return;
      const signal = popupListenersAbortRef.current!.signal;

      const onClick = async (ev: MouseEvent) => {
        const target = ev.target as HTMLElement;
        const btn = target.closest("button[data-action][data-id]") as HTMLButtonElement | null;
        if (!btn) return;

        ev.preventDefault();
        ev.stopPropagation();

        if (btn.dataset.busy === "1") return;
        btn.dataset.busy = "1";
        btn.disabled = true;
        btn.style.opacity = "0.6";

        const action = btn.dataset.action!;
        const id = btn.dataset.id!;

        try {
          if (action === "delete") {
            if (!confirm("Delete this event?")) return;

            const r = await fetch(`/api/events/${id}`, { method: "DELETE" });
            if (!r.ok) {
              const txt = await r.text();
              throw new Error(txt || `HTTP ${r.status}`);
            }

            onEventDeleted?.(id);
            return;
          }

          if (action === "approve" || action === "reject") {
            const status = action === "approve" ? "approved" : "rejected";
            const r = await fetch(`/api/events/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status }),
            });
            if (!r.ok) {
              const txt = await r.text();
              throw new Error(txt || `HTTP ${r.status}`);
            }

            onEventStatusChanged?.(id, status);
            return;
          }

          if (action === "edit") {
            const evObj = items.find((x) => x.id === id);
            if (evObj) {
              activePopupRef.current = { kind: "edit", id };
              openEditPopup(map, evObj, false);
            }
            return;
          }
        } finally {
          btn.dataset.busy = "0";
          btn.disabled = false;
          btn.style.opacity = "1";
        }
      };

      root.addEventListener("click", onClick, { signal });
    }, 0);

    if (doEase) {
      map.easeTo({ center: [e.lng, e.lat], zoom: Math.max(map.getZoom(), 15) });
    }
  }

  function toLocalInputValue(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}`;
  }

  function openEditPopup(map: MLMap, e: EventItem, doEase: boolean) {
    clearPopupListeners();
    closePopup();

    const startVal = toLocalInputValue(e.startAt);
    const endVal = e.endAt ? toLocalInputValue(e.endAt) : "";

    popupRef.current = new maplibregl.Popup({ offset: 16, closeOnClick: false })
      .setLngLat([e.lng, e.lat])
      .setHTML(`
        <div style="width: 320px;max-width: calc(100% - 32px);padding: 12px;border-radius: 12px;">
          <div style="font-weight:800;margin-bottom:8px">Edit event</div>

          <form id="evt-edit-form" style="display:flex;flex-direction:column;gap:8px">
            <input name="title" placeholder="Title" required
              value="${escapeHtml(e.title)}"
              style="width: 100%;box-sizing: border-box;padding:8px;border:1px solid #ddd;border-radius:8px"/>

            <input name="place" placeholder="Place (optional)"
              value="${escapeHtml(e.place || "")}"
              style="width: 100%;box-sizing: border-box;padding:8px;border:1px solid #ddd;border-radius:8px"/>

            <label style="font-size:12px;opacity:.8">Start</label>
            <input name="startAt" type="datetime-local" required
              value="${escapeHtml(startVal)}"
              style="width: 100%;box-sizing: border-box;padding:8px;border:1px solid #ddd;border-radius:8px"/>

            <label style="font-size:12px;opacity:.8">End (optional)</label>
            <input name="endAt" type="datetime-local"
              value="${escapeHtml(endVal)}"
              style="width: 100%;box-sizing: border-box;padding:8px;border:1px solid #ddd;border-radius:8px"/>

            <div style="display:flex;gap:8px;margin-top:6px">
              <button type="submit"
                style="flex:1;padding:10px;border-radius:10px;border:0;background:#111;color:#fff;font-weight:800;cursor:pointer">
                Save
              </button>
              <button type="button" id="evt-edit-cancel"
                style="flex:1;padding:10px;border-radius:10px;border:1px solid #ddd;background:#fff;font-weight:800;cursor:pointer">
                Cancel
              </button>
            </div>
          </form>

          <div id="evt-edit-err" style="margin-top:8px;color:#b91c1c;font-size:12px"></div>
        </div>
      `)
      .addTo(map);

    setTimeout(() => {
      const root = popupRef.current?.getElement();
      if (!root) return;

      const form = root.querySelector("#evt-edit-form") as HTMLFormElement | null;
      const btnCancel = root.querySelector("#evt-edit-cancel") as HTMLButtonElement | null;
      const errBox = root.querySelector("#evt-edit-err") as HTMLDivElement | null;

      btnCancel?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        // return to single popup, and keep it stable (no jump)
        activePopupRef.current = { kind: "single", id: e.id };
        const latest = items.find((x) => x.id === e.id) ?? e;
        renderSinglePopup(map, latest, false);
      });

      form?.addEventListener("submit", async (ev) => {
        ev.preventDefault();

        const fd = new FormData(form);
        const title = String(fd.get("title") || "");
        const place = String(fd.get("place") || "");
        const startAtLocal = String(fd.get("startAt") || "");
        const endAtLocal = String(fd.get("endAt") || "");

        if (!startAtLocal) {
          if (errBox) errBox.textContent = "Start date/time is required";
          return;
        }

        const startMs = Date.parse(startAtLocal);
        if (Number.isNaN(startMs)) {
          if (errBox) errBox.textContent = "Start date/time is invalid";
          return;
        }

        if (endAtLocal) {
          const endMs = Date.parse(endAtLocal);
          if (Number.isNaN(endMs)) {
            if (errBox) errBox.textContent = "End date/time is invalid";
            return;
          }
          if (endMs <= startMs) {
            if (errBox) errBox.textContent = "End must be after Start";
            return;
          }
        }

        const startIso = new Date(startAtLocal).toISOString();
        const endIso = endAtLocal ? new Date(endAtLocal).toISOString() : null;

        try {
          if (errBox) errBox.textContent = "";

          const r = await fetch(`/api/events/${e.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              place: place || null,
              startAt: startIso,
              endAt: endIso,
            }),
          });

          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            throw new Error(j?.error || `HTTP ${r.status}`);
          }

          onEventEdited?.(e.id, {
            title,
            place: place || null,
            startAt: startIso,
            endAt: endIso,
          });

          // Keep context on the same event after edit
          activePopupRef.current = { kind: "single", id: e.id };
          // popup will also be rehydrated by effect, but we can show immediately
          const updated: EventItem = { ...e, title, place: place || null, startAt: startIso, endAt: endIso };
          renderSinglePopup(map, updated, false);
        } catch (e2) {
          console.error(e2);
          if (errBox) errBox.textContent = String((e2 as any)?.message || e2);
        }
      });
    }, 0);

    if (doEase) {
      map.easeTo({ center: [e.lng, e.lat], zoom: Math.max(map.getZoom(), 15) });
    }
  }

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [19.4, 52.1],
      zoom: 6,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    mapRef.current = map;

    const onZoomEnd = () => setZoomTick((t) => t + 1);
    map.on("zoomend", onZoomEnd);

    map.on("click", (ev) => {
      if (!admin) return;
      if (!addModeRef.current) return;

      const { lng, lat } = ev.lngLat;
      draftLngLatRef.current = { lng, lat };

      draftMarkerRef.current?.remove();
      closePopup();

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

      const html = `
        <div style="width: 320px;max-width: calc(100% - 32px);padding: 12px;border-radius: 12px;">
          <div style="font-weight:800;margin-bottom:8px">New event</div>
          <form id="evt-form" style="display:flex;flex-direction:column;gap:8px">
            <input name="title" placeholder="Title" required style="width: 100%;box-sizing: border-box;padding:8px;border:1px solid #ddd;border-radius:8px"/>
            <input name="city" placeholder="City" required style="width: 100%;box-sizing: border-box;padding:8px;border:1px solid #ddd;border-radius:8px"/>
            <input name="place" placeholder="Place (optional)" style="width: 100%;box-sizing: border-box;padding:8px;border:1px solid #ddd;border-radius:8px"/>
            <label style="font-size:12px;opacity:.8">Start</label>
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
          closePopup();
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

          const startIso = new Date(startAtLocal).toISOString();
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

            closePopup();
            draftMarkerRef.current?.remove();
            draftMarkerRef.current = null;
            draftLngLatRef.current = null;

            window.location.reload();
          } catch (err: any) {
            if (errBox) errBox.textContent = err?.message || "Failed to save";
          }
        });
      }, 0);
    });

    return () => {
      clearPopupListeners();
      closePopup();

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;

      map.off("zoomend", onZoomEnd);
      map.remove();
      mapRef.current = null;
    };
  }, [style, admin]);

  // Draw markers (group by city at low zoom; by exact coords at close zoom)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const z = map.getZoom();
    const groups = z > GROUP_UNTIL_ZOOM ? groupByLngLat(items) : groupByCity(items);

    groups.forEach(({ events }) => {
      const first = events[0];
      if (!first) return;

      const el = document.createElement("button");
      el.className = "evt-cal-stack";
      el.type = "button";

      const tz = "UTC";
      const uniqueDays: string[] = [];
      const dayToEvent: EventItem[] = [];

      for (const ev of events) {
        const dayKey = new Date(ev.startAt).toLocaleDateString("en-us", { timeZone: tz });
        if (!uniqueDays.includes(dayKey)) {
          uniqueDays.push(dayKey);
          dayToEvent.push(ev);
        }
      }

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

      el.innerHTML = `${badge}${cardsHtml}`;

      el.title =
        events.length > 1 ? `${first.city}: ${events.length} events` : `${first.city} - ${first.place} - ${first.title}`;

      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const zNow = map.getZoom();

        // single
        if (events.length === 1) {
          activePopupRef.current = { kind: "single", id: first.id };
          onMarkerClick?.(first.id);
          renderSinglePopup(map, first, true);
          return;
        }

        // group
        activePopupRef.current = { kind: "group", city: first.city, lng: first.lng, lat: first.lat };

        // When zoomed-in we group by coords strictly; when zoomed-out by city.
        // For the initial open, use "current" events from this marker (already matches grouping)
        // and DO NOT "search" again to avoid any mismatch.
        renderGroupPopup(map, { lng: first.lng, lat: first.lat }, first.city, [...events]);

        // ease only on initial open (never on rehydrate)
        map.easeTo({ center: [first.lng, first.lat], zoom: Math.max(zNow, 15) });
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: "bottom",
        offset: [0, -16],
      })
        .setLngLat([first.lng, first.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [items, zoomTick]);

  // Rehydrate popup after ANY items update (delete/approve/reject/edit) without "jumping"
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const active = activePopupRef.current;
    if (!active) return;

    if (active.kind === "single") {
      const e = items.find((x) => x.id === active.id);
      if (!e) {
        activePopupRef.current = null;
        closePopup();
        return;
      }
      renderSinglePopup(map, e, false);
      return;
    }

    if (active.kind === "edit") {
      const e = items.find((x) => x.id === active.id);
      if (!e) {
        activePopupRef.current = null;
        closePopup();
        return;
      }
      openEditPopup(map, e, false);
      return;
    }

    if (active.kind === "group") {
      const z = map.getZoom();

      // Keep anchor stable at the originally clicked point
      const anchor = { lng: active.lng, lat: active.lat };

      // Decide what the "group" means at current zoom
      const nextEvents =
        z > GROUP_UNTIL_ZOOM
          ? items.filter((e) => e.lng === active.lng && e.lat === active.lat)
          : items.filter((e) => e.city === active.city);

      nextEvents.sort((a, b) => a.startAt.localeCompare(b.startAt));

      if (nextEvents.length === 0) {
        activePopupRef.current = null;
        closePopup();
        return;
      }

      if (nextEvents.length === 1) {
        // group collapsed into single — keep user on this location, no jump
        activePopupRef.current = { kind: "single", id: nextEvents[0].id };
        renderSinglePopup(map, nextEvents[0], false);
        return;
      }

      // still a group — rerender it, no easeTo
      renderGroupPopup(map, anchor, active.city, nextEvents);
    }
  }, [items, zoomTick]);

  // Focus from outside (calendar click)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusId) return;

    const e = items.find((x) => x.id === focusId);
    if (!e) return;

    activePopupRef.current = { kind: "single", id: e.id };
    renderSinglePopup(map, e, true);
  }, [focusId, items]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div className="map" ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {admin && (
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
      )}
    </div>
  );
}

// HTML escape
function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusBadge(status?: string | null) {
  if (!status || status === "approved") return "";
  const color =
    status === "draft"
      ? "#f59e0b"
      : status === "pending"
      ? "#3b82f6"
      : status === "rejected"
      ? "#ef4444"
      : "#111";

  return `<span style="
    display:inline-block;
    font-size:12px;
    font-weight:800;
    padding:2px 8px;
    border-radius:999px;
    background:${color};
    color:white;
    margin-left:8px;
  ">${escapeHtml(status)}</span>`;
}
