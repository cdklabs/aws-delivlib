import { shouldBlockPipeline } from '../lib/time-window';
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

BEGIN:VEVENT
RRULE:FREQ=WEEKLY;INTERVAL=1
DTEND:20200504T170000Z
SUMMARY:Block4
DTSTAMP:20200501T163641Z
DTSTART:20200501T220000Z
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
  expect(x && x.summary).toBe('Block1');
});

test('right edge', () => {
  const x = shouldBlockPipeline(ics, new Date('2017-11-27T08:00:00.000Z'));
  expect(x && x.summary).toBe('Block2');
});

test('a blocked window starts AND finishes within margin', () => {
  // Using 72 hours padding to widely overlap Block3
  const x = shouldBlockPipeline(ics, new Date('2019-02-03T07:00:00.000Z'), 72 * 3_600);
  expect(x && x.summary).toBe('Block3');
});

test('left edge for recurring event after the initial event', () => {
  const x = shouldBlockPipeline(ics, new Date('2020-05-08T22:00:00.000Z'));
  expect(x && x.summary).toBe('Block4 2020-05-08T22:00:00.000Z - 2020-05-11T17:00:00.000Z');
});

test('right edge for recurring event after the initial event', () => {
  const x = shouldBlockPipeline(ics, new Date('2020-05-11T17:00:00.000Z'));
  expect(x && x.summary).toBe('Block4 2020-05-08T22:00:00.000Z - 2020-05-11T17:00:00.000Z');
});

test('left edge for initial event in recurring event', () => {
  const x = shouldBlockPipeline(ics, new Date('2020-05-01T22:00:00.000Z'));
  expect(x && x.summary).toBe('Block4 2020-05-01T22:00:00.000Z - 2020-05-04T17:00:00.000Z');
});

test('right edge for initial event in recurring event', () => {
  const x = shouldBlockPipeline(ics, new Date('2020-05-04T17:00:00.000Z'));
  expect(x && x.summary).toBe('Block4 2020-05-01T22:00:00.000Z - 2020-05-04T17:00:00.000Z');
});

test('does not block in between recurrences', () => {
  const x = shouldBlockPipeline(ics, new Date('2020-05-14T00:00:00.000Z'));
  expect(x).toBeUndefined();
});
