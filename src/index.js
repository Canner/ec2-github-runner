const aws = require('./aws');
const azure = require('./azure');
const gh = require('./gh');
const config = require('./config');
const core = require('@actions/core');
const { backOff } = require('exponential-backoff');

function setOutput(label, instanceId) {
  core.setOutput('label', label);
  core.setOutput('instance-id', instanceId);
}

async function startEc2() {
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

async function stopEc2() {
  await aws.terminateEc2Instance();
  await gh.removeRunner();
}

async function startAzure() {
  const githubRegistrationToken = await gh.getRegistrationToken();
  const label = config.generateUniqueLabel();
  var instanceId;
  try {
    instanceId = await azure.startInstance(label, githubRegistrationToken);
    setOutput(label, instanceId);
    await gh.waitForRunnerRegistered(label);
  }
  catch (error) {
    core.error(`Start azure instance failed ${error}`);
    await azure.terminateInstanceById(instanceId);
    throw error;
  }
}

async function stopAzure() {
  await azure.terminateInstance();
  await gh.removeRunner();
}

(async function () {
  try {
    var exec;
    if (config.input.cloud === 'aws') {
      exec = () => (config.input.mode === 'start' ? startEc2() : stopEc2())
    }
    else if (config.input.cloud === 'azure') {
      exec = () => (config.input.mode === 'start' ? startAzure() : stopAzure())
    }
    await backOff(exec, { numOfAttempts: config.input.maxAttempts, delayFirstAttempt: true, startingDelay: 1000 });
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
})();
