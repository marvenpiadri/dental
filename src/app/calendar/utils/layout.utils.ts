import { CalendarEvent } from '../models/calendar.models';
import { MS_MIN, addDays, eventFirstDay, eventLastDay, diffDays, startOfDay } from './date.utils';

/* ------------------------------------------------------------------ */
/* Horizontal spans: all-day row (week view) and month rows            */
/* ------------------------------------------------------------------ */

export interface SpanSegment {
  event: CalendarEvent;
  /** Zero based column of the first visible day. */
  startCol: number;
  /** Number of columns covered. */
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface SpanLayout {
  segments: SpanSegment[];
  laneCount: number;
}

/** Packs events that span days into lanes so they never overlap inside a row of `days`. */
export function layoutSpans(events: CalendarEvent[], days: Date[]): SpanLayout {
  const n = days.length;
  const first = days[0];
  const last = days[n - 1];

  const candidates = events
    .map((event) => {
      const evFirst = eventFirstDay(event);
      const evLast = eventLastDay(event);
      if (evLast.getTime() < first.getTime() || evFirst.getTime() > last.getTime()) return null;
      const startCol = Math.max(0, diffDays(first, evFirst));
      const endCol = Math.min(n - 1, diffDays(first, evLast));
      return {
        event,
        startCol,
        endCol,
        continuesBefore: evFirst.getTime() < first.getTime(),
        continuesAfter: evLast.getTime() > last.getTime(),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    // longest first, then earliest: gives the tidy "staircase" look
    .sort(
      (a, b) =>
        a.startCol - b.startCol ||
        b.endCol - b.startCol - (a.endCol - a.startCol) ||
        a.event.start.getTime() - b.event.start.getTime(),
    );

  const laneEnds: number[] = [];
  const segments: SpanSegment[] = candidates.map((c) => {
    let lane = laneEnds.findIndex((end) => end < c.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(c.endCol);
    } else {
      laneEnds[lane] = c.endCol;
    }
    return {
      event: c.event,
      startCol: c.startCol,
      span: c.endCol - c.startCol + 1,
      lane,
      continuesBefore: c.continuesBefore,
      continuesAfter: c.continuesAfter,
    };
  });

  return { segments, laneCount: laneEnds.length };
}

/* ------------------------------------------------------------------ */
/* Vertical time grid: one day column                                  */
/* ------------------------------------------------------------------ */

export interface DaySegment {
  event: CalendarEvent;
  startMin: number;
  endMin: number;
  /** End used for layout (short events are given a minimum visual height). */
  visEnd: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface PositionedSegment extends DaySegment {
  col: number;
  cols: number;
}

const MIN_VISUAL_MINUTES = 30;

export function toDaySegment(event: CalendarEvent, day: Date): DaySegment {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const startMin = Math.max(0, (event.start.getTime() - dayStart.getTime()) / MS_MIN);
  const endMin = Math.min(1440, (event.end.getTime() - dayStart.getTime()) / MS_MIN);
  return {
    event,
    startMin,
    endMin,
    visEnd: Math.max(endMin, startMin + MIN_VISUAL_MINUTES),
    continuesBefore: event.start.getTime() < dayStart.getTime(),
    continuesAfter: event.end.getTime() > dayEnd.getTime(),
  };
}

/** Splits overlapping events into side by side columns (Google Calendar style). */
export function layoutDayColumns(segments: DaySegment[]): PositionedSegment[] {
  const sorted = [...segments].sort((a, b) => a.startMin - b.startMin || b.visEnd - a.visEnd);
  const result: PositionedSegment[] = [];

  let cluster: PositionedSegment[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const s of cluster) s.cols = columnEnds.length;
    result.push(...cluster);
    cluster = [];
    columnEnds = [];
    clusterEnd = -1;
  };

  for (const seg of sorted) {
    if (cluster.length && seg.startMin >= clusterEnd) flush();
    let col = columnEnds.findIndex((end) => end <= seg.startMin);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(seg.visEnd);
    } else {
      columnEnds[col] = seg.visEnd;
    }
    clusterEnd = Math.max(clusterEnd, seg.visEnd);
    cluster.push({ ...seg, col, cols: 1 });
  }
  flush();
  return result;
}
