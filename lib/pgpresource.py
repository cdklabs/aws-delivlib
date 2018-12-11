import logging as log
import json, os, sys

def handle_event(event, aws_request_id):
    import random, string, tempfile, subprocess, boto3

    props = event['ResourceProperties']

    if event['RequestType'] in ['Create', 'Update']:
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
            KmsKeyId=props['KeyArn'],
            SecretString=json.dumps(dict(PrivateKey=keymaterial, Passphrase=passphrase)))

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
                Description='Public part of signing key',
                Value=public_key,
                Type='String',
                Overwrite=(event['RequestType'] == 'Update'))

        return ret

    if event['RequestType'] == 'Delete':
        if event['PhysicalResourceId'].startswith('arn:'):  # Only if successfully created before
            boto3.client('ssm').delete_parameter(Name=props['ParameterName'])
            boto3.client('secretsmanager').delete_secret(SecretId=event['PhysicalResourceId'])
        return {'ARN': ''}

    return {'ARN': ''}


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
    handle_event(json.load(sys.stdin), '7547bafb-5125-44c5-83e4-6eae56a52cce')
