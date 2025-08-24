const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;
  const creationFeeEther = process.env.CREATION_FEE_ETHER || "0.01";

  console.log(`Network: ${network}`);
  console.log("Deployer:", deployer.address);
  console.log("Fee Recipient:", feeRecipient);
  console.log("Creation Fee (ETH):", creationFeeEther);

  const Factory = await hre.ethers.getContractFactory("ChainIndexFactory");
  const factory = await Factory.deploy(
    feeRecipient,
    hre.ethers.parseEther(creationFeeEther)
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();

  console.log("ChainIndexFactory deployed:", factoryAddress);

  const fs = require("fs");
  const out = {
    network,
    deployer: deployer.address,
    factory: factoryAddress,
    creationFeeEther,
    feeRecipient,
    timestamp: new Date().toISOString(),
  };
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(`deployments/${network}-factory.json`, JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
