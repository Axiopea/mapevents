"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { DatesSetArg, EventContentArg, EventMountArg } from "@fullcalendar/core";
import type { EventItem, DateRange } from "./types";
import { toFullCalendarEvents } from "./utils";

type Props = {
  items: EventItem[];
  onRangeChange: (range: DateRange) => void;
  onEventFocus: (id: string) => void;
};

function formatDateTimeRange(arg: EventContentArg) {
  const start = arg.event.start;
  const end = arg.event.end;

  if (!start) return "";

  // Date + time start
  const dateStr = start.toLocaleDateString("en-us", { year: "numeric", month: "2-digit", day: "2-digit" });
  const startTime = start.toLocaleTimeString("pl-pl", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

  // No end - show only time start
  if (!end) return `${dateStr} ${startTime}`;

  const endTime = end.toLocaleTimeString("pl-pl", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${startTime} ${endTime}`;
}

export default function CalendarPanel({ items, onRangeChange, onEventFocus }: Props) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      timeZone="UTC"
      initialView="dayGridMonth"
      /**
       * Prevent the whole calendar from growing when a day contains many events.
       * The calendar is inside a flex panel with fixed height, so we let FullCalendar
       * fit itself to the available space.
       */
      height="100%"
      expandRows
      /**
       * Show at most 3 events inside a day cell (month view).
       * FullCalendar will render a “+X more” link / popover for the rest.
       */
      dayMaxEvents={3}
      dayMaxEventRows={3}
      firstDay={1}
      locale="en"
      headerToolbar={{
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,listWeek",
      }}
      events={toFullCalendarEvents(items)}
      eventDidMount={(info: EventMountArg) => {
        const ep: any = info.event.extendedProps;

        const city = ep?.city ?? "";
        const place = ep?.place ?? "";
        const title = ep?.title ?? info.event.title ?? "";
        const url = ep?.sourceUrl ?? info.event.url ?? "";

        info.el.setAttribute("title", `${city} ${place} ${title}${url ? `\n${url}` : ""}`);
      }}
      datesSet={(arg: DatesSetArg) => {
        onRangeChange({ from: arg.start.toISOString(), to: arg.end.toISOString() });
      }}
      eventClick={(info) => {
        // focus on map, link in popup
        info.jsEvent.preventDefault();
        onEventFocus(info.event.id);
      }}
      eventContent={(arg) => {
        // we draw start/end time
        const when = formatDateTimeRange(arg);

        const ep: any = arg.event.extendedProps;
        const hasUrl = !!ep?.sourceUrl;

        return (
          <div style={{ maxWidth: "100%", overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "baseline", minWidth: 0 }}>
              <span
                style={{
                  fontSize: 12,
                  opacity: 0.8,
                  whiteSpace: "nowrap",
                  flex: "0 0 auto",
                }}
              >
                {when}
              </span>
              <span
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                  flex: "1 1 auto",
                }}
              >
                {arg.event.title}
                {hasUrl ? <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.75 }}>🔗</span> : null}
              </span>
            </div>
          </div>
        );
      }}
    />
  );
}
