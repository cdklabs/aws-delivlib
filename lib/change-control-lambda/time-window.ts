// eslint-disable-next-line import/no-extraneous-dependencies
import { RRule } from 'rrule';
// eslint-disable-next-line @typescript-eslint/no-require-imports,import/no-extraneous-dependencies
const ical = require('node-ical');

/**
 * A calendar event describing a "blocked" time window.
 */
export interface CalendarEvent {
  /** The description of the event */
  summary: string;
  /** The time at which the block starts */
  start: Date;
  /** The time at which the block ends */
  end: Date;
  /** The time at which the event was last modified. */
  dtstamp?: Date;
  /** The type of a calendar event */
  type: 'VEVENT' | string;
  /** Parameters to the event, if any. */
  params?: any[];
  /** The type of the boundaries for the event */
  datetype: 'date-time';
  /** A recurrence rule for the event. */
  rrule?: RRule;
}
type Events = { [uuid: string]: CalendarEvent };

/**
 * Evaluates whether a deployment pipeline should have promotions suspended due to the imminent start of a blocked
 * time window.
 *
 * @param ical is an iCal document that describes "blocked" time windows (there needs to be an event only for times
 *             during which promotions should not happen).
 * @param now  is the reference time considered when assessing the need to block or not.
 * @param advanceMarginSec how many seconds from `now` should be free of any "blocked" time window for the pipeline to
 *             not be blocked (defaults to 1 hour).
 *
 * @returns the events that represent the blocked time, or `undefined` if `now` is not "blocked".
 */
export function shouldBlockPipeline(icalData: string | Buffer, now = new Date(), advanceMarginSec = 3600): CalendarEvent | undefined {
  const events: Events = ical.parseICS(icalData.toString('utf8'));
  const blocks = containingEventsWithMargin(events, now, advanceMarginSec);
  return blocks.length > 0 ? blocks[0] : undefined;
}

/**
 * A function to build a CalendarEvent given a start date and a duration.
 *
 * @param start a start date for the event
 * @param duration a duration for the event in milliseconds
 * @param summary a summary to apply to the event
 */
function buildEventForDuration(start: Date, duration: number, summary: string): CalendarEvent {
  const end = new Date(start.getTime() + duration);
  return {
    summary,
    start,
    end,
    datetype: 'date-time',
    type: 'VEVENT',
  };
}

/**
 * If the event is not recurring (i.e. event.rrule is null or undefined), then
 * the event will be returned.
 *
 * If the event is recurring, this method calculates the recurring events surrounding
 * the provided date. If the date provided is equal to the start of an event,
 * the event for that date and the following event will be returend. If
 * CalendarEvent.rrule is not null, then the event is considered recurring.
 *
 * @param event a calendar event.
 * @param date the date for which the previous and next event should be returned.
 */
function flattenEvent(event: CalendarEvent, date: Date): CalendarEvent[] {
  if (event.rrule) {
    const events: CalendarEvent[] = [];

    // Calculate the duration of initial event in the recurring series.
    const duration = event.end.getTime() - event.start.getTime();

    // Obtain the start date of the most recent event in the series, inclusive of
    // 'date' and calculate a new event based on the duration of the initial.
    const previousEventStart = event.rrule.before(date, true);
    if (previousEventStart) {
      events.push(buildEventForDuration(previousEventStart, duration, event.summary));
    }

    // Obtain the start date of the next event in the series, exclusive of
    // 'date' and calculate a new event based on the duration of the initial.
    const nextEventStart = event.rrule.after(date, false);
    if (nextEventStart) {
      events.push(buildEventForDuration(nextEventStart, duration, event.summary));
    }

    return events;
  } else {
    return [event];
  }
}

function containingEventsWithMargin(events: Events, date: Date, advanceMarginSec: number): CalendarEvent[] {
  const bufferedDate = new Date(date.getTime() + advanceMarginSec * 1_000);

  return Object.values(events)
    .filter(e => e.type === 'VEVENT')
    .reduce((arr, e) => {
      arr.push(...flattenEvent(e, date));
      return arr;
    }, [] as CalendarEvent[])
    .filter(e => overlaps(e, { start: date, end: bufferedDate }));
}

/**
 * Checks whether an event occurs within a specified time period, which should match the following:
 * |------------------<=========LEFT=========>------------------------->
 *                         <WITHIN LEFT>
 *            <OVERLAP AT START>
 *                                      <OVERLAP AT END>
 *               <===COMPLETELY INCLUDES LEFT=====>
 * |------------------<=========LEFT=========>------------------------->
 *
 * @param left  the first time window.
 * @param right the second time window.
 *
 * @returns true if `left` and `right` overlap
 */
function overlaps(left: { start: Date; end: Date }, right: { start: Date; end: Date }): boolean {
  // Neutering out the milliseconds portions, so they don't interfere
  [left.start, left.end, right.start, right.end].forEach(d => d.setMilliseconds(0));

  return isBetween(right.start, left.start, left.end)
    || isBetween(right.end, left.start, left.end)
    || isBetween(left.start, right.start, right.end)
    || isBetween(left.end, right.start, right.end);
}

function isBetween(date: Date, left: Date, right: Date): boolean {
  return date >= left && date <= right;
}
