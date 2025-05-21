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
const ETH_PRICE_USD = 2500; // Example: For illustrative USD cost, update with a current market estimate if desired

// ERC20 Transfers
const NUM_TRANSACTIONS_ERC20 = 15;
const ERC20_CHUNK_SIZE = 1;
const ERC20_DELAY_BETWEEN_CHUNKS_MS = 2000;
const ERC20_TRANSFER_AMOUNT = hre.ethers.parseUnits("0.0001", 18);

// Storage Writes
const NUM_TRANSACTIONS_STORAGE_WRITE = 10;
const STORAGE_WRITE_CHUNK_SIZE = 1;
const STORAGE_WRITE_DELAY_BETWEEN_CHUNKS_MS = 3000;

// Complex Calls
const NUM_TRANSACTIONS_COMPLEX_CALL = 8;
const COMPLEX_CALL_CHUNK_SIZE = 1;
const COMPLEX_CALL_DELAY_BETWEEN_CHUNKS_MS = 5000;
const COMPLEX_CALL_ITERATIONS = 50;

// Gas Limits
const GAS_LIMIT_ERC20 = 300000;
const GAS_LIMIT_STORAGE_WRITE = 300000;
const GAS_LIMIT_COMPLEX_CALL = 1000000;

// --- HELPER TO LOG RESULTS (UPDATED) ---
function logResult(networkName, benchmarkName, run, successfulTx, totalTx, durationSeconds, avgGasUsed, avggasPrice, avgTotalFeeWei, details = "") {
    const tps = successfulTx > 0 && durationSeconds > 0 ? (successfulTx / durationSeconds) : 0;
    const avgTotalFeeEth = hre.ethers.formatEther(avgTotalFeeWei);
    const avgTotalFeeUsd = (parseFloat(avgTotalFeeEth) * ETH_PRICE_USD).toFixed(4);
    const avggasPriceGwei = hre.ethers.formatUnits(avggasPrice, "gwei");

    const consoleMessage = `${benchmarkName} (Run ${run}) - Success: ${successfulTx}/${totalTx}, Duration: ${durationSeconds.toFixed(2)}s, TPS: ${tps.toFixed(2)}, AvgGasUsed: ${avgGasUsed}, AvgEffGasPrice: ${avggasPriceGwei} Gwei, AvgFee: ${avgTotalFeeEth} ETH ($${avgTotalFeeUsd}) ${details}`;
    console.log(`    ${consoleMessage}`);

    const fileMessage = `Run ${run}: ${benchmarkName} - Success: ${successfulTx}/${totalTx}, Duration: ${durationSeconds.toFixed(2)}s, TPS: ${tps.toFixed(2)}, AvgGasUsed: ${avgGasUsed}, AvgEffGasPrice(Wei): ${avggasPrice.toString()}, AvgEffGasPrice(Gwei): ${avggasPriceGwei}, AvgTotalFee(Wei): ${avgTotalFeeWei.toString()}, AvgTotalFee(ETH): ${avgTotalFeeEth} ($${avgTotalFeeUsd}) ${details}\n`;
    fs.appendFileSync('benchmark_results.log', `Network: ${networkName}, ${fileMessage}`);
}

// --- GENERIC CHUNK PROCESSOR (Ensures it returns full receipt objects) ---
async function processInChunks(totalTransactions, chunkSize, delayBetweenChunksMs, taskFunction, currentRun, progressCallback) {
    let allTransactionReceipts = []; // Will store full receipt objects or error indicators
    let processedCount = 0;

    for (let i = 0; i < totalTransactions; i += chunkSize) {
        const currentChunkPromises = [];
        const currentChunkEnd = Math.min(i + chunkSize, totalTransactions);

        for (let j = i; j < currentChunkEnd; j++) {
            currentChunkPromises.push(taskFunction(j, currentRun)); // taskFunction should return the receipt or an error object
        }

        const chunkResults = await Promise.allSettled(currentChunkPromises);
        chunkResults.forEach(result => {
            if (result.status === 'fulfilled') {
                allTransactionReceipts.push(result.value); // This is either a receipt or our error object {status:0, error}
            } else { // Should ideally not happen if taskFunction catches its own errors
                allTransactionReceipts.push({ status: 0, error: result.reason });
            }
        });

        processedCount += currentChunkPromises.length;
        if (progressCallback) { progressCallback(processedCount, totalTransactions); }
        if (currentChunkEnd < totalTransactions) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenChunksMs));
        }
    }
    return allTransactionReceipts; // Returns an array of receipts or error objects
}

// --- BENCHMARK FUNCTIONS (UPDATED TO CALCULATE AND PASS FEE DATA) ---

async function benchmarkERC20Transfers(networkName, contractAddress, run) {
    if (!contractAddress) { /* ... (skip message as before) ... */ return; }
    const [signer] = await hre.ethers.getSigners();
    const myERC20 = await hre.ethers.getContractAt("MyERC20", contractAddress, signer);
    const recipient = hre.ethers.Wallet.createRandom().address;

    const taskFunction = async (overallIndex, currentRunNumber) => {
        try {
            const tx = await myERC20.transfer(recipient, ERC20_TRANSFER_AMOUNT, { gasLimit: GAS_LIMIT_ERC20 });
            return await tx.wait(); // Returns the transaction receipt on success
        } catch (e) {
            // console.warn(`ERC20 Transfer Error: ${e.message}`);
            return { status: 0, error: e }; // Return an error-like object for failed sends/waits
        }
    };

    const startTime = performance.now();
    const receipts = await processInChunks(NUM_TRANSACTIONS_ERC20, ERC20_CHUNK_SIZE, ERC20_DELAY_BETWEEN_CHUNKS_MS, taskFunction, run);
    const endTime = performance.now();
    const durationSeconds = (endTime - startTime) / 1000;

    let successfulTx = 0;
    let totalGasUsed = BigInt(0);
    let totalgasPrice = BigInt(0);
    let totalFee = BigInt(0);

    receipts.forEach(receipt => {
        if (receipt && receipt.status === 1) { // Successful transaction
            successfulTx++;
            const gasUsed = receipt.gasUsed ? BigInt(receipt.gasUsed.toString()) : BigInt(0);
            const gasPrice = receipt.gasPrice ? BigInt(receipt.gasPrice.toString()) : BigInt(0);
            totalGasUsed += gasUsed;
            totalgasPrice += gasPrice;
            totalFee += gasUsed * gasPrice;
        }
    });

    const avgGasUsed = successfulTx > 0 ? (totalGasUsed / BigInt(successfulTx)).toString() : "0";
    const avggasPrice = successfulTx > 0 ? (totalgasPrice / BigInt(successfulTx)) : BigInt(0);
    const avgTotalFeeWei = successfulTx > 0 ? (totalFee / BigInt(successfulTx)) : BigInt(0);

    logResult(networkName, "ERC20 Transfers", run, successfulTx, NUM_TRANSACTIONS_ERC20, durationSeconds, avgGasUsed, avggasPrice, avgTotalFeeWei);
}

async function benchmarkStorageWrites(networkName, contractAddress, run) {
    if (!contractAddress) { /* ... (skip message as before) ... */ return; }
    const [signer] = await hre.ethers.getSigners();
    const storageManipulator = await hre.ethers.getContractAt("StorageManipulator", contractAddress, signer);

    const taskFunction = async (overallIndex, currentRunNumber) => {
        try {
            const tx = await storageManipulator.writeData(overallIndex + (currentRunNumber * NUM_TRANSACTIONS_STORAGE_WRITE), `Run${currentRunNumber}Item${overallIndex}`, { gasLimit: GAS_LIMIT_STORAGE_WRITE });
            return await tx.wait();
        } catch (e) {
            // console.warn(`Storage Write Error: ${e.message}`);
            return { status: 0, error: e };
        }
    };

    const startTime = performance.now();
    const receipts = await processInChunks(NUM_TRANSACTIONS_STORAGE_WRITE, STORAGE_WRITE_CHUNK_SIZE, STORAGE_WRITE_DELAY_BETWEEN_CHUNKS_MS, taskFunction, run);
    const endTime = performance.now();
    const durationSeconds = (endTime - startTime) / 1000;

    let successfulTx = 0;
    let totalGasUsed = BigInt(0);
    let totalgasPrice = BigInt(0);
    let totalFee = BigInt(0);

    receipts.forEach(receipt => {
        if (receipt && receipt.status === 1) {
            successfulTx++;
            const gasUsed = receipt.gasUsed ? BigInt(receipt.gasUsed.toString()) : BigInt(0);
            const gasPrice = receipt.gasPrice ? BigInt(receipt.gasPrice.toString()) : BigInt(0);
            totalGasUsed += gasUsed;
            totalgasPrice += gasPrice;
            totalFee += gasUsed * gasPrice;
        }
    });

    const avgGasUsed = successfulTx > 0 ? (totalGasUsed / BigInt(successfulTx)).toString() : "0";
    const avggasPrice = successfulTx > 0 ? (totalgasPrice / BigInt(successfulTx)) : BigInt(0);
    const avgTotalFeeWei = successfulTx > 0 ? (totalFee / BigInt(successfulTx)) : BigInt(0);

    logResult(networkName, "Storage Writes", run, successfulTx, NUM_TRANSACTIONS_STORAGE_WRITE, durationSeconds, avgGasUsed, avggasPrice, avgTotalFeeWei);
}

async function benchmarkComplexCalls(networkName, contractAddress, run) {
    if (!contractAddress) { /* ... (skip message as before) ... */ return; }
    const [signer] = await hre.ethers.getSigners();
    const storageManipulator = await hre.ethers.getContractAt("StorageManipulator", contractAddress, signer);

    const taskFunction = async (overallIndex, currentRunNumber) => {
        const a_val = 10 + overallIndex + (currentRunNumber * 5);
        const b_val = 20 + overallIndex + (currentRunNumber * 5);
        try {
            const tx = await storageManipulator.performComplexCalculation(a_val, b_val, COMPLEX_CALL_ITERATIONS, { gasLimit: GAS_LIMIT_COMPLEX_CALL });
            return await tx.wait();
        } catch (e) {
            // console.warn(`Complex Call Error: ${e.message}`);
            return { status: 0, error: e };
        }
    };

    const startTime = performance.now();
    const receipts = await processInChunks(NUM_TRANSACTIONS_COMPLEX_CALL, COMPLEX_CALL_CHUNK_SIZE, COMPLEX_CALL_DELAY_BETWEEN_CHUNKS_MS, taskFunction, run);
    const endTime = performance.now();
    const durationSeconds = (endTime - startTime) / 1000;

    let successfulTx = 0;
    let totalGasUsed = BigInt(0);
    let totalgasPrice = BigInt(0);
    let totalFee = BigInt(0);

    receipts.forEach(receipt => {
        if (receipt && receipt.status === 1) {
            successfulTx++;
            const gasUsed = receipt.gasUsed ? BigInt(receipt.gasUsed.toString()) : BigInt(0);
            const gasPrice = receipt.gasPrice ? BigInt(receipt.gasPrice.toString()) : BigInt(0);
            totalGasUsed += gasUsed;
            totalgasPrice += gasPrice;
            totalFee += gasUsed * gasPrice;
        }
    });

    const avgGasUsed = successfulTx > 0 ? (totalGasUsed / BigInt(successfulTx)).toString() : "0";
    const avggasPrice = successfulTx > 0 ? (totalgasPrice / BigInt(successfulTx)) : BigInt(0);
    const avgTotalFeeWei = successfulTx > 0 ? (totalFee / BigInt(successfulTx)) : BigInt(0);

    logResult(networkName, "Complex Calls", run, successfulTx, NUM_TRANSACTIONS_COMPLEX_CALL, durationSeconds, avgGasUsed, avggasPrice, avgTotalFeeWei);
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

    for (let run = 1; run <= NUM_RUNS; run++) {
        console.log(`  Executing Run ${run}/${NUM_RUNS} for all benchmarks on ${networkName}...`);
        fs.appendFileSync('benchmark_results.log', `\n  --- Run ${run}/${NUM_RUNS} on ${networkName} (EXTREME THROTTLING) ---\n`);

        console.log(`  [${networkName}] Running ERC20 Transfer Benchmark...`);
        await benchmarkERC20Transfers(networkName, erc20Address, run);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Pause between benchmark types

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