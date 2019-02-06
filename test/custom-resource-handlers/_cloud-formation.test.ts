import { EventEmitter } from 'events';
import https = require('https');
import cfn = require('../../custom-resource-handlers/src/_cloud-formation');

const event: cfn.Event = {
  RequestType: cfn.RequestType.CREATE,
  RequestId: '00FDF1A4-69FE-4E90-A6D5-D0E97F561414',
  ResourceType: 'Custom::Resource::Type',
  StackId: 'Stack-1234567890',
  LogicalResourceId: 'Resource123456',
  ResponseURL: 'https://host.domain.tld:123/path/to/resource?query=string',
  ResourceProperties: {},
  PhysicalResourceId: undefined,
};
const status = cfn.Status.SUCCESS;
const physicalId = 'Physical ID!';
const data = {};
const reason = 'I have reasons. Don\'t ask.';

const httpsRequest = https.request = jest.fn().mockName('https.request');

test('sends the correct response to CloudFormation', () => {
  httpsRequest.mockImplementationOnce((opts, cb) => {
      expect(opts.headers['content-type']).toBe('');
      expect(opts.hostname).toBe('host.domain.tld');
      expect(opts.method).toBe('PUT');
      expect(opts.port).toBe('123');
      expect(opts.path).toBe('/path/to/resource?query=string');

      const emitter = new EventEmitter();
      let payload: string;

      return {
        on(evt: string, callback: (...args: any[]) => void) {
          emitter.on(evt, callback);
          return this;
        },
        once(evt: string, callback: (...args: any[]) => void) {
          emitter.once(evt, callback);
          return this;
        },
        write(str: string) {
          payload = str;
          return true;
        },
        end: jest.fn().mockImplementationOnce(() => {
          expect(JSON.parse(payload || '{}')).toEqual({
            Data: data,
            LogicalResourceId: event.LogicalResourceId,
            PhysicalResourceId: physicalId,
            Reason: reason,
            RequestId: event.RequestId,
            StackId: event.StackId,
            Status: status,
          });
          cb({ statusCode: 200 });
        }),
      } as any;
    }
  );

  return expect(cfn.sendResponse(event, status, physicalId, data, reason))
    .resolves.toBe(undefined);
});

test('fails if the PUT request returns non-200', () => {
  httpsRequest.mockImplementationOnce((opts, cb) => {
    expect(opts.headers['content-type']).toBe('');
    expect(opts.hostname).toBe('host.domain.tld');
    expect(opts.method).toBe('PUT');
    expect(opts.port).toBe('123');
    expect(opts.path).toBe('/path/to/resource?query=string');

    const emitter = new EventEmitter();
    let payload: string;

    return {
      on(evt: string, callback: (...args: any[]) => void) {
        emitter.on(evt, callback);
        return this;
      },
      once(evt: string, callback: (...args: any[]) => void) {
        emitter.once(evt, callback);
        return this;
      },
      write(str: string) {
        payload = str;
        return true;
      },
      end: jest.fn().mockImplementationOnce(() => {
        expect(JSON.parse(payload || '{}')).toEqual({
          Data: data,
          LogicalResourceId: event.LogicalResourceId,
          PhysicalResourceId: physicalId,
          Reason: reason,
          RequestId: event.RequestId,
          StackId: event.StackId,
          Status: status,
        });
        cb({ statusCode: 500, statusMessage: 'Internal Error' });
      }),
    } as any;
  });

  return expect(cfn.sendResponse(event, status, physicalId, data, reason))
    .rejects.toThrow('Unexpected error sending resopnse to CloudFormation: HTTP 500 (Internal Error)');
});
