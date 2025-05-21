require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config(); // Loads variables from .env

// Read environment variables
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const UNIVERSAL_ETHERSCAN_API_KEY = process.env.UNIVERSAL_ETHERSCAN_API_KEY;

// Check if essential environment variables are set
if (!PRIVATE_KEY) {
  console.error("Please set your PRIVATE_KEY in a .env file");
  process.exit(1);
}
if (!ALCHEMY_API_KEY) {
  console.error("Please set your ALCHEMY_API_KEY in a .env file");
  process.exit(1);
}
if (!UNIVERSAL_ETHERSCAN_API_KEY) {
  console.warn("UNIVERSAL_ETHERSCAN_API_KEY is not set in .env. Contract verification might fail for all networks.");
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28", // Your specified Solidity version
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: { // Default local development network
      chainId: 1337,
    },
    // ===== L2 Testnets using Alchemy =====
    arbitrumSepolia: {
      url: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      chainId: 421614,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    polygonZkEVMTestnet: { // Polygon zkEVM Cardona Testnet
      url: `https://polygonzkevm-cardona.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      chainId: 2442,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    opSepolia: { // Optimism Sepolia Testnet
      url: `https://opt-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      chainId: 11155420,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    baseSepolia:{
      url: 'https://base-sepolia.g.alchemy.com/v2/pyPqVuQbXwVj3OYAWst9IY60uR3oSi1q',
      chainId: 84532,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    // ===== (Optional) L1 Testnet for reference using Alchemy =====
    sepolia: { // Ethereum Sepolia Testnet
        url: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
        chainId: 11155111,
        accounts: [`0x${PRIVATE_KEY}`],
    }
  },
  etherscan: {
    // Using a single universal API key for all Etherscan-compatible verifications.
    // The hardhat-etherscan plugin will use this key when interacting with the API endpoints
    // defined in customChains or its internal defaults for recognized networks.
    apiKey: UNIVERSAL_ETHERSCAN_API_KEY
  },
  customChains: [
    {
      network: "arbitrumSepolia", // Must match network name in `networks`
      chainId: 421614,
      urls: {
        apiURL: "https://api-sepolia.arbiscan.io/api", // Arbiscan API URL for Arbitrum Sepolia
        browserURL: "https://sepolia.arbiscan.io/"      // Arbiscan Browser URL
      }
    },
    {
      network: "polygonZkEVMTestnet", // Must match network name in `networks`
      chainId: 2442,
      urls: {
        apiURL: "https://api-cardona.zkevm-scan.com/api", // API URL for Polygon zkEVM Cardona Scan
        browserURL: "https://cardona.zkevm-scan.com/"     // Browser URL for Polygon zkEVM Cardona Scan
      }
    },
    {
        network: "opSepolia", // Must match network name in `networks`
        chainId: 11155420,
        urls: {
          apiURL: "https://api-sepolia-optimistic.etherscan.io/api", // Optimism Sepolia Etherscan API
          browserURL: "https://sepolia-optimism.etherscan.io/"      // Optimism Sepolia Etherscan URL
        }
    },
    { // Example for L1 Sepolia if you need to specify its Etherscan API explicitly
        network: "sepolia",
        chainId: 11155111,
        urls: {
            apiURL: "https://api-sepolia.etherscan.io/api",
            browserURL: "https://sepolia.etherscan.io"
        }
    }
  ],
  sourcify: { // Optional: For contract verification via Sourcify
    enabled: true // Set to false if you don't want to use Sourcify
  },
  gasReporter: { // Optional: useful for seeing gas costs of tests
    enabled: (process.env.REPORT_GAS === "true") ? true : false,
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY, // Optional: for USD conversion
    outputFile: "gas-report.txt",
    noColors: true,
  },
};