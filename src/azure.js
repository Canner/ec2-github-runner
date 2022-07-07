const { ComputeManagementClient } = require("@azure/arm-compute");
const { ClientSecretCredential } = require("@azure/identity");
const { NetworkManagementClient } = require("@azure/arm-network");
const core = require('@actions/core');
const config = require('./config');
const generateRandomId = (prefix) => {
  return prefix + config.generateUniqueLabel();
};

// TODO: find a way to use github action azure/login by using OIDC
// instead of setting tenantId, clientId and secret here
function getCredential() {
  return new ClientSecretCredential(
    config.input.azureTenantId, 
    config.input.azureClientId, 
    config.input.azureClientSecret);
}

async function createNIC(networkInterfaceName) {
  core.info("Creating Network Interface: " + networkInterfaceName);
  const networkClient = new NetworkManagementClient(
    getCredential(), config.input.azureSubscriptionId);
  const nicParameters = {
    location: config.input.azureLocation,
    enableAcceleratedNetworking: true,
    ipConfigurations: [
      {
        name: networkInterfaceName,
        privateIPAllocationMethod: "Dynamic",
        subnet: {
          id: config.input.azureSubnetId,
        },
      },
    ],
  };
  const createdNIC = await networkClient.networkInterfaces.beginCreateOrUpdateAndWait(
    config.input.azureResourceGroup,
    networkInterfaceName,
    nicParameters,
  );
  core.info('Create NIC response: ' + JSON.stringify(createdNIC));
  // return network interface info
  return await networkClient.networkInterfaces.get(
    config.input.azureResourceGroup,
    networkInterfaceName,
  );
}

async function deleteNIC(networkInterfaceName) {
  core.info("Deleting Network Interface: " + networkInterfaceName);
  const networkClient = new NetworkManagementClient(
    getCredential(), config.input.azureSubscriptionId);
  return await networkClient.networkInterfaces.beginDeleteAndWait(
    config.input.azureResourceGroup,
    networkInterfaceName,
  );
}

async function startInstance(label, githubRegistrationToken) {
  const vmName = generateRandomId('github-runner-');
  const createdNICInfo = await createNIC(vmName);
  core.info('Created NIC info ' + JSON.stringify(createdNICInfo));

  const userData = config.buildUserDataScript(githubRegistrationToken, label);
  const parameter = {
    location: config.input.azureLocation,
    userData: Buffer.from(userData.join('\n')).toString('base64'),
    tags: config.azureTags,
    hardwareProfile: {
      vmSize: config.input.azureVMSize,
    },
    storageProfile: {
      imageReference: {
        id: config.input.azureImageId
      },
      osDisk: {
        name: vmName,
        caching: 'ReadWrite',
        managedDisk: {
          storageAccountType: 'Standard_LRS'
        },
        diskSizeGB: config.input.azureVMDiskSizeInGB,
        createOption: 'FromImage',
        deleteOption: 'Delete',
      },
    },
    // TODO: use specialized image, which make start vm faster,
    // and no need to setup osProfile
    osProfile: {
      adminUsername: 'azureuser',
      computerName: vmName,
      adminPassword: 'Canner@2022-' + generateRandomId(),
      linuxConfiguration: {
        provisionVMAgent: true,
        patchSettings: {
          assessmentMode: "ImageDefault"
        }
      }
    },
    networkProfile: {
      networkInterfaces: [
        {
          id: createdNICInfo.id,
          primary: true,
          deleteOption: 'Delete',
        }
      ]
    },
  };
  try {
    const computeClient = new ComputeManagementClient(
      getCredential(), config.input.azureSubscriptionId);
    await computeClient.virtualMachines
      .beginCreateOrUpdateAndWait(
        config.input.azureResourceGroup,
        vmName,
        parameter,
      )
      .then((response) => core.info("Create vm done. " + JSON.stringify(response)));
  } catch(error) {
    core.error(`start azure vm failed ${error}`);
    // delete nic if create vm failed
    await deleteNIC(vmName);
    throw error;
  }
  return vmName;
}

async function terminateInstanceById(instanceId) {
  const computeClient = new ComputeManagementClient(
    getCredential(), config.input.azureSubscriptionId);
  await computeClient.virtualMachines
    .beginDeleteAndWait(config.input.azureResourceGroup, instanceId)
    .then((response) => {
      core.info(JSON.stringify(response));
    });
}

async function terminateInstance() {
  await terminateInstanceById(config.input.instanceId);
}

module.exports = {
  startInstance,
  terminateInstance,
  terminateInstanceById,
};
