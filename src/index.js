const aws = require('./aws');
const gh = require('./gh');
const config = require('./config');
const core = require('@actions/core');
const { backOff } = require('exponential-backoff');

function setOutput(label, ec2InstanceId) {
  core.setOutput('label', label);
  core.setOutput('ec2-instance-id', ec2InstanceId);
}

async function start() {
  const label = config.generateUniqueLabel();
  const githubRegistrationToken = await gh.getRegistrationToken();
  const ec2InstanceId = await aws.startEc2Instance(label, githubRegistrationToken);
  setOutput(label, ec2InstanceId);

  try {
    await aws.waitForInstanceRunning(ec2InstanceId);
    await gh.waitForRunnerRegistered(label);
  }
  catch (error) {
    await aws.terminateEc2InstanceById(ec2InstanceId);
    throw error;
  }
}

async function stop() {
  await aws.terminateEc2Instance();
  await gh.removeRunner();
}

(async function () {
  try {
    const exec = () => (config.input.mode === 'start' ? start() : stop());
    await backOff(exec, { numOfAttempts: config.input.maxAttempts, delayFirstAttempt: true, startingDelay: 1000 });
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
})();
