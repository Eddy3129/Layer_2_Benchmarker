const hre = require("hardhat");
const fs = require('fs'); // For logging to a file

// --- CONFIGURATION ---
const L2_NETWORK_NAME = hre.network.name; // Gets network from --network flag
const CONTRACT_ADDRESS_ERC20 = "YOUR_DEPLOYED_MyERC20_ADDRESS_ON_THIS_NETWORK";
const CONTRACT_ADDRESS_STORAGE = "YOUR_DEPLOYED_StorageManipulator_ADDRESS_ON_THIS_NETWORK";
const NUM_TRANSACTIONS = 100; // Number of transactions in a batch
const NUM_RUNS = 3; // Number of times to run the benchmark scenario

async function benchmarkERC20Transfers() {
    const [signer] = await hre.ethers.getSigners();
    const myERC20 = await hre.ethers.getContractAt("MyERC20", CONTRACT_ADDRESS_ERC20, signer);
    const recipient = hre.ethers.Wallet.createRandom().address; // Send to a random address
    const amount = hre.ethers.parseUnits("1", 18); // Transfer 1 token

    console.log(`\n[${L2_NETWORK_NAME}] Starting ERC20 Transfer Benchmark (${NUM_TRANSACTIONS} txs, ${NUM_RUNS} runs)...`);
    let logData = `Network: ${L2_NETWORK_NAME}, Benchmark: ERC20 Transfers\n`;

    for (let run = 1; run <= NUM_RUNS; run++) {
        console.log(`  Run ${run}/${NUM_RUNS}`);
        const transactions = [];
        const startTime = performance.now();

        for (let i = 0; i < NUM_TRANSACTIONS; i++) {
            transactions.push(myERC20.transfer(recipient, amount, { gasLimit: 300000 })); // Set a reasonable gasLimit
        }

        const results = await Promise.allSettled(transactions.map(txPromise => txPromise.then(tx => tx.wait()))); // Wait for all txs to be mined

        const endTime = performance.now();
        const durationSeconds = (endTime - startTime) / 1000;
        const tps = NUM_TRANSACTIONS / durationSeconds;

        let successfulTx = 0;
        let totalGasUsed = BigInt(0);
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value && result.value.status === 1) {
                successfulTx++;
                if (result.value.gasUsed) {
                    totalGasUsed += BigInt(result.value.gasUsed.toString());
                }
            }
        });
        const avgGasUsed = successfulTx > 0 ? (totalGasUsed / BigInt(successfulTx)).toString() : "0";

        console.log(`    Completed: ${successfulTx}/${NUM_TRANSACTIONS} successful. Duration: ${durationSeconds.toFixed(2)}s. TPS: ${tps.toFixed(2)}. Avg Gas: ${avgGasUsed}`);
        logData += `Run ${run}: Success: ${successfulTx}/${NUM_TRANSACTIONS}, Duration: ${durationSeconds.toFixed(2)}s, TPS: ${tps.toFixed(2)}, Avg Gas: ${avgGasUsed}\n`;
    }
    fs.appendFileSync('benchmark_results.log', logData + "\n");
}

// Add other benchmark functions like benchmarkStorageWrites, benchmarkComplexCalls etc.

async function main() {
    // Replace with actual deployed addresses for the current network
    if (L2_NETWORK_NAME === "arbitrumSepolia") {
        // CONTRACT_ADDRESS_ERC20 = "0xDeployedOnArbitrumSepolia";
        // CONTRACT_ADDRESS_STORAGE = "0xDeployedStorageOnArbitrumSepolia";
    } else if (L2_NETWORK_NAME === "polygonZkEVMTestnet") {
        // CONTRACT_ADDRESS_ERC20 = "0xDeployedOnPolygonZkEVM";
        // ...
    } // Add other networks

    // Ensure addresses are set before running benchmarks
    if (!CONTRACT_ADDRESS_ERC20.startsWith("0x") || !CONTRACT_ADDRESS_STORAGE.startsWith("0x")) {
        console.error(`ERROR: Contract addresses for network ${L2_NETWORK_NAME} are not set in the script. Please update them.`);
        process.exit(1);
    }

    await benchmarkERC20Transfers();
    // await benchmarkStorageWrites(); // Call other benchmarks
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
    fs.appendFileSync('benchmark_results.log', `Error on ${L2_NETWORK_NAME}: ${error.message}\n\n`);
});