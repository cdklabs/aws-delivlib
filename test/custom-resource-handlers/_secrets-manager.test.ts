import aws = require('aws-sdk');
import { resolveCurrentVersionId } from '../../custom-resource-handlers/src/_secrets-manager';

test('resolves to the correct VersionId', async () => {
  const secretId = "Sekr37";
  const versionId = "Shiney-VersionId";

  const client = new aws.SecretsManager();
  client.listSecretVersionIds = jest.fn()
    .mockName('secretsManager.listSecretVersionIds')
    .mockImplementationOnce((opts: aws.SecretsManager.ListSecretVersionIdsRequest) => {
      expect(opts.NextToken).toBe(undefined);
      return {
        promise() {
          return Promise.resolve<aws.SecretsManager.ListSecretVersionIdsResponse>({
            Versions: [
              { VersionId: 'Version1', VersionStages: ['OLDVERSION', 'BUGGYVERSION'] }
            ],
            NextToken: '1'
          });
        }
      };
    })
    .mockImplementationOnce((opts: aws.SecretsManager.ListSecretVersionIdsRequest) => {
      expect(opts.NextToken).toBe('1');
      return {
        promise() {
          return Promise.resolve<aws.SecretsManager.ListSecretVersionIdsResponse>({
            Versions: [
              { VersionId: versionId, VersionStages: ['NEWVERSION', 'AWSCURRENT', 'IDONTCARE'] }
            ],
            NextToken: undefined
          });
        }
      };
    });

  return expect(await resolveCurrentVersionId(secretId, client)).toBe(versionId);
});

test('throws if there is no AWSCURRENT version', () => {
  const secretId = "Sekr37";

  const client = new aws.SecretsManager();
  client.listSecretVersionIds = jest.fn()
    .mockName('secretsManager.listSecretVersionIds')
    .mockImplementationOnce((opts: aws.SecretsManager.ListSecretVersionIdsRequest) => {
      expect(opts.NextToken).toBe(undefined);
      return {
        promise() {
          return Promise.resolve<aws.SecretsManager.ListSecretVersionIdsResponse>({
            Versions: [
              { VersionId: 'Version1', VersionStages: ['OLDVERSION', 'BUGGYVERSION'] }
            ],
            NextToken: '1'
          });
        }
      };
    })
    .mockImplementationOnce((opts: aws.SecretsManager.ListSecretVersionIdsRequest) => {
      expect(opts.NextToken).toBe('1');
      return {
        promise() {
          return Promise.resolve<aws.SecretsManager.ListSecretVersionIdsResponse>({
            Versions: [
              { VersionId: 'Version2', VersionStages: ['NEWVERSION', 'IDONTCARE'] }
            ],
            NextToken: undefined
          });
        }
      };
    });

  return expect(resolveCurrentVersionId(secretId, client)).rejects
    .toEqual(new Error(`Unable to determine the current VersionId of ${secretId}`));
});
