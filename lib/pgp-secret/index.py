import logging as log
import json, os, sys

CFN_SUCCESS = "SUCCESS"
CFN_FAILED = "FAILED"

def handle_event(event, aws_request_id):
    import random, string, tempfile, subprocess, boto3

    props = event['ResourceProperties']
    description = props.get('Description')
    new_key = event['RequestType'] == 'Create'

    if event['RequestType'] == 'Update':
        old_props = event['OldResourceProperties']
        immutable_fields = ['Email', 'Expiry', 'Identity', 'KeySizeBits', 'ParameterName', 'SecretName', 'Version']
        for field in immutable_fields:
            if props.get(field) != old_props.get(field):
                log.info(f'New key required as {field} changed from {old_props.get(field)} to {props.get(field)}')
                new_key = True

    if event['RequestType'] in ['Create', 'Update']:
        if new_key:
            passphrase = ''.join(random.choice(string.ascii_letters + string.digits) for _ in range(16))

            with tempfile.TemporaryDirectory() as tempdir_name:
                os.environ['GNUPGHOME'] = tempdir_name

                with tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8') as f:
                    f.write('Key-Type: RSA\n')
                    f.write('Key-Length: %s\n' % props['KeySizeBits'])
                    f.write('Name-Real: %s\n' % props['Identity'])
                    f.write('Name-Email: %s\n' % props['Email'])
                    f.write('Expire-Date: %s\n' % props['Expiry'])
                    f.write('Passphrase: %s\n' % passphrase)
                    f.write('%commit\n')
                    f.write('%echo done\n')
                    f.flush()

                    print(f.name)

                    subprocess.check_call(['gpg',
                        '--batch', '--gen-key', f.name], shell=False)

                keymaterial = subprocess.check_output(['gpg',
                    '--batch', '--yes',
                    '--passphrase', passphrase, '--export-secret-keys', '--armor'], shell=False).decode('utf-8')

                public_key = subprocess.check_output(['gpg',
                    '--batch', '--yes',
                    '--export', '--armor'], shell=False).decode('utf-8')

                call_args = dict(
                    ClientRequestToken=aws_request_id,
                    KmsKeyId=props.get('KeyArn'),
                    SecretString=json.dumps(dict(PrivateKey=keymaterial, Passphrase=passphrase)))

                if description is not None: call_args['Description'] = description

                if event['RequestType'] == 'Create':
                    ret = boto3.client('secretsmanager').create_secret(
                        Name=props['SecretName'],
                        **call_args)
                else:
                    ret = boto3.client('secretsmanager').update_secret(
                        SecretId=event['PhysicalResourceId'],
                        **call_args)

                boto3.client('ssm').put_parameter(
                        Name=props['ParameterName'],
                        Description=f'Public part of OpenPGP key {ret["ARN"]}',
                        Value=public_key,
                        Type='String',
                        Overwrite=(event['RequestType'] == 'Update'))
        else:
            call_args = dict(SecretId=event['PhysicalResourceId'],
                    ClientRequestToken=aws_request_id,
                    KmsKeyId=props.get('KeyArn'))

            if description is not None: call_args['Description'] = description

            ret = boto3.client('secretsmanager').update_secret(**call_args)

            # No new version was created - go fetch the current latest VersionId
            if ret.get('VersionId') is None:
                opts = dict(SecretId=ret['ARN'])
                while True:
                    response = boto3.client('secretsmanager').list_secret_version_ids(**opts)
                    for version in response['Versions']:
                        if 'AWSCURRENT' in version['VersionStages']:
                            ret['VersionId'] = version['VersionId']
                            break
                    if ret['VersionId'] is not None or response.get('NextToken') is None:
                        break
                    opts['NextToken'] = response['NextToken']

        return {
            'SecretArn': ret['ARN'],
            'SecretVersionId': ret['VersionId'],
            'ParameterName': props['ParameterName']
        }

    if event['RequestType'] == 'Delete':
        if event['PhysicalResourceId'].startswith('arn:'):  # Only if successfully created before
            boto3.client('ssm').delete_parameter(Name=props['ParameterName'])
            boto3.client('secretsmanager').delete_secret(SecretId=event['PhysicalResourceId'])

    return { 'SecretArn': '', 'SecretVersionId': '', 'ParameterName': '' }


def main(event, context):
    log.getLogger().setLevel(log.INFO)

    try:
        log.info('Input event: %s', json.dumps(event))
        attributes = handle_event(event, context.aws_request_id)
        cfn_send(event, context, CFN_SUCCESS, attributes, attributes['SecretArn'])
    except Exception as e:
        log.exception(e)
        cfn_send(event, context, CFN_FAILED, {}, event.get('PhysicalResourceId') or context.log_stream_name, reason=str(e))

#---------------------------------------------------------------------------------------------------
# sends a response to cloudformation
def cfn_send(event, context, responseStatus, responseData={}, physicalResourceId=None, noEcho=False, reason=None):
   responseUrl = event['ResponseURL']
   log.info(responseUrl)

   responseBody = {}
   responseBody['Status'] = responseStatus
   responseBody['Reason'] = reason or ('See the details in CloudWatch Log Stream: ' + context.log_stream_name)
   responseBody['PhysicalResourceId'] = physicalResourceId or context.log_stream_name
   responseBody['StackId'] = event['StackId']
   responseBody['RequestId'] = event['RequestId']
   responseBody['LogicalResourceId'] = event['LogicalResourceId']
   responseBody['NoEcho'] = noEcho
   responseBody['Data'] = responseData

   body = json.dumps(responseBody)
   log.info("| response body:\n" + body)

   headers = {
      'content-type' : '',
      'content-length' : str(len(body))
   }

   try:
      from botocore.vendored import requests
      response = requests.put(responseUrl, data=body, headers=headers)
      log.info("| status code: " + response.reason)
      response.raise_for_status()
   except Exception as e:
      log.error("| unable to send response to CloudFormation")
      raise e

if __name__ == '__main__':
    handle_event(json.load(sys.stdin), '7547bafb-5125-44c5-83e4-6eae56a52cce')
