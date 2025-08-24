const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ChainIndexFund", function () {
  async function deployFixture() {
    const [owner, user1, user2, feeRecipient] = await ethers.getSigners();

    // Deploy mock tokens
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockWBTC = await MockERC20.deploy("Wrapped Bitcoin", "WBTC", 8, 21000000);
  await mockWBTC.waitForDeployment();
  const mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6, 1000000000);
  await mockUSDC.waitForDeployment();
  const mockLINK = await MockERC20.deploy("Chainlink", "LINK", 18, 1000000000);
  await mockLINK.waitForDeployment();

    // Deploy mock price feeds
  const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
  const btcPriceFeed = await MockPriceFeed.deploy(
      5000000000000, // $50,000 with 8 decimals
      8,
      "BTC/USD"
    );
  await btcPriceFeed.waitForDeployment();
  const usdcPriceFeed = await MockPriceFeed.deploy(
      100000000, // $1.00 with 8 decimals
      8,
      "USDC/USD"
    );
  await usdcPriceFeed.waitForDeployment();
  const linkPriceFeed = await MockPriceFeed.deploy(
      1500000000, // $15.00 with 8 decimals
      8,
      "LINK/USD"
    );
  await linkPriceFeed.waitForDeployment();

    // Deploy ChainIndexFund
  const ChainIndexFund = await ethers.getContractFactory("ChainIndexFund");
  const indexFund = await ChainIndexFund.deploy(
      "Crypto Index Fund",
      "CIF",
      feeRecipient.address,
      200, // 2% management fee
      1000 // 10% performance fee
    );
  await indexFund.waitForDeployment();

    // Transfer ownership to owner
    await indexFund.transferOwnership(owner.address);

    return {
      indexFund,
      mockWBTC,
      mockUSDC,
      mockLINK,
      btcPriceFeed,
      usdcPriceFeed,
      linkPriceFeed,
      owner,
      user1,
      user2,
      feeRecipient,
    };
  }

  describe("Deployment", function () {
    it("Should deploy with correct parameters", async function () {
      const { indexFund, feeRecipient } = await loadFixture(deployFixture);

      expect(await indexFund.name()).to.equal("Crypto Index Fund");
      expect(await indexFund.symbol()).to.equal("CIF");
      expect(await indexFund.feeRecipient()).to.equal(feeRecipient.address);
      expect(await indexFund.managementFee()).to.equal(200);
      expect(await indexFund.performanceFee()).to.equal(1000);
    });
  });

  describe("Asset Management", function () {
    it("Should allow owner to add assets", async function () {
      const { indexFund, mockWBTC, btcPriceFeed, owner } = await loadFixture(deployFixture);

      await indexFund.connect(owner).addAsset(
        await mockWBTC.getAddress(),
        await btcPriceFeed.getAddress(),
        5000, // 50% target weight
        1000, // 10% min weight
        8000  // 80% max weight
      );

      const asset = await indexFund.assets(0);
      expect(asset.tokenAddress).to.equal(await mockWBTC.getAddress());
      expect(asset.priceFeed).to.equal(await btcPriceFeed.getAddress());
      expect(asset.targetWeight).to.equal(5000);
      expect(asset.isActive).to.be.true;
    });

    it("Should not allow non-owner to add assets", async function () {
      const { indexFund, mockWBTC, btcPriceFeed, user1 } = await loadFixture(deployFixture);

      await expect(
        indexFund.connect(user1).addAsset(
          await mockWBTC.getAddress(),
          await btcPriceFeed.getAddress(),
          5000,
          1000,
          8000
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should allow owner to update asset weights", async function () {
      const { indexFund, mockWBTC, btcPriceFeed, owner } = await loadFixture(deployFixture);

      // Add asset first
      await indexFund.connect(owner).addAsset(
        await mockWBTC.getAddress(),
        await btcPriceFeed.getAddress(),
        5000,
        1000,
        8000
      );

      // Update weight
      await indexFund.connect(owner).updateAssetWeight(0, 6000);

      const asset = await indexFund.assets(0);
      expect(asset.targetWeight).to.equal(6000);
    });

    it("Should allow owner to remove assets", async function () {
      const { indexFund, mockWBTC, btcPriceFeed, owner } = await loadFixture(deployFixture);

      // Add asset first
      await indexFund.connect(owner).addAsset(
        await mockWBTC.getAddress(),
        await btcPriceFeed.getAddress(),
        5000,
        1000,
        8000
      );

      // Remove asset
      await indexFund.connect(owner).removeAsset(0);

      const asset = await indexFund.assets(0);
      expect(asset.isActive).to.be.false;
    });
  });

  describe("Deposits and Withdrawals", function () {
    it("Should allow users to deposit ETH", async function () {
      const { indexFund, user1 } = await loadFixture(deployFixture);

  const depositAmount = ethers.parseEther("1.0");
      
      await indexFund.connect(user1).deposit({ value: depositAmount });

      expect(await indexFund.balanceOf(user1.address)).to.equal(depositAmount);
  expect(await ethers.provider.getBalance(await indexFund.getAddress())).to.equal(depositAmount);
    });

    it("Should reject deposits below minimum", async function () {
      const { indexFund, user1 } = await loadFixture(deployFixture);

  const smallAmount = ethers.parseEther("0.001"); // Below 0.01 ETH minimum
      
      await expect(
        indexFund.connect(user1).deposit({ value: smallAmount })
      ).to.be.revertedWith("Below minimum investment");
    });

    it("Should allow users to withdraw their shares", async function () {
      const { indexFund, user1 } = await loadFixture(deployFixture);

  const depositAmount = ethers.parseEther("1.0");
      
      // Deposit first
      await indexFund.connect(user1).deposit({ value: depositAmount });
      
      const userShares = await indexFund.balanceOf(user1.address);
  const userBalanceBefore = await ethers.provider.getBalance(user1.address);
      
      // Withdraw
      const tx = await indexFund.connect(user1).withdraw(userShares);
  const receipt = await tx.wait();
  const gasUsed = BigInt(receipt.gasUsed ?? 0n) * BigInt(receipt.effectiveGasPrice ?? 0n);
      
      const userBalanceAfter = await ethers.provider.getBalance(user1.address);
      
  expect(await indexFund.balanceOf(user1.address)).to.equal(0n);
  // Using BigInt-safe tolerance window
  const actual = BigInt(userBalanceAfter) + gasUsed;
  const expected = BigInt(userBalanceBefore) + BigInt(depositAmount);
  const tolerance = ethers.parseEther("0.001");
  expect(actual >= expected - tolerance && actual <= expected + tolerance).to.equal(true);
    });
  });

  describe("Price Feeds", function () {
    it("Should correctly fetch asset prices", async function () {
      const { indexFund, mockWBTC, btcPriceFeed, owner } = await loadFixture(deployFixture);

      // Add asset
      await indexFund.connect(owner).addAsset(
        await mockWBTC.getAddress(),
        await btcPriceFeed.getAddress(),
        5000,
        1000,
        8000
      );

  const price = await indexFund.getAssetPrice(0);
  expect(price).to.equal(ethers.parseEther("50000")); // $50,000 in 18 decimals
    });
  });

  describe("Fee Collection", function () {
    it("Should collect management fees over time", async function () {
      const { indexFund, user1, feeRecipient } = await loadFixture(deployFixture);

  const depositAmount = ethers.parseEther("10.0");
      
      // Deposit
      await indexFund.connect(user1).deposit({ value: depositAmount });

      // Fast forward time (30 days)
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");

  const feeRecipientBalanceBefore = await indexFund.balanceOf(feeRecipient.address);
      
      // Collect fees
      await indexFund.collectFees();
      
  const feeRecipientBalanceAfter = await indexFund.balanceOf(feeRecipient.address);
      expect(feeRecipientBalanceAfter).to.be.gt(feeRecipientBalanceBefore);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to pause and unpause", async function () {
      const { indexFund, owner, user1 } = await loadFixture(deployFixture);

      // Pause
      await indexFund.connect(owner).pause();
      
      // Try to deposit (should fail)
      await expect(
        indexFund.connect(user1).deposit({ value: ethers.parseEther("1.0") })
      ).to.be.revertedWith("Contract is paused");

      // Unpause
      await indexFund.connect(owner).unpause();
      
      // Deposit should work now
      await expect(
        indexFund.connect(user1).deposit({ value: ethers.parseEther("1.0") })
      ).to.not.be.reverted;
    });

    it("Should allow owner to update fees", async function () {
      const { indexFund, owner } = await loadFixture(deployFixture);

      await indexFund.connect(owner).setFees(300, 1500); // 3% management, 15% performance

      expect(await indexFund.managementFee()).to.equal(300);
      expect(await indexFund.performanceFee()).to.equal(1500);
    });
  });
});
