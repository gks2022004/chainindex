const hre = require("hardhat");

async function main() {
  const network = hre.network.name;
  const mocks = {};

  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const MockPriceFeed = await hre.ethers.getContractFactory("MockPriceFeed");

  console.log("Deploying mocks on", network);

  const wbtc = await MockERC20.deploy("Wrapped Bitcoin", "WBTC", 8, 21000000);
  await wbtc.waitForDeployment();
  mocks.WBTC = await wbtc.getAddress();

  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6, 1000000000);
  await usdc.waitForDeployment();
  mocks.USDC = await usdc.getAddress();

  const link = await MockERC20.deploy("Chainlink", "LINK", 18, 1000000000);
  await link.waitForDeployment();
  mocks.LINK = await link.getAddress();

  const btcFeed = await MockPriceFeed.deploy(5000000000000n, 8, "BTC/USD");
  await btcFeed.waitForDeployment();
  mocks.BTC_PRICE_FEED = await btcFeed.getAddress();

  const usdcFeed = await MockPriceFeed.deploy(100000000n, 8, "USDC/USD");
  await usdcFeed.waitForDeployment();
  mocks.USDC_PRICE_FEED = await usdcFeed.getAddress();

  const linkFeed = await MockPriceFeed.deploy(1500000000n, 8, "LINK/USD");
  await linkFeed.waitForDeployment();
  mocks.LINK_PRICE_FEED = await linkFeed.getAddress();

  console.log("Mocks:", mocks);

  const fs = require("fs");
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(`deployments/${network}-mocks.json`, JSON.stringify({ network, mocks }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
