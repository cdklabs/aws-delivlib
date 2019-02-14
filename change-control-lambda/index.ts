import AWS = require('aws-sdk');
import fs = require('fs');
import path = require('path');
import util = require('util');
import { disableTransition, enableTransition } from './disable-transition';
import { shouldBlockPipeline } from './time-window';

// tslint:disable:no-console
const s3 = new AWS.S3();
const readFile = util.promisify(fs.readFile);

/**
 * Handler for a lambda function that can be called periodically in order to enforce Change Control calendars. It
 * expects the following environment variables to be available:
 *
 * CHANGE_CONTROL_BUCKET_NAME - the name of the S3 Bucket containing the change control calendar
 * CHANGE_CONTROL_OBJECT_KEY  - the key in which the change control calendar is at in CHANGE_CONTROL_BUCKET_NAME
 * PIPELINE_NAME              - the name of the pipeline in which promotions will be managed
 * STAGE_NAME                 - the name of the stage into which transitions are managed
 */
export async function handler(_event: any, _context: any) {
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
  } catch (e) {
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
    const icsFile = await s3.getObject({ Bucket, Key }).promise();
    console.log(`Calendar object version ID: ${icsFile.VersionId || '<unversioned>'}`);
    return icsFile.Body!.toString('utf8');
  } catch (e) {
    // If the bucket or key don't exist, default to closed all the time!
    if (e.code === 'NoSuchBucket' || e.code === 'NoSuchKey') {
      console.log(`Calendar object could not be found (${e.message}), defaulting to closed.`);
      return await readFile(path.join(__dirname, 'default-calendar.ics'));
    }
    throw e;
  }
}
