// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import { ISwapRouterV3 } from "./interfaces/ISwapRouterV3.sol";
import { IWETH } from "./interfaces/IWETH.sol";

/**
 * @title ChainIndexFund
 * @dev Decentralized Index Fund that automatically rebalances based on market cap weightings
 */
contract ChainIndexFund is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Asset {
        address tokenAddress;
        address priceFeed; // Chainlink price feed
        uint256 targetWeight; // Target weight in basis points (10000 = 100%)
        uint256 currentWeight;
        bool isActive;
        uint256 minWeight; // Minimum weight in basis points
        uint256 maxWeight; // Maximum weight in basis points
    }

    // State variables
    mapping(uint256 => Asset) public assets;
    mapping(address => uint256) public tokenToAssetId;
    uint256 public assetCount;
    uint256 public totalTargetWeight;
    
    uint256 public managementFee; // Annual fee in basis points
    uint256 public performanceFee; // Performance fee in basis points
    uint256 public lastFeeCollection;
    
    uint256 public minInvestment; // Minimum investment amount
    uint256 public maxSlippage; // Maximum slippage allowed in basis points
    uint256 public rebalanceThreshold; // Threshold for triggering rebalance in basis points
    
    address public feeRecipient;
    bool public isPaused;

    // DEX integration (configured post-deploy)
    address public WETH; // WETH address
    ISwapRouterV3 public swapRouter; // Uniswap v3 swap router
    mapping(address => uint24) public poolFee; // token => fee tier (e.g., 3000 for 0.3%)

    // Performance fee high-watermark (share price scaled to 1e18)
    uint256 public highWatermark;

    // Events
    event AssetAdded(uint256 indexed assetId, address indexed token, uint256 targetWeight);
    event AssetUpdated(uint256 indexed assetId, uint256 newTargetWeight);
    event AssetRemoved(uint256 indexed assetId, address indexed token);
    event Deposit(address indexed user, uint256 amount, uint256 shares);
    event Withdrawal(address indexed user, uint256 shares, uint256 amount);
    event Rebalanced(uint256 timestamp);
    event FeesCollected(uint256 managementFees, uint256 performanceFees);
    event DexConfigured(address router, address weth);
    event PoolFeeSet(address token, uint24 fee);

    modifier whenNotPaused() {
        require(!isPaused, "Contract is paused");
        _;
    }

    modifier onlyValidAsset(uint256 assetId) {
        require(assetId < assetCount && assets[assetId].isActive, "Invalid asset");
        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        address _feeRecipient,
        uint256 _managementFee,
        uint256 _performanceFee
    ) ERC20(name, symbol) Ownable() {
        feeRecipient = _feeRecipient;
        managementFee = _managementFee; // e.g., 200 = 2%
        performanceFee = _performanceFee; // e.g., 1000 = 10%
        lastFeeCollection = block.timestamp;
        minInvestment = 1e16; // 0.01 ETH
        maxSlippage = 300; // 3%
    rebalanceThreshold = 500; // 5%
    highWatermark = 1e18; // initialize to 1.0
    WETH = address(0);
    }

    /**
     * @dev Add a new asset to the index
     */
    function addAsset(
        address _tokenAddress,
        address _priceFeed,
        uint256 _targetWeight,
        uint256 _minWeight,
        uint256 _maxWeight
    ) external onlyOwner {
        require(_tokenAddress != address(0), "Invalid token address");
        require(_priceFeed != address(0), "Invalid price feed");
        require(_targetWeight > 0 && _targetWeight <= 10000, "Invalid target weight");
        require(_minWeight <= _targetWeight && _targetWeight <= _maxWeight, "Invalid weight bounds");
        require(tokenToAssetId[_tokenAddress] == 0 || !assets[tokenToAssetId[_tokenAddress]].isActive, "Asset already exists");

        uint256 assetId = assetCount;
        assets[assetId] = Asset({
            tokenAddress: _tokenAddress,
            priceFeed: _priceFeed,
            targetWeight: _targetWeight,
            currentWeight: 0,
            isActive: true,
            minWeight: _minWeight,
            maxWeight: _maxWeight
        });

        tokenToAssetId[_tokenAddress] = assetId;
        assetCount++;
    totalTargetWeight = totalTargetWeight + _targetWeight;

        emit AssetAdded(assetId, _tokenAddress, _targetWeight);
    }

    /**
     * @dev Update asset target weight
     */
    function updateAssetWeight(uint256 assetId, uint256 newTargetWeight) 
        external 
        onlyOwner 
        onlyValidAsset(assetId) 
    {
        require(newTargetWeight > 0 && newTargetWeight <= 10000, "Invalid target weight");
        
        Asset storage asset = assets[assetId];
        uint256 oldWeight = asset.targetWeight;
        asset.targetWeight = newTargetWeight;
        
    totalTargetWeight = totalTargetWeight - oldWeight + newTargetWeight;
        
        emit AssetUpdated(assetId, newTargetWeight);
    }

    /**
     * @dev Remove an asset from the index
     */
    function removeAsset(uint256 assetId) external onlyOwner onlyValidAsset(assetId) {
        Asset storage asset = assets[assetId];
        
        // Sell all holdings of this asset before removing
        uint256 balance = IERC20(asset.tokenAddress).balanceOf(address(this));
        if (balance > 0) {
            // In a real implementation, this would involve DEX integration
            // For now, we just transfer to owner for manual handling
            IERC20(asset.tokenAddress).safeTransfer(owner(), balance);
        }
        
        totalTargetWeight = totalTargetWeight - asset.targetWeight;
        asset.isActive = false;
        
        emit AssetRemoved(assetId, asset.tokenAddress);
    }

    /**
     * @dev Deposit ETH and receive index fund tokens
     */
    function deposit() external payable nonReentrant whenNotPaused {
        require(msg.value >= minInvestment, "Below minimum investment");
        
        uint256 totalValue = getTotalValue();
        uint256 shares;
        if (totalSupply() == 0) {
            shares = msg.value;
        } else {
            shares = (msg.value * totalSupply()) / totalValue;
        }
        
        _mint(msg.sender, shares);
        
        // Convert ETH to index assets
        _investETH(msg.value);
        
        emit Deposit(msg.sender, msg.value, shares);
    }

    /**
     * @dev Withdraw index fund tokens and receive ETH
     */
    function withdraw(uint256 shares) external nonReentrant whenNotPaused {
        require(shares > 0, "Invalid shares amount");
        require(balanceOf(msg.sender) >= shares, "Insufficient balance");
        
    // uint256 totalValue = getTotalValue();
    // uint256 withdrawalAmount = (shares * totalValue) / totalSupply();
        
        _burn(msg.sender, shares);
        
        // Convert proportional assets to ETH
    uint256 ethAmount = _divestToETH(shares, totalSupply() + shares);
        
        payable(msg.sender).transfer(ethAmount);
        
        emit Withdrawal(msg.sender, shares, ethAmount);
    }

    /**
     * @dev Get the current value of the fund in ETH
     */
    function getTotalValue() public view returns (uint256) {
    uint256 totalValue = address(this).balance;
        
        for (uint256 i = 0; i < assetCount; i++) {
            if (!assets[i].isActive) continue;
            
            uint256 balance = IERC20(assets[i].tokenAddress).balanceOf(address(this));
            if (balance > 0) {
        uint256 price = getAssetPrice(i);
        totalValue = totalValue + ((balance * price) / 1e18);
            }
        }
        
        return totalValue;
    }

    /**
     * @dev Get asset price from Chainlink oracle
     */
    function getAssetPrice(uint256 assetId) public view returns (uint256) {
        require(assetId < assetCount, "Invalid asset ID");
        
        AggregatorV3Interface priceFeed = AggregatorV3Interface(assets[assetId].priceFeed);
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price");
        uint8 dec = priceFeed.decimals();
        // Scale to 18 decimals
        if (dec < 18) {
            return uint256(price) * (10 ** (18 - dec));
        } else if (dec > 18) {
            return uint256(price) / (10 ** (dec - 18));
        } else {
            return uint256(price);
        }
    }

    /**
     * @dev Rebalance the fund to target weights
     */
    function rebalance() external onlyOwner {
        _updateCurrentWeights();
        
        // Check if rebalancing is needed
        bool needsRebalancing = false;
        for (uint256 i = 0; i < assetCount; i++) {
            if (!assets[i].isActive) continue;
            
            uint256 weightDiff = assets[i].currentWeight > assets[i].targetWeight
                ? assets[i].currentWeight - assets[i].targetWeight
                : assets[i].targetWeight - assets[i].currentWeight;
                
            if (weightDiff > rebalanceThreshold) {
                needsRebalancing = true;
                break;
            }
        }
        
        require(needsRebalancing, "Rebalancing not needed");
        
        // Perform rebalancing logic
        _performRebalancing();
        
        emit Rebalanced(block.timestamp);
    }

    /**
     * @dev Collect management and performance fees
     */
    function collectFees() external {
        uint256 timeElapsed = block.timestamp - lastFeeCollection;
        uint256 totalValue = getTotalValue();
        
        // Calculate management fees (annualized)
        uint256 managementFees = (totalValue * managementFee * timeElapsed) / (365 days) / 10000;
        
        // Performance fees via high-watermark method
        uint256 performanceFees = 0;
        uint256 supply = totalSupply();
        if (supply > 0 && totalValue > 0) {
            uint256 sharePrice = (totalValue * 1e18) / supply;
            if (sharePrice > highWatermark && performanceFee > 0) {
                uint256 gainPerShare = sharePrice - highWatermark; // 1e18 scale
                uint256 totalProfit = (gainPerShare * supply) / 1e18;
                performanceFees = (totalProfit * performanceFee) / 10000;
                highWatermark = sharePrice;
            }
        }

        uint256 totalFees = managementFees + performanceFees;
        if (totalFees > 0 && totalValue > 0 && supply > 0) {
            uint256 feeShares = (totalFees * supply) / totalValue;
            if (feeShares > 0) {
                _mint(feeRecipient, feeShares);
            }
        }
        
        lastFeeCollection = block.timestamp;
        
        emit FeesCollected(managementFees, performanceFees);
    }

    /**
     * @dev Internal function to invest ETH into index assets
     */
    function _investETH(uint256 amount) internal {
        if (amount == 0 || assetCount == 0) {
            _updateCurrentWeights();
            return;
        }
        // If DEX not configured, skip trading
        if (address(swapRouter) == address(0) || WETH == address(0)) {
            _updateCurrentWeights();
            return;
        }

        // Compute target allocation using current TVL + incoming ETH
        uint256 baseValue = getTotalValue() - address(this).balance; // value excluding ETH
        uint256 newTotalValue = baseValue + address(this).balance;

        for (uint256 i = 0; i < assetCount; i++) {
            if (!assets[i].isActive) continue;
            Asset memory a = assets[i];
            uint256 targetValue = (newTotalValue * a.targetWeight) / 10000;
            uint256 bal = IERC20(a.tokenAddress).balanceOf(address(this));
            uint256 price = getAssetPrice(i);
            uint256 currentValue = (bal * price) / 1e18;
            if (currentValue >= targetValue) continue;
            uint256 deficit = targetValue - currentValue;
            uint256 ethToUse = deficit > address(this).balance ? address(this).balance : deficit;
            if (ethToUse == 0) continue;
            _buyTokenWithEth(a.tokenAddress, ethToUse, a.priceFeed);
        }

        _updateCurrentWeights();
    }

    /**
     * @dev Internal function to convert assets to ETH for withdrawal
     */
    function _divestToETH(uint256 shares, uint256 totalSharesBeforeBurn) internal returns (uint256) {
        uint256 ethPortion = (address(this).balance * shares) / totalSharesBeforeBurn;
        if (assetCount == 0) return ethPortion;
        // If DEX not configured, cannot sell tokens; return only ETH portion
        if (address(swapRouter) == address(0) || WETH == address(0)) {
            return ethPortion;
        }

        // Sell proportional token holdings
        for (uint256 i = 0; i < assetCount; i++) {
            if (!assets[i].isActive) continue;
            Asset memory a = assets[i];
            uint256 bal = IERC20(a.tokenAddress).balanceOf(address(this));
            if (bal == 0) continue;
            uint256 amountToSell = (bal * shares) / totalSharesBeforeBurn;
            if (amountToSell == 0) continue;
            _sellTokenForEth(a.tokenAddress, amountToSell, a.priceFeed);
        }

        // Return original ETH portion plus newly added ETH from sales
        return ethPortion;
    }

    /**
     * @dev Update current weights of all assets
     */
    function _updateCurrentWeights() internal {
    uint256 totalValue = getTotalValue();
        if (totalValue == 0) return;
        
        for (uint256 i = 0; i < assetCount; i++) {
            if (!assets[i].isActive) continue;
            
            uint256 balance = IERC20(assets[i].tokenAddress).balanceOf(address(this));
            if (balance > 0) {
        uint256 price = getAssetPrice(i);
        uint256 assetValue = (balance * price) / 1e18;
        assets[i].currentWeight = (assetValue * 10000) / totalValue;
            } else {
                assets[i].currentWeight = 0;
            }
        }
    }

    /**
     * @dev Perform actual rebalancing trades
     */
    function _performRebalancing() internal {
        uint256 tvl = getTotalValue();
        if (tvl == 0) return;
        if (address(swapRouter) == address(0) || WETH == address(0)) {
            _updateCurrentWeights();
            return; // cannot trade without DEX configured
        }
        for (uint256 i = 0; i < assetCount; i++) {
            if (!assets[i].isActive) continue;
            Asset memory a = assets[i];
            uint256 bal = IERC20(a.tokenAddress).balanceOf(address(this));
            uint256 price = getAssetPrice(i);
            uint256 val = (bal * price) / 1e18;
            uint256 targetVal = (tvl * a.targetWeight) / 10000;
            if (val > targetVal) {
                uint256 excessVal = val - targetVal;
                uint256 toSell = (excessVal * 1e18) / price;
                if (toSell > 0) _sellTokenForEth(a.tokenAddress, toSell, a.priceFeed);
            } else if (val < targetVal) {
                uint256 deficitVal = targetVal - val;
                uint256 ethToUse = deficitVal > address(this).balance ? address(this).balance : deficitVal;
                if (ethToUse > 0) _buyTokenWithEth(a.tokenAddress, ethToUse, a.priceFeed);
            }
        }
        _updateCurrentWeights();
    }

    struct TradeSuggestion {
        address token;
        uint256 currentWeight; // bps
        uint256 targetWeight; // bps
        uint256 deltaWeight;  // bps absolute
        bool sell;            // true=sell, false=buy
        uint256 tokenAmount;  // token amount to trade
        uint256 value;        // value in ETH units (1e18)
    }

    function previewRebalance() external view returns (TradeSuggestion[] memory suggestions) {
        uint256 tvl = getTotalValue();
        if (tvl == 0 || assetCount == 0) {
            return new TradeSuggestion[](0);
        }

        // First count items exceeding threshold
        uint256 count = 0;
        for (uint256 i = 0; i < assetCount; i++) {
            if (!assets[i].isActive) continue;
            Asset memory a = assets[i];
            uint256 bal = IERC20(a.tokenAddress).balanceOf(address(this));
            uint256 price = getAssetPrice(i);
            uint256 val = (bal * price) / 1e18;
            uint256 currW = (val * 10000) / tvl;
            uint256 tgtW = a.targetWeight;
            uint256 diff = currW > tgtW ? (currW - tgtW) : (tgtW - currW);
            if (diff > rebalanceThreshold) count++;
        }

        suggestions = new TradeSuggestion[](count);
        if (count == 0) return suggestions;

        uint256 idx = 0;
        for (uint256 i = 0; i < assetCount; i++) {
            if (!assets[i].isActive) continue;
            Asset memory a = assets[i];
            uint256 bal = IERC20(a.tokenAddress).balanceOf(address(this));
            uint256 price = getAssetPrice(i);
            uint256 val = (bal * price) / 1e18;
            uint256 currW = (val * 10000) / tvl;
            uint256 tgtW = a.targetWeight;
            uint256 diff = currW > tgtW ? (currW - tgtW) : (tgtW - currW);
            if (diff <= rebalanceThreshold) continue;

            uint256 targetVal = (tvl * tgtW) / 10000;
            if (val > targetVal) {
                uint256 excessVal = val - targetVal;
                uint256 toSell = (excessVal * 1e18) / price;
                suggestions[idx] = TradeSuggestion({
                    token: a.tokenAddress,
                    currentWeight: currW,
                    targetWeight: tgtW,
                    deltaWeight: diff,
                    sell: true,
                    tokenAmount: toSell,
                    value: excessVal
                });
            } else {
                uint256 deficitVal = targetVal - val;
                uint256 toBuy = (deficitVal * 1e18) / price;
                suggestions[idx] = TradeSuggestion({
                    token: a.tokenAddress,
                    currentWeight: currW,
                    targetWeight: tgtW,
                    deltaWeight: diff,
                    sell: false,
                    tokenAmount: toBuy,
                    value: deficitVal
                });
            }
            idx++;
        }
    }

    // --------- DEX configuration and helpers ---------
    function setDEX(address router, address weth) external onlyOwner {
        require(router != address(0) && weth != address(0), "invalid DEX");
        swapRouter = ISwapRouterV3(router);
        WETH = weth;
        emit DexConfigured(router, weth);
    }

    function setPoolFee(address token, uint24 fee) external onlyOwner {
        poolFee[token] = fee;
        emit PoolFeeSet(token, fee);
    }

    function _buyTokenWithEth(address token, uint256 ethAmount, address priceFeedAddr) internal {
        // Wrap ETH
        IWETH(WETH).deposit{value: ethAmount}();
        IERC20(WETH).safeApprove(address(swapRouter), 0);
        IERC20(WETH).safeApprove(address(swapRouter), ethAmount);

        uint24 feeTier = poolFee[token];
        if (feeTier == 0) feeTier = 3000;

        // Estimate minOut via Chainlink price and maxSlippage
        uint256 price = _scalePrice(priceFeedAddr);
        uint256 expectedOut = (ethAmount * 1e18) / price;
        uint256 minOut = expectedOut - ((expectedOut * maxSlippage) / 10000);

        ISwapRouterV3.ExactInputSingleParams memory p = ISwapRouterV3.ExactInputSingleParams({
            tokenIn: WETH,
            tokenOut: token,
            fee: feeTier,
            recipient: address(this),
            deadline: block.timestamp + 600,
            amountIn: ethAmount,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0
        });

        swapRouter.exactInputSingle(p);
    }

    function _sellTokenForEth(address token, uint256 amountIn, address priceFeedAddr) internal {
        IERC20(token).safeApprove(address(swapRouter), 0);
        IERC20(token).safeApprove(address(swapRouter), amountIn);

        uint24 feeTier = poolFee[token];
        if (feeTier == 0) feeTier = 3000;

        uint256 price = _scalePrice(priceFeedAddr);
        uint256 expectedOut = (amountIn * price) / 1e18;
        uint256 minOut = expectedOut - ((expectedOut * maxSlippage) / 10000);

        ISwapRouterV3.ExactInputSingleParams memory p = ISwapRouterV3.ExactInputSingleParams({
            tokenIn: token,
            tokenOut: WETH,
            fee: feeTier,
            recipient: address(this),
            deadline: block.timestamp + 600,
            amountIn: amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0
        });

        uint256 wethOut = swapRouter.exactInputSingle(p);
        IWETH(WETH).withdraw(wethOut);
    }

    function _scalePrice(address priceFeedAddr) internal view returns (uint256) {
        AggregatorV3Interface pf = AggregatorV3Interface(priceFeedAddr);
        (, int256 price, , , ) = pf.latestRoundData();
        require(price > 0, "Invalid price");
        uint8 dec = pf.decimals();
        if (dec < 18) return uint256(price) * (10 ** (18 - dec));
        if (dec > 18) return uint256(price) / (10 ** (dec - 18));
        return uint256(price);
    }

    // Admin functions
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }

    function setFees(uint256 _managementFee, uint256 _performanceFee) external onlyOwner {
        managementFee = _managementFee;
        performanceFee = _performanceFee;
    }

    function setMinInvestment(uint256 _minInvestment) external onlyOwner {
        minInvestment = _minInvestment;
    }

    function setRebalanceThreshold(uint256 _threshold) external onlyOwner {
        rebalanceThreshold = _threshold;
    }

    function pause() external onlyOwner {
        isPaused = true;
    }

    function unpause() external onlyOwner {
        isPaused = false;
    }

    // Emergency functions
    function emergencyWithdraw(address token) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(address(this).balance);
        } else {
            IERC20(token).safeTransfer(owner(), IERC20(token).balanceOf(address(this)));
        }
    }

    receive() external payable {}
}
