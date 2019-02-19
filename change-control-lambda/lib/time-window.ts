// tslint:disable-next-line:no-var-requires
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

function containingEventsWithMargin(events: Events, date: Date, advanceMarginSec: number): CalendarEvent[] {
  const bufferedDate = new Date(date.getTime() + advanceMarginSec * 1_000);
  return Object.values(events)
    // .filter(e => e.type === 'VEVENT')
    .filter(e => {
      const result = overlaps(e, { start: date, end: bufferedDate });
      // tslint:disable:no-console
      console.log('##########');
      console.log(`Event:    ${e.start.toUTCString()} ==> ${e.end.toUTCString()} (${e.type} - ${e.type === 'VEVENT'} - ${e.summary})`);
      console.log(`Window:   ${date.toUTCString()} ==> ${bufferedDate.toUTCString()}`);
      console.log(`Overlaps: ${result ? 'YES' : 'NOPE'}`);
      // tslint:enable:no-console
      return result;
    });
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
function overlaps(left: { start: Date, end: Date }, right: { start: Date, end: Date }): boolean {
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
