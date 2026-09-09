$ErrorActionPreference = "Stop"
Set-PSDebug -Trace 1

# The assumed-role ARN looks like:
#   arn:aws:sts::712950704752:assumed-role/delivlib-test-...-AssumeMe.../assume-role-test
$identity = aws sts get-caller-identity --output json | ConvertFrom-Json
$roleArn = $identity.Arn

# Extract the role name: the second segment after splitting on '/'.
$actualRoleName = ($roleArn -split "/")[1]

if ($actualRoleName -ne $env:EXPECTED_ROLE_NAME) {
    Write-Error "Actual role name was $actualRoleName but we expected $env:EXPECTED_ROLE_NAME"
    exit 1
}
