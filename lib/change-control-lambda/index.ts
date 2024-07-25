// eslint-disable-next-line import/no-extraneous-dependencies


// eslint-disable-next-line import/no-extraneous-dependencies
import { S3 } from '@aws-sdk/client-s3';
import { disableTransition, enableTransition } from './disable-transition';
import { shouldBlockPipeline } from './time-window';

// tslint:disable:no-console
const s3 = new S3();

/**
 * Handler for a lambda function that can be called periodically in order to enforce Change Control calendars. It
 * expects the following environment variables to be available:
 *
 * CHANGE_CONTROL_BUCKET_NAME - the name of the S3 Bucket containing the change control calendar
 * CHANGE_CONTROL_OBJECT_KEY  - the key in which the change control calendar is at in CHANGE_CONTROL_BUCKET_NAME
 * PIPELINE_NAME              - the name of the pipeline in which promotions will be managed
 * STAGE_NAME                 - the name of the stage into which transitions are managed
 */
export async function handler(/*_event: any, _context: any*/) {
  const bucketName = env('CHANGE_CONTROL_BUCKET_NAME');
  const objectKey = env('CHANGE_CONTROL_OBJECT_KEY');
  const stageName = env('STAGE_NAME');
  const pipelineName = env('PIPELINE_NAME');

  console.log(`CHANGE_CONTROL_BUCKET_NAME: ${bucketName}`);
  console.log(`CHANGE_CONTROL_OBJECT_KEY:  ${bucketName}`);
  console.log(`STAGE_NAME:                 ${bucketName}`);
  console.log(`PIPELINE_NAME:              ${bucketName}`);

  try {
    const icsData = await tryGetCalendarData(bucketName, objectKey);
    const blockingEvent = shouldBlockPipeline(icsData, new Date());
    if (blockingEvent) {
      console.log(`Disabling transition into ${pipelineName}.${stageName} with reason ${blockingEvent.summary}`);
      await disableTransition(pipelineName, stageName, blockingEvent.summary);
    } else {
      console.log(`Enabling transition into ${pipelineName}.${stageName}`);
      await enableTransition(pipelineName, stageName);
    }
    console.log('All Done!');
  } catch (e: any) {
    console.log(`Error: ${e.message} - ${e.stack}`);
    throw e;
  }
}

function env(name: string) {
  const x = process.env[name];
  if (x === undefined) {
    throw new Error(`Environment variable "${name}" is required`);
  }
  return x;
}

async function tryGetCalendarData(Bucket: string, Key: string) {
  try {
    const icsFile = await s3.getObject({ Bucket, Key });
    console.log(`Calendar object version ID: ${icsFile.VersionId || '<unversioned>'}`);
    return icsFile.Body!.toString();
  } catch (e: any) {
    // If the bucket or key don't exist, default to closed all the time!
    if (e.code === 'NoSuchBucket' || e.code === 'NoSuchKey') {
      console.log(`Calendar object could not be found (${e.message}), defaulting to closed.`);
      return `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Events Calendar//iCal4j 1.0//EN
BEGIN:VEVENT
DTSTAMP:20190215T095737Z
DTSTART:19700101T000000Z
DTEND:99991231T235959Z
SUMMARY:No change control calendar was found in s3://${Bucket}/${Key} !
END:VEVENT
END:VCALENDAR
      `;
    }
    throw e;
  }
}
