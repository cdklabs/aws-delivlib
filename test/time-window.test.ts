import fs = require('fs');
import path = require('path');
import { shouldBlockPipeline } from '../change-control-lambda/time-window';
// tslint:disable:no-console

// +======================================================+
// | test-windows.ics contains these block windows        |
// +======================================================+
// | 2019-02-03T08:00:00.000Z to 2019-02-04T07:59:00.000Z |
// | 2017-04-12T07:00:00.000Z to 2017-04-19T06:59:59.000Z |
// | 2017-11-23T08:00:00.000Z to 2017-11-27T08:00:00.000Z |
// +------------------------------------------------------+

const ics = fs.readFileSync(path.join(__dirname, 'time-windows', 'time-windows.ics'), { encoding: 'utf-8' });

test('non blocked time before all events', () => {
  const x = shouldBlockPipeline(ics, new Date('2019-02-03T07:00:00.000Z'));
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
