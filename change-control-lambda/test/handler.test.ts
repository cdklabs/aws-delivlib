import AWS = require('aws-sdk');
import transitions = require('../lib/disable-transition');
import timeWindow = require('../lib/time-window');

jest.mock('aws-sdk');
jest.mock('../lib/disable-transition');
jest.mock('../lib/time-window');

const mockGetObject = jest.fn().mockName('AWS.S3.getObject');
AWS.S3 = jest.fn(() => ({ getObject: mockGetObject })).mockName('AWS.S3') as any;

const mockEnableTransition =
  jest.fn((_pipeline: string, _stage: string) => Promise.resolve(undefined))
    .mockName('enableTransition');
transitions.enableTransition = mockEnableTransition;

const mockDisableTransition =
  jest.fn((_pipeline: string, _stage: string, _reason: string) => Promise.resolve(undefined))
    .mockName('disableTransition');
transitions.disableTransition = mockDisableTransition;

const mockShouldBlockPipeline: jest.Mock<undefined | timeWindow.CalendarEvent> =
  jest.fn((_icsData: string | Buffer, _date: Date) => undefined)
    .mockName('shouldBlockPipeline');
timeWindow.shouldBlockPipeline = mockShouldBlockPipeline;

const initialEnv = process.env;
beforeEach(() => {
  jest.restoreAllMocks();
  process.env = { ...testEnv };
});

const mockConsoleLog = jest.fn().mockName('console.log');
console.log = mockConsoleLog;

const bucketName = 'BucketName';
const objectKey = 'ObjectKey';
const stageName = 'StageName';
const pipelineName = 'PipelineName';
const testEnv = {
  CHANGE_CONTROL_BUCKET_NAME: bucketName,
  CHANGE_CONTROL_OBJECT_KEY: objectKey,
  STAGE_NAME: stageName,
  PIPELINE_NAME: pipelineName,
};

describe('handler', () => {
  const handler = require('../lib/index').handler;

  describe('failing conditions', () => {
    for (const variable of Object.keys(testEnv)) {
      test(`when ${variable} is not set`, () => {
        // GIVEN
        delete process.env[variable];
        // THEN
        return expect(handler())
          .rejects.toThrow(`Environment variable "${variable}" is required`);
      });
    }

    test(`when S3 access fails`, async () => {
      // GIVEN
      const e = new Error('S3 Not Working - the apocalypse has begun');
      mockGetObject.mockImplementationOnce(() => ({
        promise: () => Promise.reject(e)
      }));
      // THEN
      return expect(handler()).rejects.toThrow(e);
    });
  });

  for (const cause of ['NoSuchKey', 'NoSuchBucket']) {
    test(`when no calendar is found (due to ${cause})`, async () => {
      // GIVEN
      mockGetObject.mockImplementationOnce(() => ({
        promise: () => Promise.reject({ code: cause, message: cause })
      }));
      mockShouldBlockPipeline.mockReturnValueOnce({
        summary: 'Blocked by default',
        // Other properties - values irrelevant
        start: new Date(), end: new Date(),
        dtstamp: new Date(), type: 'VEVENT',
        datetype: 'date-time', params: [],
      });
      // WHEN
      await expect(handler()).resolves.toBeUndefined();
      // THEN
      await expect(mockGetObject)
        .toHaveBeenCalledWith({ Bucket: bucketName, Key: objectKey });
      await expect(mockShouldBlockPipeline)
        .toHaveBeenCalledWith(expect.stringContaining('No change control calendar was found'),
                              expect.any(Date));
      return expect(mockDisableTransition)
        .toHaveBeenCalledWith(pipelineName, stageName, 'Blocked by default');
    });
  }

  test('when the window is open', async () => {
    // GIVEN
    const iCalBody = 'Some iCal document (obviously, this is a fake one!)';
    mockGetObject.mockImplementationOnce(() => ({
      promise: () => Promise.resolve({ Body: iCalBody }),
    }));
    mockShouldBlockPipeline.mockReturnValueOnce(undefined);
    // WHEN
    await expect(handler()).resolves.toBeUndefined();
    // THEN
    await expect(mockGetObject)
      .toHaveBeenCalledWith({ Bucket: bucketName, Key: objectKey });
    await expect(mockShouldBlockPipeline)
      .toHaveBeenCalledWith(iCalBody, expect.any(Date));
    return expect(mockEnableTransition)
      .toHaveBeenCalledWith(pipelineName, stageName);
  });
});

afterAll(() => {
  process.env = initialEnv;
});
