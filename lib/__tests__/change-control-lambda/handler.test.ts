import * as transitions from '../../change-control-lambda/disable-transition';
import * as timeWindow from '../../change-control-lambda/time-window';

// _____                                _   _
// |  __ \                              | | (_)
// | |__) | __ ___ _ __   __ _ _ __ __ _| |_ _  ___  _ __
// |  ___/ '__/ _ \ '_ \ / _` | '__/ _` | __| |/ _ \| '_ \
// | |   | | |  __/ |_) | (_| | | | (_| | |_| | (_) | | | |
// |_|   |_|  \___| .__/ \__,_|_|  \__,_|\__|_|\___/|_| |_|
//                | |
//                |_|

const mockS3Client = {
  getObject: jest.fn().mockName('S3.GetObject'),
};

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3: jest.fn().mockImplementation(() => {
      return mockS3Client;
    }),
  };
});

jest.mock('../../change-control-lambda/disable-transition');
jest.mock('../../change-control-lambda/time-window');

const mockEnableTransition =
  jest.fn((_pipeline: string, _stage: string) => Promise.resolve(undefined))
    .mockName('enableTransition');
(transitions as any).enableTransition = mockEnableTransition;

const mockDisableTransition =
  jest.fn((_pipeline: string, _stage: string, _reason: string) => Promise.resolve(undefined))
    .mockName('disableTransition');
(transitions as any).disableTransition = mockDisableTransition;

const mockShouldBlockPipeline = jest.fn((_icsData: string | Buffer, _now?: Date): timeWindow.CalendarEvent | undefined => undefined)
  .mockName('shouldBlockPipeline');
(timeWindow as any).shouldBlockPipeline = mockShouldBlockPipeline;

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

// _______        _
// |__   __|      | |
//    | | ___  ___| |_ ___
//    | |/ _ \/ __| __/ __|
//    | |  __/\__ \ |_\__ \
//    |_|\___||___/\__|___/

describe('handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const handler = require('../../change-control-lambda/index').handler;

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

    test('when S3 access fails', async () => {
      // GIVEN
      const e = new Error('S3 Not Working - the apocalypse has begun');
      mockS3Client.getObject.mockImplementationOnce(() => Promise.reject(e));

      // THEN
      return expect(handler()).rejects.toThrow(e);
    });
  });

  for (const cause of ['NoSuchKey', 'NoSuchBucket']) {
    test(`when no calendar is found (due to ${cause})`, async () => {
      // GIVEN
      mockS3Client.getObject.mockImplementationOnce(() => Promise.reject({ code: cause, message: cause }));
      mockShouldBlockPipeline.mockReturnValueOnce({
        summary: 'Blocked by default',
        // Other properties - values irrelevant
        start: new Date(),
        end: new Date(),
        dtstamp: new Date(),
        type: 'VEVENT',
        datetype: 'date-time',
        params: [],
      });

      // WHEN
      await expect(handler()).resolves.toBeUndefined();

      // THEN
      expect(mockS3Client.getObject)
        .toHaveBeenCalledWith({ Bucket: bucketName, Key: objectKey });

      expect(mockShouldBlockPipeline)
        .toHaveBeenCalledWith(expect.stringContaining('No change control calendar was found'),
          expect.any(Date));

      return expect(mockDisableTransition)
        .toHaveBeenCalledWith(pipelineName, stageName, 'Blocked by default');
    });
  }

  test('when the window is open', async () => {
    // GIVEN
    const iCalBody = 'Some iCal document (obviously, this is a fake one!)';
    mockS3Client.getObject.mockImplementationOnce(() => Promise.resolve({ Body: iCalBody }));
    mockShouldBlockPipeline.mockReturnValueOnce(undefined);

    // WHEN
    await expect(handler()).resolves.toBeUndefined();

    // THEN
    expect(mockS3Client.getObject)
      .toHaveBeenCalledWith({ Bucket: bucketName, Key: objectKey });

    expect(mockShouldBlockPipeline)
      .toHaveBeenCalledWith(iCalBody, expect.any(Date));

    return expect(mockEnableTransition)
      .toHaveBeenCalledWith(pipelineName, stageName);
  });
});

afterAll(() => {
  process.env = initialEnv;
});
