# Uses the openssl CLI to generate a Certificate Signing Request (CSR) document using a pre-existing Private Key that
# is stored in an AWS SecretsManager secret.
#
# Inputs (required):
# - PrivateKeySecretId (string):       The ID/ARN of the AWS SecretsManager secret ID holding the Private Key
# - DnCommonName (string):             The Common Name to register in the CSR (e.g: www.acme.com)
# - DnCountry (string):                The Country to register in the CSR (ISO 2-letter code, e.g: US)
# - DnStateOrProvince (string):        The State or Province to register in the CSR (e.g: Washington)
# - DnLocality (string):               The Locality to register in the CSR (e.g: Seattle)
# - DnOrganizationName (string):       The Organization to register in the CSR (e.g: ACME, Inc.)
# - DnOrganizationalUnitName (string): The Org. Unit name to register in the CSR (e.g: Security Dept.)
# - DnEmailAddress (string):           The email address to register in the CSR (e.g: admin@acme.com)
# - KeyUsage (string):                 The key usage to request in the CSR (e.g: critical,digitalSignature)
# - ExtendedKeyUsage (string):         The extended key usage to request in the CSR (e.g: critical,codeSigning)
#
# Outputs:
# - CSR (string): The Certificate Signing Request document, PEM-encoded.

import logging as log
import json, os, sys

CFN_SUCCESS = "SUCCESS"
CFN_FAILED = "FAILED"

def handle_event(event, aws_request_id):
   import boto3, subprocess, tempfile

   props = event['ResourceProperties']

   if event['RequestType'] in ['Create', 'Update']:
      with tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8') as config:
         # Creating a CSR Config file
         config.write('[ req ]\n')
         config.write('default_md           = sha256\n')
         config.write('distinguished_name   = dn\n')
         config.write('prompt               = no\n')
         config.write('req_extensions       = extensions\n')
         config.write('string_mask          = utf8only\n')
         config.write('utf8                 = yes\n')
         config.write('\n')
         config.write('[ dn ]\n')
         config.write('CN                   = %s\n' % props['DnCommonName'])
         config.write('C                    = %s\n' % props['DnCountry'])
         config.write('ST                   = %s\n' % props['DnStateOrProvince'])
         config.write('L                    = %s\n' % props['DnLocality'])
         config.write('O                    = %s\n' % props['DnOrganizationName'])
         config.write('OU                   = %s\n' % props['DnOrganizationalUnitName'])
         config.write('emailAddress         = %s\n' % props['DnEmailAddress'])
         config.write('\n')
         config.write('[ extensions ]\n')
         config.write('extendedKeyUsage     = %s\n' % props['ExtendedKeyUsage'])
         config.write('keyUsage             = %s\n' % props['KeyUsage'])
         config.write('subjectKeyIdentifier = hash\n')
         config.flush()

         with tempfile.TemporaryDirectory() as tmpdir:
            with tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8') as pkey:
               secret = boto3.client('secretsmanager').get_secret_value(SecretId=props['PrivateKeySecretId'])
               pkey.write(secret['SecretString'])
               pkey.flush()

               csr_file = os.path.join(tmpdir, 'csr.pem')
               self_signed_cert = os.path.join(tmpdir, 'self-signed-cert.pem')

               subprocess.check_call([
                  'openssl', 'req', '-config', config.name,
                                    '-key', pkey.name,
                                    '-out', csr_file,
                                    '-new'
               ])

               subprocess.check_call([
                  'openssl', 'x509', '-in', csr_file,
                                    '-out', self_signed_cert,
                                    '-req',
                                    '-signkey', pkey.name,
                                    '-days', '365'
               ])

            with open(csr_file) as csr:
               with open(self_signed_cert) as cert:
                  return {
                     'CSR': csr.read(),
                     'SelfSignedCertificate': cert.read()
                  }

   elif event['RequestType'] == 'Delete':
      # Nothing to do - the CSR isn't quite a "material" resource
      return {}

   else:
      raise Exception('Unsupported RequestType: %s' % event['RequestType'])

def main(event, context):
   log.getLogger().setLevel(log.INFO)

   try:
      log.info('Input event: %s', json.dumps(event))
      attributes = handle_event(event, context.aws_request_id)
      cfn_send(event, context, CFN_SUCCESS, attributes, event['LogicalResourceId'])
   except KeyError as e:
      cfn_send(event, context, CFN_FAILED, {}, reason="Invalid request: missing key %s" % str(e))
   except Exception as e:
      log.exception(e)
      cfn_send(event, context, CFN_FAILED, {}, reason=str(e))

#---------------------------------------------------------------------------------------------------
# sends a response to cloudformation
def cfn_send(event, context, responseStatus, responseData={}, physicalResourceId=None, noEcho=False, reason=None):
   responseUrl = event['ResponseURL']
   log.info(responseUrl)

   body = json.dumps({
      'Status': responseStatus,
      'Reason': reason or ('See the details in CloudWatch Log Stream: ' + context.log_stream_name),
      'PhysicalResourceId': physicalResourceId or context.log_stream_name,
      'StackId': event['StackId'],
      'RequestId': event['RequestId'],
      'LogicalResourceId': event['LogicalResourceId'],
      'NoEcho': noEcho,
      'Data': responseData,
   })
   log.info("| response body:\n" + body)

   headers = {
      'content-type' : 'application/json',
      'content-length' : str(len(body))
   }

   try:
      from botocore.vendored import requests
      response = requests.put(responseUrl, data=body, headers=headers)
      log.info("| status code: " + response.reason)
   except Exception as e:
      log.error("| unable to send response to CloudFormation")
      raise e

if __name__ == '__main__':
   handle_event(json.load(sys.stdin), '61120008-4da7-40e1-b180-5ce50a6b90ad')
