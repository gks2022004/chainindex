const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deploy Mock Tokens for testing (only on local/testnet)
  const network = hre.network.name;
  let mockTokens = {};
  
  if (network === "localhost" || network === "hardhat" || network === "sepolia") {
    console.log("\nDeploying mock tokens for testing...");
    
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    
    // Deploy WBTC mock
    const mockWBTC = await MockERC20.deploy("Wrapped Bitcoin", "WBTC", 8, 21000000);
  await mockWBTC.waitForDeployment();
  mockTokens.WBTC = await mockWBTC.getAddress();
  console.log("Mock WBTC deployed to:", mockTokens.WBTC);
    
    // Deploy USDC mock
    const mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6, 1000000000);
  await mockUSDC.waitForDeployment();
  mockTokens.USDC = await mockUSDC.getAddress();
  console.log("Mock USDC deployed to:", mockTokens.USDC);
    
    // Deploy LINK mock
    const mockLINK = await MockERC20.deploy("Chainlink", "LINK", 18, 1000000000);
  await mockLINK.waitForDeployment();
  mockTokens.LINK = await mockLINK.getAddress();
  console.log("Mock LINK deployed to:", mockTokens.LINK);

    // Deploy Mock Price Feeds
    console.log("\nDeploying mock price feeds...");
    
    const MockPriceFeed = await hre.ethers.getContractFactory("MockPriceFeed");
    
    const btcPriceFeed = await MockPriceFeed.deploy(
      5000000000000, // $50,000 with 8 decimals
      8,
      "BTC/USD"
    );
  await btcPriceFeed.waitForDeployment();
  mockTokens.BTC_PRICE_FEED = await btcPriceFeed.getAddress();
  console.log("BTC Price Feed deployed to:", mockTokens.BTC_PRICE_FEED);
    
    const usdcPriceFeed = await MockPriceFeed.deploy(
      100000000, // $1.00 with 8 decimals
      8,
      "USDC/USD"
    );
  await usdcPriceFeed.waitForDeployment();
  mockTokens.USDC_PRICE_FEED = await usdcPriceFeed.getAddress();
  console.log("USDC Price Feed deployed to:", mockTokens.USDC_PRICE_FEED);
    
    const linkPriceFeed = await MockPriceFeed.deploy(
      1500000000, // $15.00 with 8 decimals
      8,
      "LINK/USD"
    );
  await linkPriceFeed.waitForDeployment();
  mockTokens.LINK_PRICE_FEED = await linkPriceFeed.getAddress();
  console.log("LINK Price Feed deployed to:", mockTokens.LINK_PRICE_FEED);
  }

  // Deploy ChainIndexFactory
  console.log("\nDeploying ChainIndexFactory...");
  const ChainIndexFactory = await hre.ethers.getContractFactory("ChainIndexFactory");
  
  const factory = await ChainIndexFactory.deploy(
    deployer.address,
    hre.ethers.parseEther("0.01")
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("ChainIndexFactory deployed to:", factoryAddress);

  // Create a sample index fund
  if (network === "localhost" || network === "hardhat" || network === "sepolia") {
    console.log("\nCreating sample index fund...");
    
    const createTx = await factory.createIndexFund(
      "Crypto Top 3 Index",
      "CT3I",
      200, // 2% management fee
      1000, // 10% performance fee
      { value: hre.ethers.parseEther("0.01") }
    );
    const receipt = await createTx.wait();
    const logs = await receipt.getLogs();
    // Fallback: query fund 0
    const indexFundAddress = (await factory.getFundInfo(0)).fundAddress;
    console.log("Sample Index Fund deployed to:", indexFundAddress);

    // Add assets to the sample fund
    const ChainIndexFund = await hre.ethers.getContractFactory("ChainIndexFund");
    const indexFund = await ChainIndexFund.attach(indexFundAddress);

    // Configure DEX if env variables provided
    const router = process.env.UNI_V3_ROUTER;
    const weth = process.env.WETH;
    if (router && weth) {
      console.log("\nConfiguring DEX...");
      const tx = await indexFund.setDEX(router, weth);
      await tx.wait();
      // Set common fee tiers
      if (mockTokens.WBTC) await (await indexFund.setPoolFee(mockTokens.WBTC, 3000)).wait();
      if (mockTokens.USDC) await (await indexFund.setPoolFee(mockTokens.USDC, 500)).wait();
      if (mockTokens.LINK) await (await indexFund.setPoolFee(mockTokens.LINK, 3000)).wait();
      console.log("DEX configured.");
    }

    if (mockTokens.WBTC) {
      await indexFund.addAsset(
        mockTokens.WBTC,
        mockTokens.BTC_PRICE_FEED,
        5000, // 50% weight
        2000, // 20% min
        7000  // 70% max
      );
      console.log("Added WBTC to index fund");
    }

    if (mockTokens.USDC) {
      await indexFund.addAsset(
        mockTokens.USDC,
        mockTokens.USDC_PRICE_FEED,
        2000, // 20% weight
        500,  // 5% min
        4000  // 40% max
      );
      console.log("Added USDC to index fund");
    }

    if (mockTokens.LINK) {
      await indexFund.addAsset(
        mockTokens.LINK,
        mockTokens.LINK_PRICE_FEED,
        3000, // 30% weight
        1000, // 10% min
        5000  // 50% max
      );
      console.log("Added LINK to index fund");
    }
  }

  // Verification for deployed contracts
  console.log("\n=== Deployment Summary ===");
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  console.log("ChainIndexFactory:", factory.address);
  
  if (Object.keys(mockTokens).length > 0) {
    console.log("\nMock Tokens (Testing):");
    Object.entries(mockTokens).forEach(([name, address]) => {
      console.log(`${name}:`, address);
    });
  }

  // Save deployment info
  const deploymentInfo = {
    network: network,
    deployer: deployer.address,
    factory: factory.address,
    mockTokens: mockTokens,
    timestamp: new Date().toISOString()
  };

  const fs = require('fs');
  fs.writeFileSync(
    `deployments/${network}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log(`\nDeployment info saved to deployments/${network}.json`);

  // Verify contracts on Etherscan (if not local network)
  if (network !== "localhost" && network !== "hardhat") {
    console.log("\nVerifying contracts on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: factory.address,
        constructorArguments: [
          deployer.address,
          hre.ethers.utils.parseEther("0.01")
        ],
      });
      console.log("ChainIndexFactory verified!");
    } catch (error) {
      console.log("Verification failed:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
