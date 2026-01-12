"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { DatesSetArg } from "@fullcalendar/core";
import type { EventItem, DateRange } from "./types";
import { toFullCalendarEvents } from "./utils";

type Props = {
  items: EventItem[];
  onRangeChange: (range: DateRange) => void;
  onEventFocus: (id: string) => void;
};

export default function CalendarPanel({ items, onRangeChange, onEventFocus }: Props) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      height="auto"
      firstDay={1}
      locale="en"
      headerToolbar={{
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,listWeek",
      }}
      events={toFullCalendarEvents(items)}
      datesSet={(arg: DatesSetArg) => {
        onRangeChange({ from: arg.start.toISOString(), to: arg.end.toISOString() });
      }}
      eventClick={(info) => {
        // focus on map, link in popup
        info.jsEvent.preventDefault();
        onEventFocus(info.event.id);
      }}
    />
  );
}
