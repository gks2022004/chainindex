const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const network = hre.network.name;
  const [signer] = await hre.ethers.getSigners();

  const factoryFile = `deployments/${network}-factory.json`;
  if (!fs.existsSync(factoryFile)) throw new Error("Factory not deployed");
  const { factory } = JSON.parse(fs.readFileSync(factoryFile, "utf-8"));

  const Factory = await hre.ethers.getContractFactory("ChainIndexFactory");
  const factoryC = Factory.attach(factory);

  const name = process.env.FUND_NAME || "Crypto Top 3 Index";
  const symbol = process.env.FUND_SYMBOL || "CT3I";
  const mgmtBps = Number(process.env.MGMT_FEE_BPS || 200);
  const perfBps = Number(process.env.PERF_FEE_BPS || 1000);
  const creationFeeEther = process.env.CREATION_FEE_ETHER || "0.01";

  console.log("Creating fund via factory:", factory);
  const tx = await factoryC.createIndexFund(name, symbol, mgmtBps, perfBps, {
    value: hre.ethers.parseEther(creationFeeEther),
  });
  const rcpt = await tx.wait();
  // Determine the newly created fund id/address (use latest index)
  const total = await factoryC.fundCount();
  const latestId = total - 1n;
  const fundInfo = await factoryC.getFundInfo(latestId);
  const fundAddress = fundInfo.fundAddress;
  console.log("Fund deployed:", fundAddress);

  const Fund = await hre.ethers.getContractFactory("ChainIndexFund");
  const fund = Fund.attach(fundAddress);

  // Add assets if mocks exist
  const mocksFile = `deployments/${network}-mocks.json`;
  if (fs.existsSync(mocksFile)) {
    const { mocks } = JSON.parse(fs.readFileSync(mocksFile, "utf-8"));
    const add = async (token, feed, weight, min, max) => {
      const t = await fund.addAsset(token, feed, weight, min, max);
      await t.wait();
    };
    if (mocks.WBTC && mocks.BTC_PRICE_FEED) await add(mocks.WBTC, mocks.BTC_PRICE_FEED, 5000, 2000, 7000);
    if (mocks.USDC && mocks.USDC_PRICE_FEED) await add(mocks.USDC, mocks.USDC_PRICE_FEED, 2000, 500, 4000);
    if (mocks.LINK && mocks.LINK_PRICE_FEED) await add(mocks.LINK, mocks.LINK_PRICE_FEED, 3000, 1000, 5000);
    console.log("Assets added to fund");
  }

  // Optionally configure DEX
  const router = process.env.UNI_V3_ROUTER;
  const weth = process.env.WETH;
  const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
  if (isAddress(router) && isAddress(weth)) {
    console.log("Configuring DEX...");
    await (await fund.setDEX(router.trim(), weth.trim())).wait();
    // Default fee tiers
    if (fs.existsSync(mocksFile)) {
      const { mocks } = JSON.parse(fs.readFileSync(mocksFile, "utf-8"));
      if (mocks.WBTC) await (await fund.setPoolFee(mocks.WBTC, 3000)).wait();
      if (mocks.USDC) await (await fund.setPoolFee(mocks.USDC, 500)).wait();
      if (mocks.LINK) await (await fund.setPoolFee(mocks.LINK, 3000)).wait();
    }
    console.log("DEX configured");
  } else if (router || weth) {
    console.warn("Skipping DEX config: UNI_V3_ROUTER or WETH is not a valid 0x-address.");
  }

  // Save fund info
  const out = { network, factory, fundAddress, name, symbol, mgmtBps, perfBps, timestamp: new Date().toISOString() };
  fs.writeFileSync(`deployments/${network}-fund.json`, JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
