/**
 * @see https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
 */
export interface Context {
  /**
   * The name of the Lambda function
   */
  readonly functionName: string;

  /**
   * The version of the function
   */
  readonly functionVersion: string;

  /**
   * The Amazon Resource Name (ARN) used to invoke the function. Indicates if the invoker specified a version number
   * or alias.
   */
  readonly invokedFunctionArn: string;

  /**
   * The amount of memory configured on the function.
   */
  readonly memoryLimitInMB: number;

  /**
   * The identifier of the invocation request?
   */
  readonly awsRequestId: string;

  /**
   * The log group for the function.
   */
  readonly logGroupName: string;

  /**
   * The log stream for the function instance.
   */
  readonly logStreamName: string;

  /**
   * Set to false to send the response right away when the callback executes, instead of waiting for the Node.js event
   * loop to be empty. If false, any outstanding events will continue to run during the next invocation.
   */
  callbackWaitsForEmptyEventLoop: boolean;

  /**
   * For mobile apps, information about the Amazon Cognito identity that authorized the request.
   */
  identity?: {
    /**
     * The authenticated Amazon Cognito identity.
     */
    cognitoIdentityId: string;

    /**
     * The Amazon Cognito identity pool that authorized the invocation.
     */
    cognitoIdentityPoolId: string;
  };

  /**
   * For mobile apps, client context provided to the Lambda invoker by the client application.
   */
  clientContext?: {
    client: {
      installation_id: string;
      app_title: string;
      app_version_name: string;
      app_version_code: string;
      app_package_name: string;
    };
    env: {
      platform_version: string;
      platform: string;
      make: string;
      model: string;
      locale: string;
    };
    /**
     * Custom values set by the mobile application.
     */
    Custom: { [name: string]: any };
  }

  /**
   * Returns the number of milliseconds left before the execution times out.
   */
  getRemainingTimeInMillis(): number;
}
