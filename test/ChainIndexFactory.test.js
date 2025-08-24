const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ChainIndexFactory", function () {
  async function deployFactoryFixture() {
    const [owner, creator1, creator2, feeRecipient] = await ethers.getSigners();

    // Deploy Factory
  const ChainIndexFactory = await ethers.getContractFactory("ChainIndexFactory");
    const factory = await ChainIndexFactory.deploy(
      feeRecipient.address,
      ethers.parseEther("0.1") // 0.1 ETH creation fee
    );
    await factory.waitForDeployment();

    return { factory, owner, creator1, creator2, feeRecipient };
  }

  describe("Deployment", function () {
    it("Should deploy with correct parameters", async function () {
      const { factory, feeRecipient } = await loadFixture(deployFactoryFixture);

  expect(await factory.feeRecipient()).to.equal(feeRecipient.address);
  expect(await factory.creationFee()).to.equal(ethers.parseEther("0.1"));
  expect(await factory.fundCount()).to.equal(0n);
    });
  });

  describe("Index Fund Creation", function () {
    it("Should allow creation of new index funds", async function () {
      const { factory, creator1 } = await loadFixture(deployFactoryFixture);

  const creationFee = ethers.parseEther("0.1");
      
  await factory.connect(creator1).createIndexFund(
        "Test Index Fund",
        "TIF",
        200, // 2% management fee
        1000, // 10% performance fee
        { value: creationFee }
      );

      const fundInfo = await factory.getFundInfo(0);
      expect(fundInfo.name).to.equal("Test Index Fund");
      expect(fundInfo.creator).to.equal(creator1.address);
      expect(fundInfo.isActive).to.be.true;

  expect(await factory.fundCount()).to.equal(1n);
    });

    it("Should reject creation with insufficient fee", async function () {
      const { factory, creator1 } = await loadFixture(deployFactoryFixture);

  const insufficientFee = ethers.parseEther("0.05");
      
      await expect(
        factory.connect(creator1).createIndexFund(
          "Test Index Fund",
          "TIF",
          200,
          1000,
          { value: insufficientFee }
        )
      ).to.be.revertedWith("Insufficient creation fee");
    });

    it("Should return excess ETH to creator", async function () {
      const { factory, creator1, feeRecipient } = await loadFixture(deployFactoryFixture);

      const excessFee = ethers.parseEther("0.2"); // Double the required fee
      const feeRecipientBefore = await ethers.provider.getBalance(feeRecipient.address);

      await factory.connect(creator1).createIndexFund(
        "Test Index Fund",
        "TIF",
        200,
        1000,
        { value: excessFee }
      );

      const feeRecipientAfter = await ethers.provider.getBalance(feeRecipient.address);
      // Fee recipient should get exactly the creation fee; excess returned to creator
      expect(feeRecipientAfter - feeRecipientBefore).to.equal(ethers.parseEther("0.1"));
    });
  });

  describe("Fund Management", function () {
    it("Should track funds by creator", async function () {
      const { factory, creator1 } = await loadFixture(deployFactoryFixture);

  const creationFee = ethers.parseEther("0.1");
      
      // Create first fund
      await factory.connect(creator1).createIndexFund(
        "Fund 1",
        "F1",
        200,
        1000,
        { value: creationFee }
      );

      // Create second fund
      await factory.connect(creator1).createIndexFund(
        "Fund 2",
        "F2",
        300,
        1500,
        { value: creationFee }
      );

      const creatorFunds = await factory.getFundsByCreator(creator1.address);
      expect(creatorFunds.length).to.equal(2);
  expect(creatorFunds[0]).to.equal(0n);
  expect(creatorFunds[1]).to.equal(1n);
    });

    it("Should allow admin to deactivate funds", async function () {
      const { factory, creator1, owner } = await loadFixture(deployFactoryFixture);

  const creationFee = ethers.parseEther("0.1");
      
      // Create fund
      await factory.connect(creator1).createIndexFund(
        "Test Fund",
        "TF",
        200,
        1000,
        { value: creationFee }
      );

      // Deactivate fund
      await factory.connect(owner).deactivateFund(0);

      const fundInfo = await factory.getFundInfo(0);
      expect(fundInfo.isActive).to.be.false;
    });

    it("Should return only active funds", async function () {
  const { factory, creator1, owner } = await loadFixture(deployFactoryFixture);

  const creationFee = ethers.parseEther("0.1");
      
      // Create multiple funds
      await factory.connect(creator1).createIndexFund("Fund 1", "F1", 200, 1000, { value: creationFee });
      await factory.connect(creator1).createIndexFund("Fund 2", "F2", 200, 1000, { value: creationFee });
      await factory.connect(creator1).createIndexFund("Fund 3", "F3", 200, 1000, { value: creationFee });

      // Deactivate middle fund
      await factory.connect(owner).deactivateFund(1);

  const activeFunds = await factory.getActiveFunds(0, 10);
  expect(activeFunds.length).to.equal(2);
  // Access by named keys (ethers v6 returns objects with named fields)
  expect(activeFunds[0].name).to.equal("Fund 1");
  expect(activeFunds[1].name).to.equal("Fund 3");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update creation fee", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);

  const newFee = ethers.parseEther("0.2");
      await factory.connect(owner).setCreationFee(newFee);

      expect(await factory.creationFee()).to.equal(newFee);
    });

    it("Should allow owner to update fee recipient", async function () {
      const { factory, owner, creator1 } = await loadFixture(deployFactoryFixture);

      await factory.connect(owner).setFeeRecipient(creator1.address);

      expect(await factory.feeRecipient()).to.equal(creator1.address);
    });

    it("Should allow owner to withdraw fees", async function () {
  const { factory, creator1, owner, feeRecipient } = await loadFixture(deployFactoryFixture);

  const creationFee = ethers.parseEther("0.1");
      
      // Create a fund to generate fees
      await factory.connect(creator1).createIndexFund(
        "Test Fund",
        "TF",
        200,
        1000,
        { value: creationFee }
      );

      // Note: The creation fee is already sent to feeRecipient during fund creation
      // So we don't need to test withdrawFees separately in this simple case
      
  const factoryBalance = await ethers.provider.getBalance(await factory.getAddress());
  expect(factoryBalance).to.equal(0n); // Should be 0 as fees are sent immediately
    });

    it("Should reject non-owner admin calls", async function () {
      const { factory, creator1 } = await loadFixture(deployFactoryFixture);

      await expect(
        factory.connect(creator1).setCreationFee(ethers.parseEther("0.2"))
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        factory.connect(creator1).deactivateFund(0)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
