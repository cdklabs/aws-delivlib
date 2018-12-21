import https = require('https');
import url = require('url');

/**
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref-responses.html
 */
export function sendResponse(event: Event,
                             status: Status,
                             physicalResourceId: string,
                             data: { [name: string]: string | undefined },
                             reason?: string) {
  const responseBody = JSON.stringify({
    Data: data,
    LogicalResourceId: event.LogicalResourceId,
    PhysicalResourceId: physicalResourceId,
    Reason: reason,
    RequestId: event.RequestId,
    StackId: event.StackId,
    Status: status,
  }, null, 2);

  // tslint:disable-next-line:no-console
  console.log(`Response body: ${responseBody}`);

  const parsedUrl = url.parse(event.ResponseURL);
  const options: https.RequestOptions = {
    headers: {
      'content-length': responseBody.length,
      'content-type': '',
    },
    hostname: parsedUrl.hostname,
    method: 'PUT',
    path: parsedUrl.path,
    port: parsedUrl.port || 443,
  };

  return new Promise((ok, ko) => {
    // tslint:disable-next-line:no-console
    console.log('Sending response...');

    const req = https.request(options, resp => {
      // tslint:disable-next-line:no-console
      console.log(`Received HTTP ${resp.statusCode} (${resp.statusMessage})`);
      if (resp.statusCode === 200) {
        return ok();
      }
      ko(new Error(`Unexpected error sending resopnse to CloudFormation: HTTP ${resp.statusCode} (${resp.statusMessage})`));
    });

    req.on('error', ko);
    req.write(responseBody);

    req.end();
  });
}

export enum Status {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum RequestType {
  CREATE = 'Create',
  UPDATE = 'Update',
  DELETE = 'Delete',
}

/** @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref-requests.html */
export type Event = CreateEvent | UpdateEvent | DeleteEvent;

export interface CloudFormationEventBase {
  readonly RequestType: RequestType;
  readonly ResponseURL: string;
  readonly StackId: string;
  readonly RequestId: string;
  readonly ResourceType: string;
  readonly LogicalResourceId: string;
  readonly ResourceProperties: { [name: string]: any };
}

export interface CreateEvent extends CloudFormationEventBase {
  readonly RequestType: RequestType.CREATE;
  readonly PhysicalResourceId: undefined;
}

export interface UpdateEvent extends CloudFormationEventBase {
  readonly RequestType: RequestType.UPDATE;
  readonly PhysicalResourceId: string;
  readonly OldResourceProperties: { [name: string]: any };
}

export interface DeleteEvent extends CloudFormationEventBase {
  readonly RequestType: RequestType.DELETE;
  readonly PhysicalResourceId: string;
}
