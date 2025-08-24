const hre = require("hardhat");
const fs = require("fs");

function isAddress(a) {
  return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
}

async function main() {
  const network = hre.network.name;
  const fundFile = `deployments/${network}-fund.json`;
  if (!fs.existsSync(fundFile)) throw new Error("Fund not found: run create-fund first");
  const { fundAddress } = JSON.parse(fs.readFileSync(fundFile, "utf-8"));

  const router = process.env.UNI_V3_ROUTER;
  const weth = process.env.WETH;
  if (!isAddress(router) || !isAddress(weth)) {
    throw new Error("UNI_V3_ROUTER and WETH must be valid 0x addresses in .env");
  }

  console.log("Configuring DEX on fund:", fundAddress);
  const Fund = await hre.ethers.getContractFactory("ChainIndexFund");
  const fund = Fund.attach(fundAddress);

  await (await fund.setDEX(router.trim(), weth.trim())).wait();
  console.log("DEX set: router=", router, " weth=", weth);

  // Optionally set default pool fees if mocks exist
  const mocksFile = `deployments/${network}-mocks.json`;
  if (fs.existsSync(mocksFile)) {
    const { mocks } = JSON.parse(fs.readFileSync(mocksFile, "utf-8"));
    if (mocks.WBTC) await (await fund.setPoolFee(mocks.WBTC, 3000)).wait();
    if (mocks.USDC) await (await fund.setPoolFee(mocks.USDC, 500)).wait();
    if (mocks.LINK) await (await fund.setPoolFee(mocks.LINK, 3000)).wait();
    console.log("Default pool fees set for mock tokens");
  }

  console.log("DEX configuration complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
