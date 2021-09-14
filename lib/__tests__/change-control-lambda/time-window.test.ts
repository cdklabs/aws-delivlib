import { shouldBlockPipeline } from '../../change-control-lambda/time-window';
// tslint:disable:no-console

const ics = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Events Calendar//iCal4j 1.0//EN

BEGIN:VEVENT
UID:2017-04-12T07:00:00.000Z to 2017-04-19T06:59:59.000Z
DTSTAMP:20190114T161956Z
DTSTART:20170412T070000Z
DTEND:20170419T065959Z
SUMMARY:Block1
END:VEVENT

BEGIN:VEVENT
UID:2017-11-23T08:00:00.000Z to 2017-11-27T08:00:00.000Z
DTSTAMP:20190114T161956Z
DTSTART:20171123T080000Z
DTEND:20171127T080000Z
SUMMARY:Block2
END:VEVENT

BEGIN:VEVENT
UID:2019-02-03T08:00:00.000Z to 2019-02-04T07:59:00.000Z
DTSTAMP:20190114T161956Z
DTSTART:20190203T080000Z
DTEND:20190204T075900Z
SUMMARY:Block3
END:VEVENT

END:VCALENDAR
`;

/**
 * An event with an 'RRULE' property will be recurring. Events following the
 * initial event are calculated based on the RRULE specified and the
 * initial event.
 *
 * https://icalendar.org/iCalendar-RFC-5545/3-3-10-recurrence-rule.html
 *
 * Example:
 *
 * BEGIN:VEVENT
 * RRULE:FREQ=WEEKLY;INTERVAL=1  <--- Weekly recurrence, every 1 week. If we set
 *                                    the INTERVAL=2, it would be every 2 weeks.
 * DTSTART:20200501T220000Z      <--- Start datetime of the initial event in the series.
 * DTEND:20200504T170000Z        <--- End datetime of the initial event in the series.
 * SUMMARY:RecurringBlock1
 * DTSTAMP:20200501T163641Z
 * SEQUENCE:0
 * END:VEVENT
 *
 */
const recurringIcs = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Events Calendar//iCal4j 1.0//EN

BEGIN:VEVENT
RRULE:FREQ=WEEKLY;INTERVAL=1
DTSTART:20200501T220000Z
DTEND:20200504T170000Z
DTSTAMP:20200501T163641Z
SUMMARY:RecurringBlock1
SEQUENCE:0
END:VEVENT

BEGIN:VEVENT
RRULE:FREQ=WEEKLY;INTERVAL=1
DTSTART:20200505T220000Z
DTEND:20200506T040000Z
DTSTAMP:20200501T163641Z
SUMMARY:RecurringBlock2
SEQUENCE:0
END:VEVENT

END:VCALENDAR
`;

test('non blocked time before all events', () => {
  const x = shouldBlockPipeline(ics, new Date('2019-02-03T07:00:00.000Z'), 300);
  expect(x).toBeUndefined();
});

test('non blocked time in between events', () => {
  const x = shouldBlockPipeline(ics, new Date('2017-07-12T07:00:00.000Z'));
  expect(x).toBeUndefined();
});

test('left edge', () => {
  const x = shouldBlockPipeline(ics, new Date('2017-04-12T07:00:00.000Z'));
  expect(x?.summary).toBe('Block1');
});

test('right edge', () => {
  const x = shouldBlockPipeline(ics, new Date('2017-11-27T08:00:00.000Z'));
  expect(x?.summary).toBe('Block2');
});

test('a blocked window starts AND finishes within margin', () => {
  // Using 72 hours padding to widely overlap Block3
  const x = shouldBlockPipeline(ics, new Date('2019-02-03T07:00:00.000Z'), 72 * 3_600);
  expect(x?.summary).toBe('Block3');
});

// Test that the initial event in a recurring series blocks the pipeline when
// the left edge aligns with the current time.
test('current time aligns with the left edge of the first event in a series blocks pipeline', () => {
  const x = shouldBlockPipeline(recurringIcs, new Date('2020-05-01T22:00:00.000Z'));
  expect(x?.summary).toBe('RecurringBlock1');
});

// Test that a future event in a recurring series blocks the pipeline when
// the left edge aligns with the current time.
test('current time aligns with the left edge of future event in a series blocks pipeline', () => {
  const x = shouldBlockPipeline(recurringIcs, new Date('2020-05-22T22:00:00.000Z'));
  expect(x?.summary).toBe('RecurringBlock1');
});

// Test that the initial event in a recurring series blocks the pipeline when
// the right edge aligns with the current time.
test('current time aligns with the right edge of the first occurrence blocks pipeline', () => {
  const x = shouldBlockPipeline(recurringIcs, new Date('2020-05-06T04:00:00.000Z'));
  expect(x?.summary).toBe('RecurringBlock2');
});


// Test that a future event in a recurring series blocks the pipeline when
// the right edge aligns with the current time.
test('current time aligns with the right edge of future event in series blocks pipeline', () => {
  const x = shouldBlockPipeline(recurringIcs, new Date('2020-05-27T04:00:00.000Z'));
  expect(x?.summary).toBe('RecurringBlock2');
});

// Test that we do not block between events in a recurring series.
test('current time is between future events in recurring series does not block pipeline', () => {
  const x = shouldBlockPipeline(recurringIcs, new Date('2020-05-14T00:00:00.000Z'));
  expect(x).toBeUndefined();
});
