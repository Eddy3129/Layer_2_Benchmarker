const hre = require("hardhat");

async function main() {
  const initialSupply = hre.ethers.parseUnits("1000000", 18); // 1 Million tokens

  const MyERC20 = await hre.ethers.getContractFactory("MyERC20");
  const myERC20 = await MyERC20.deploy(initialSupply);

  await myERC20.waitForDeployment(); // Use this instead of .deployed()

  console.log(`MyERC20 deployed to: ${await myERC20.getAddress()} on network ${hre.network.name}`);
  // Optional: Verify contract on Etherscan/L2Scan
  // await hre.run("verify:verify", { address: await myERC20.getAddress(), constructorArguments: [initialSupply] });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});