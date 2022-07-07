const core = require('@actions/core');
const github = require('@actions/github');

class Config {
  constructor() {
    this.input = {
      mode: core.getInput('mode'),
      githubToken: core.getInput('github-token'),
      ec2ImageId: core.getInput('ec2-image-id'),
      ec2InstanceType: core.getInput('ec2-instance-type'),
      subnetId: core.getInput('subnet-id'),
      securityGroupId: core.getInput('security-group-id'),
      label: core.getInput('label'),
      instanceId: core.getInput('instance-id'),
      iamRoleName: core.getInput('iam-role-name'),
      runnerHomeDir: core.getInput('runner-home-dir'),
      maxAttempts: core.getInput('max_attempts'),
      cloud: core.getInput('cloud'),
      // azure settings
      azureLocation: core.getInput('azure-location'),
      azureVMSize: core.getInput('azure-vm-size'),
      azureResourceGroup: core.getInput('azure-resource-group-name'),
      azureSubscriptionId: core.getInput('azure-subscription-id'),
      azureSubnetId: core.getInput('azure-subnet-id'),
      azureImageId: core.getInput('azure-image-id'),
      azureVMDiskSizeInGB: Number(core.getInput('azure-vm-disk-size-in-gb')),
      azureTenantId: core.getInput('azure-tenant-id'),
      azureClientId: core.getInput('azure-client-id'),
      azureClientSecret: core.getInput('azure-client-secret'),
    };

    const awsTags = JSON.parse(core.getInput('aws-resource-tags'));
    this.awsTagSpecifications = null;
    if (awsTags.length > 0) {
      this.awsTagSpecifications = [
        { ResourceType: 'instance', Tags: awsTags },
        { ResourceType: 'volume', Tags: awsTags },
      ];
    }

    this.azureTags = JSON.parse(core.getInput('azure-vm-tags'));

    // the values of github.context.repo.owner and github.context.repo.repo are taken from
    // the environment variable GITHUB_REPOSITORY specified in "owner/repo" format and
    // provided by the GitHub Action on the runtime
    this.githubContext = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
    };

    //
    // validate input
    //

    if (!this.input.mode) {
      throw new Error(`The 'mode' input is not specified`);
    }

    if (!this.input.githubToken) {
      throw new Error(`The 'github-token' input is not specified`);
    }

    if (!this.input.cloud) {
      throw new Error(`The 'cloud' input is not specified`);
    }

    if (!this.input.cloud === 'aws' || !this.input.cloud === 'azure') {
      throw new Error(`Currently only support aws and azure`);
    }

    if (this.input.mode === 'start') {
      if (this.input.cloud === 'aws') {
        if (!this.input.ec2ImageId || !this.input.ec2InstanceType || !this.input.subnetId || !this.input.securityGroupId) {
          throw new Error(`Not all the required inputs are provided for the 'start' mode in aws`);
        }
      }
      else if (this.input.cloud === 'azure') {
        if (!this.input.azureLocation || !this.input.azureSubscriptionId || !this.input.azureVMSize 
          || !this.input.azureResourceGroup || !this.input.azureSubnetId || !this.input.azureImageId
          || !this.input.azureTenantId || !this.input.azureClientId || !this.input.azureClientSecret) {
          throw new Error(`Not all the required inputs are provided for the 'start' mode in azure`);
        }
      }
    } else if (this.input.mode === 'stop') {
      if (!this.input.label || !this.input.instanceId) {
        throw new Error(`label or instanceId not provided for the 'stop' mode`);
      }
      if (this.input.cloud === 'azure') {
        if (!this.input.azureResourceGroup || !this.input.azureSubscriptionId 
          || !this.input.azureTenantId || !this.input.azureClientId || !this.input.azureClientSecret) {
          throw new Error(`Not all the required inputs are provided for the 'stop' mode in azure`);
        }
      }
    } else {
      throw new Error('Wrong mode. Allowed values: start, stop.');
    }
  }

  generateUniqueLabel() {
    return Math.random().toString(36).substr(2, 5);
  }

  // User data scripts are run as the root user
  buildUserDataScript(githubRegistrationToken, label) {
    if (this.input.runnerHomeDir) {
      // If runner home directory is specified, we expect the actions-runner software (and dependencies)
      // to be pre-installed in the AMI, so we simply cd into that directory and then start the runner
      return [
        '#!/bin/bash',
        `cd "${this.input.runnerHomeDir}"`,
        'export RUNNER_ALLOW_RUNASROOT=1',
        `./config.sh --url https://github.com/${this.githubContext.owner}/${this.githubContext.repo} --token ${githubRegistrationToken} --labels ${label}`,
        './run.sh',
      ];
    } else {
      return [
        '#!/bin/bash',
        'mkdir actions-runner && cd actions-runner',
        'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
        'curl -O -L https://github.com/actions/runner/releases/download/v2.286.0/actions-runner-linux-${RUNNER_ARCH}-2.286.0.tar.gz',
        'tar xzf ./actions-runner-linux-${RUNNER_ARCH}-2.286.0.tar.gz',
        'export RUNNER_ALLOW_RUNASROOT=1',
        `./config.sh --url https://github.com/${this.githubContext.owner}/${this.githubContext.repo} --token ${githubRegistrationToken} --labels ${label}`,
        './run.sh',
      ];
    }
  }
}

try {
  module.exports = new Config();
} catch (error) {
  core.error(error);
  core.setFailed(error.message);
}
