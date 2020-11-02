import https = require('https');
import url = require('url');
import lambda = require('./_lambda');

export type LambdaHandler = (event: Event, context: lambda.Context) => Promise<void>;
export type ResourceHandler = (event: Event, context: lambda.Context) => Promise<ResourceAttributes>;

/**
 * Implements a Lambda CloudFormation custom resource handler.
 *
 * @param handleEvent  the handler function that creates, updates and deletes the resource.
 * @param refAttribute the name of the attribute holindg the Physical ID of the resource.
 * @returns a handler function.
 */
export function customResourceHandler(handleEvent: ResourceHandler): LambdaHandler {
  return async (event, context) => {
    try {
      // tslint:disable-next-line:no-console
      console.log(`Input event: ${JSON.stringify(event)}`);

      const attributes = await handleEvent(event, context);

      // tslint:disable-next-line:no-console
      console.log(`Attributes: ${JSON.stringify(attributes)}`);

      await exports.sendResponse(event, Status.SUCCESS, attributes.Ref, attributes);
    } catch (e) {
      // tslint:disable-next-line:no-console
      console.error(e);
      await exports.sendResponse(event, Status.FAILED, event.PhysicalResourceId, {}, e.message);
    }
  };
}

/**
 * General shape of custom resource attributes.
 */
export interface ResourceAttributes {
  /** The physical reference to this resource instance. */
  Ref: string;

  /** Other attributes of the resource. */
  [key: string]: string | undefined;
}

/**
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref-responses.html
 */
export function sendResponse(event: Event,
  status: Status,
  physicalResourceId: string = event.PhysicalResourceId || event.LogicalResourceId,
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

    req.once('error', ko);
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

/**
 * Validates that all required properties are present, and that no extraneous properties are provided.
 *
 * @param props      the properties to be validated.
 * @param validProps a mapping of valid property names to a boolean instructing whether the property is required or not.
 */
export function validateProperties(props: { [name: string]: any }, validProps: { [name: string]: boolean }) {
  // ServiceToken is always accepted (technically required, but we don't care about it internally, unless the caller said we do)
  validProps.ServiceToken = validProps.ServiceToken || false;
  // ResourceVersion is injected by the Lambda handler, and is permitted but not required, unless the caller said it is.
  validProps.ResourceVersion = validProps.ResourceVersion || false;

  for (const property of Object.keys(props)) {
    if (!(property in validProps)) {
      throw new Error(`Unexpected property: ${property}`);
    }
  }
  for (const property of Object.keys(validProps)) {
    if (validProps[property] && !(property in props)) {
      throw new Error(`Missing required property: ${property}`);
    }
  }
  return props;
}
