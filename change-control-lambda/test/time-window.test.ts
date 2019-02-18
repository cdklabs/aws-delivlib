import { shouldBlockPipeline } from '../lib/time-window';
// tslint:disable:no-console

// The "X-COMMENT" fields give a "friendlier" description of the time window
const ics = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Events Calendar//iCal4j 1.0//EN

BEGIN:VEVENT
X-COMMENT:                  2017-04-12T07:00:00.000Z to 2017-04-19T06:59:59.000Z
DTSTAMP:20190114T161956Z
DTSTART:20170412T070000Z
DTEND:20170419T065959Z
SUMMARY:Block1
END:VEVENT

BEGIN:VEVENT
X-COMMENT:                  2017-11-23T08:00:00.000Z to 2017-11-27T08:00:00.000Z
DTSTAMP:20190114T161956Z
DTSTART:20171123T080000Z
DTEND:20171127T080000Z
SUMMARY:Block2
END:VEVENT

BEGIN:VEVENT
X-COMMENT:                  2019-02-03T08:00:00.000Z to 2019-02-04T07:59:00.000Z
DTSTAMP:20190114T161956Z
DTSTART:20190203T080000Z
DTEND:20190204T075900Z
SUMMARY:Block3
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
