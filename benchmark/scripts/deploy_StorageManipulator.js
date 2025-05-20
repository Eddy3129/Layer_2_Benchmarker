const hre = require("hardhat");

async function main() {
  const StorageManipulator = await hre.ethers.getContractFactory("StorageManipulator");
  const storageManipulator = await StorageManipulator.deploy();

  await storageManipulator.waitForDeployment();

  console.log(`StorageManipulator deployed to: ${await storageManipulator.getAddress()} on network ${hre.network.name}`);
  // Optional: Verify contract
  // await hre.run("verify:verify", { address: await storageManipulator.getAddress(), constructorArguments: [] });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});