import aws = require('aws-sdk');

export async function resolveCurrentVersionId(secretId: string,
                                              client: aws.SecretsManager = new aws.SecretsManager()): Promise<string> {
  const request: aws.SecretsManager.ListSecretVersionIdsRequest = { SecretId: secretId };
  do {
    const response = await client.listSecretVersionIds(request).promise();
    request.NextToken = response.NextToken;
    if (!response.Versions) { continue; }
    for (const version of response.Versions) {
      if (version.VersionId && version.VersionStages && version.VersionStages.indexOf('AWSCURRENT') !== -1) {
        return version.VersionId;
      }
    }
  } while (request.NextToken != null);
  throw new Error(`Unable to determine the current VersionId of ${secretId}`);
}
