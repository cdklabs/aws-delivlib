// tslint:disable-next-line:no-var-requires
const ical = require('node-ical');

/**
 * A calendar event describing a "blocked" time window.
 */
interface CalendarEvent {
  /** The description of the event */
  summary: string;
  /** The time at which the block starts */
  start: Date;
  /** The time at which the block ends */
  end: Date;
  /** The time at which the event was last modified. */
  dtstamp: Date;
  type: 'VEVENT';
  params: any[];
  datetype: 'date-time';
}
type Events = { [uuid: string]: CalendarEvent };

/**
 * Evaluates whether a deployment pipeline should have promotions suspended due to the imminent start of a blocked
 * time window.
 *
 * @param ical is an iCal document that describes "blocked" time windows (there needs to be an event only for times
 *             during which promotions should not happen).
 * @param now  is the reference time considered when assessing the need to block or not.
 * @param advanceMarginSec is the padding applied before events (defaults to 1 hour).
 *
 * @returns the events that represent the blocked time, or `undefined` if `now` is not "blocked".
 */
export function shouldBlockPipeline(icalData: string | Buffer, now: Date, advanceMarginSec = 3600): CalendarEvent | undefined {
  const events = ical.parseICS(icalData.toString('utf8'));
  const blocks = containingEventsWithMargin(events, now, advanceMarginSec);
  return blocks.size > 0 ? Array.from(blocks)[0] : undefined;
}

function containingEventsWithMargin(events: Events, date: Date, advanceMarginSec: number): Set<CalendarEvent> {
  const now = containingEvents(events, date);
  const upcomingEvents = containingEvents(events, new Date(date.getTime() + advanceMarginSec));

  for (const e of upcomingEvents) {
    now.add(e);
  }

  return now;
}

function containingEvents(events: Events, date: Date): Set<CalendarEvent> {
  return new Set<CalendarEvent>(Object.values(events).filter(e => isInCalendarEvent(e, date)));
}

function isInCalendarEvent(event: CalendarEvent, x: Date) {
  return isInDateRange(event.start, event.end, x);
}

function isInDateRange(start: Date, end: Date, x: Date) {
  return x >= start && x <= end;
}
