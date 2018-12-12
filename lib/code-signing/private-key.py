# Uses the openssl CLI to generate a new RSA Private Key with a modulus of a specified length. The resource _cannot_ be
# updated, as this usually wouldn't be the user's intention. Instead, a new instance should be created as part of key
# rotation. The private key will be stored in an AWS SecretsManager secret.
#
# Inputs:
# - KeySize (number, required):    the RSA key modulus length in bits
# - SecretName (string, required): the name of the AWS SecretsManager secret that'll hold the private key (must _not_ exist)
# - KmsKeyId (string):             the KMS CMK to use for the secret. If none is provided, the default key will be used
# - Description (string):          the description to attach to the secret.
#
# Outputs:
# - ARN (string):       The AWS SecretsManager secret ARN
# - VersionId (string): The AWS SecretsManager secret VersionId

import logging as log
import json, os, sys

def handle_event(event, aws_request_id):
  import boto3, shutil, subprocess, tempfile

  props = event['ResourceProperties']

  if event['RequestType'] == 'Update':
    # Prohibit updates - you don't want to inadertently cause your private key to change...
    raise Exception('X509 Private Key update requires replacement, a new resource must be created!')

  elif event['RequestType'] == 'Create':
    tmpdir = tempfile.mkdtemp()
    with tempfile.TemporaryDirectory() as tmpdir:
      pkey_file = os.path.join(tmpdir, 'private_key.pem')
      subprocess.check_call(['openssl', 'genrsa', '-out', pkey_file, props['KeySize']], shell=False)
      with open(pkey_file) as pkey:
        opts = {
          'ClientRequestToken': aws_request_id,
          'Description': props.get('Description'),
          'Name': props['SecretName'],
          'SecretString': pkey.read()
        }

        kmsKeyId = props.get('KmsKeyId')
        if kmsKeyId: opts['KmsKeyId'] = kmsKeyId

        ret = boto3.client('secretsmanager').create_secret(**opts)
        return {'ARN': ret['ARN'], 'VersionId': ret['VersionId']}

  elif event['RequestType'] == 'Delete':
    if event['PhysicalResourceId'].startswith('arn:'): # Only if the resource had been successfully created before
      boto3.client('secretsmanager').delete_secret(SecretId=event['PhysicalResourceId'])
    return {'ARN': ''}

  else:
      raise Exception('Unsupported RequestType: %s' % event['RequestType'])

def main(event, context):
  import cfnresponse
  log.getLogger().setLevel(log.INFO)

  try:
    log.info('Input event: %s', event)
    attributes = handle_event(event, context.aws_request_id)
    cfnresponse.send(event, context, cfnresponse.SUCCESS, attributes, attributes['ARN'])
  except Exception as e:
    log.exception(e)
    # cfnresponse's error message is always "see CloudWatch"
    cfnresponse.send(event, context, cfnresponse.FAILED, {}, context.log_stream_name)

if __name__ == '__main__':
  handle_event(json.load(sys.stdin), 'ec92d8a9-672c-4647-9d34-0d3159a2c692')
