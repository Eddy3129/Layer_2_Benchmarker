const hre = require("hardhat");
const fs = require('fs');

let deployedAddresses;
try {
    deployedAddresses = require('../deployed_address.json');
} catch (error) {
    console.error(`ERROR: Could not load ${deployedAddressesPath}. Make sure the file exists in the project root.`);
    console.error("Please create it with your deployed contract addresses for each network, e.g.:");
    console.error(`{ "arbitrumSepolia": { "MyERC20": "0x...", "StorageManipulator": "0x..." }, ... }`);
    process.exit(1);
}


// --- BENCHMARK CONFIGURATION (EXTREME THROTTLING) ---
// General
const NUM_RUNS = 3; // Number of times to run each benchmark scenario

// ERC20 Transfers
const NUM_TRANSACTIONS_ERC20 = 15; // Reduced
const ERC20_CHUNK_SIZE = 1;       // Process 1 transaction at a time
const ERC20_DELAY_BETWEEN_CHUNKS_MS = 2000; // 2 seconds delay BETWEEN EACH TRANSACTION
const ERC20_TRANSFER_AMOUNT = hre.ethers.parseUnits("0.0001", 18); // Very small amount

// Storage Writes
const NUM_TRANSACTIONS_STORAGE_WRITE = 10; // Reduced
const STORAGE_WRITE_CHUNK_SIZE = 1;          // Process 1 transaction at a time
const STORAGE_WRITE_DELAY_BETWEEN_CHUNKS_MS = 3000; // 3 seconds delay BETWEEN EACH TRANSACTION

// Complex Calls
const NUM_TRANSACTIONS_COMPLEX_CALL = 8; // Reduced
const COMPLEX_CALL_CHUNK_SIZE = 1;         // Process 1 transaction at a time
const COMPLEX_CALL_DELAY_BETWEEN_CHUNKS_MS = 5000; // 5 seconds delay BETWEEN EACH TRANSACTION
const COMPLEX_CALL_ITERATIONS = 50; // Reduced iterations for the call itself

// Gas Limits (adjust if needed, but make them generous enough)
const GAS_LIMIT_ERC20 = 300000;
const GAS_LIMIT_STORAGE_WRITE = 300000;
const GAS_LIMIT_COMPLEX_CALL = 1000000;

// --- HELPER TO LOG RESULTS ---
function logResult(networkName, benchmarkName, run, successfulTx, totalTx, durationSeconds, avgGasUsed, details = "") {
    const tps = successfulTx > 0 && durationSeconds > 0 ? (successfulTx / durationSeconds) : 0;
    const message = `Run ${run}: ${benchmarkName} - Success: ${successfulTx}/${totalTx}, Duration: ${durationSeconds.toFixed(2)}s, TPS: ${tps.toFixed(2)}, Avg Gas: ${avgGasUsed} ${details}\n`;
    const consoleMessage = `${benchmarkName} (Run ${run}) - Success: ${successfulTx}/${totalTx}, Duration: ${durationSeconds.toFixed(2)}s, TPS: ${tps.toFixed(2)}, Avg Gas: ${avgGasUsed} ${details}`;
    console.log(`    ${consoleMessage}`);
    fs.appendFileSync('benchmark_results.log', `Network: ${networkName}, ${message}`);
}

// --- GENERIC CHUNK PROCESSOR ---
// (taskFunction now also receives the current run number)
async function processInChunks(totalTransactions, chunkSize, delayBetweenChunksMs, taskFunction, currentRun, progressCallback) {
    let allResults = [];
    let processedCount = 0;

    for (let i = 0; i < totalTransactions; i += chunkSize) {
        const currentChunkPromises = [];
        const currentChunkEnd = Math.min(i + chunkSize, totalTransactions);

        for (let j = i; j < currentChunkEnd; j++) {
            // Pass both the overall index 'j' and the 'currentRun' to taskFunction
            currentChunkPromises.push(taskFunction(j, currentRun));
        }

        const chunkResults = await Promise.allSettled(currentChunkPromises);
        allResults = allResults.concat(chunkResults);
        processedCount += currentChunkPromises.length;

        if (progressCallback) {
            progressCallback(processedCount, totalTransactions);
        }

        if (currentChunkEnd < totalTransactions) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenChunksMs));
        }
    }
    return allResults;
}


// --- BENCHMARK FUNCTIONS ---

async function benchmarkERC20Transfers(networkName, contractAddress, run) {
    if (!contractAddress) {
        const skipMsg = `Skipping ERC20 Transfers: MyERC20 address not configured for ${networkName}.`;
        console.log(`  [${networkName}] ${skipMsg}`);
        fs.appendFileSync('benchmark_results.log', `Network: ${networkName}, ${skipMsg}\n`);
        return;
    }
    const [signer] = await hre.ethers.getSigners();
    const myERC20 = await hre.ethers.getContractAt("MyERC20", contractAddress, signer);
    const recipient = hre.ethers.Wallet.createRandom().address;

    // taskFunction now accepts 'overallIndex' and 'currentRunNumber'
    const taskFunction = async (overallIndex, currentRunNumber) => {
        return myERC20.transfer(recipient, ERC20_TRANSFER_AMOUNT, { gasLimit: GAS_LIMIT_ERC20 })
            .then(tx => tx.wait())
            .catch(e => ({ status: 0, error: e, gasUsed: BigInt(0) }));
    };

    const startTime = performance.now();
    // Pass the current 'run' number to processInChunks, which then passes it to taskFunction
    const results = await processInChunks(NUM_TRANSACTIONS_ERC20, ERC20_CHUNK_SIZE, ERC20_DELAY_BETWEEN_CHUNKS_MS, taskFunction, run);
    const endTime = performance.now();
    const durationSeconds = (endTime - startTime) / 1000;

    let successfulTx = 0;
    let totalGasUsed = BigInt(0);
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value && result.value.status === 1) {
            successfulTx++;
            if (result.value.gasUsed) { totalGasUsed += BigInt(result.value.gasUsed.toString()); }
        }
    });
    const avgGasUsed = successfulTx > 0 ? (totalGasUsed / BigInt(successfulTx)).toString() : "0";
    logResult(networkName, "ERC20 Transfers", run, successfulTx, NUM_TRANSACTIONS_ERC20, durationSeconds, avgGasUsed);
}

async function benchmarkStorageWrites(networkName, contractAddress, run) {
    if (!contractAddress) {
        const skipMsg = `Skipping Storage Writes: StorageManipulator address not configured for ${networkName}.`;
        console.log(`  [${networkName}] ${skipMsg}`);
        fs.appendFileSync('benchmark_results.log', `Network: ${networkName}, ${skipMsg}\n`);
        return;
    }
    const [signer] = await hre.ethers.getSigners();
    const storageManipulator = await hre.ethers.getContractAt("StorageManipulator", contractAddress, signer);

    const taskFunction = async (overallIndex, currentRunNumber) => {
        // Use currentRunNumber for unique data
        return storageManipulator.writeData(overallIndex + (currentRunNumber * NUM_TRANSACTIONS_STORAGE_WRITE), `Run${currentRunNumber}Item${overallIndex}`, { gasLimit: GAS_LIMIT_STORAGE_WRITE })
            .then(tx => tx.wait())
            .catch(e => ({ status: 0, error: e, gasUsed: BigInt(0) }));
    };

    const startTime = performance.now();
    const results = await processInChunks(NUM_TRANSACTIONS_STORAGE_WRITE, STORAGE_WRITE_CHUNK_SIZE, STORAGE_WRITE_DELAY_BETWEEN_CHUNKS_MS, taskFunction, run);
    const endTime = performance.now();
    const durationSeconds = (endTime - startTime) / 1000;

    let successfulTx = 0;
    let totalGasUsed = BigInt(0);
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value && result.value.status === 1) {
            successfulTx++;
            if (result.value.gasUsed) { totalGasUsed += BigInt(result.value.gasUsed.toString()); }
        }
    });
    const avgGasUsed = successfulTx > 0 ? (totalGasUsed / BigInt(successfulTx)).toString() : "0";
    logResult(networkName, "Storage Writes", run, successfulTx, NUM_TRANSACTIONS_STORAGE_WRITE, durationSeconds, avgGasUsed);
}

async function benchmarkComplexCalls(networkName, contractAddress, run) {
    if (!contractAddress) {
        const skipMsg = `Skipping Complex Calls: StorageManipulator address not configured for ${networkName}.`;
        console.log(`  [${networkName}] ${skipMsg}`);
        fs.appendFileSync('benchmark_results.log', `Network: ${networkName}, ${skipMsg}\n`);
        return;
    }
    const [signer] = await hre.ethers.getSigners();
    const storageManipulator = await hre.ethers.getContractAt("StorageManipulator", contractAddress, signer);

    const taskFunction = async (overallIndex, currentRunNumber) => {
        const a_val = 10 + overallIndex + (currentRunNumber * 5); // Adjusted for fewer txs
        const b_val = 20 + overallIndex + (currentRunNumber * 5);
        return storageManipulator.performComplexCalculation(a_val, b_val, COMPLEX_CALL_ITERATIONS, { gasLimit: GAS_LIMIT_COMPLEX_CALL })
            .then(tx => tx.wait())
            .catch(e => ({ status: 0, error: e, gasUsed: BigInt(0) }));
    };

    const startTime = performance.now();
    const results = await processInChunks(NUM_TRANSACTIONS_COMPLEX_CALL, COMPLEX_CALL_CHUNK_SIZE, COMPLEX_CALL_DELAY_BETWEEN_CHUNKS_MS, taskFunction, run);
    const endTime = performance.now();
    const durationSeconds = (endTime - startTime) / 1000;

    let successfulTx = 0;
    let totalGasUsed = BigInt(0);
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value && result.value.status === 1) {
            successfulTx++;
            if (result.value.gasUsed) { totalGasUsed += BigInt(result.value.gasUsed.toString()); }
        }
    });
    const avgGasUsed = successfulTx > 0 ? (totalGasUsed / BigInt(successfulTx)).toString() : "0";
    logResult(networkName, "Complex Calls", run, successfulTx, NUM_TRANSACTIONS_COMPLEX_CALL, durationSeconds, avgGasUsed);
}


// --- MAIN EXECUTION ---
async function main() {
    const networkName = hre.network.name;
    console.log(`\nStarting all benchmarks with EXTREME THROTTLING for network: ${networkName}`);
    fs.appendFileSync('benchmark_results.log', `\n==== Starting All Benchmarks (EXTREME THROTTLING) for ${networkName} at ${new Date().toISOString()} ====\n`);

    const addressesForNetwork = deployedAddresses[networkName];
    if (!addressesForNetwork) {
        const errorMsg = `ERROR: No deployed addresses found for network "${networkName}" in deployed_addresses.json`;
        console.error(errorMsg);
        fs.appendFileSync('benchmark_results.log', `ERROR: ${errorMsg}\n`);
        process.exit(1);
    }

    const erc20Address = addressesForNetwork.MyERC20;
    const storageManipulatorAddress = addressesForNetwork.StorageManipulator;

    // Optional: Isolate one benchmark type first for testing
    // console.log(`  [${networkName}] ISOLATED TEST: Running ERC20 Transfer Benchmark ONLY...`);
    // await benchmarkERC20Transfers(networkName, erc20Address, 1); // Test with only 1 run
    // console.log(`\nFinished ISOLATED TEST for network: ${networkName}`);
    // return; // Exit after isolated test

    for (let run = 1; run <= NUM_RUNS; run++) {
        console.log(`  Executing Run ${run}/${NUM_RUNS} for all benchmarks on ${networkName}...`);
        fs.appendFileSync('benchmark_results.log', `\n  --- Run ${run}/${NUM_RUNS} on ${networkName} (EXTREME THROTTLING) ---\n`);

        console.log(`  [${networkName}] Running ERC20 Transfer Benchmark...`);
        await benchmarkERC20Transfers(networkName, erc20Address, run);
        // Longer pause between different benchmark types if needed
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log(`  [${networkName}] Running Storage Write Benchmark...`);
        await benchmarkStorageWrites(networkName, storageManipulatorAddress, run);
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log(`  [${networkName}] Running Complex Call Benchmark...`);
        await benchmarkComplexCalls(networkName, storageManipulatorAddress, run);
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log(`  Finished Run ${run}/${NUM_RUNS} for ${networkName}.`);
    }

    console.log(`\nFinished all benchmarks (EXTREME THROTTLING) for network: ${networkName}`);
    fs.appendFileSync('benchmark_results.log', `==== Finished All Benchmarks (EXTREME THROTTLING) for ${networkName} at ${new Date().toISOString()} ====\n\n`);
}

main().catch((error) => {
    const networkName = hre.network.name || "unknown_network";
    console.error(`FATAL ERROR during benchmarks on ${networkName}:`, error);
    fs.appendFileSync('benchmark_results.log', `FATAL ERROR on ${networkName}: ${error.stack || error.message}\n\n`);
    process.exitCode = 1;
});