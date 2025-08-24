// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ChainIndexFund.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ChainIndexFactory
 * @dev Factory contract for creating and managing index funds
 */
contract ChainIndexFactory is Ownable {
    
    struct IndexFundInfo {
        address fundAddress;
        string name;
        string symbol;
        address creator;
        uint256 createdAt;
        bool isActive;
    }

    // State variables
    mapping(uint256 => IndexFundInfo) public indexFunds;
    mapping(address => uint256[]) public creatorFunds;
    uint256 public fundCount;
    
    uint256 public creationFee; // Fee to create a new index fund
    address public feeRecipient;
    
    // Events
    event IndexFundCreated(
        uint256 indexed fundId,
        address indexed fundAddress,
        address indexed creator,
        string name,
        string symbol
    );
    
    event FundStatusChanged(uint256 indexed fundId, bool isActive);

        constructor(address _feeRecipient, uint256 _creationFee) Ownable() {
        feeRecipient = _feeRecipient;
        creationFee = _creationFee;
    }

    /**
     * @dev Create a new index fund
     */
    function createIndexFund(
        string memory name,
        string memory symbol,
        uint256 managementFee,
        uint256 performanceFee
    ) external payable returns (address fundAddress) {
        require(msg.value >= creationFee, "Insufficient creation fee");
        require(bytes(name).length > 0, "Name cannot be empty");
        require(bytes(symbol).length > 0, "Symbol cannot be empty");
        
        // Deploy new index fund
    ChainIndexFund newFund = new ChainIndexFund(
            name,
            symbol,
            msg.sender, // Creator becomes the fee recipient initially
            managementFee,
            performanceFee
        );
        
    fundAddress = address(newFund);
    // Transfer ownership to creator so they can manage the fund
    newFund.transferOwnership(msg.sender);
        
        // Store fund information
        indexFunds[fundCount] = IndexFundInfo({
            fundAddress: fundAddress,
            name: name,
            symbol: symbol,
            creator: msg.sender,
            createdAt: block.timestamp,
            isActive: true
        });
        
        creatorFunds[msg.sender].push(fundCount);
        
        emit IndexFundCreated(fundCount, fundAddress, msg.sender, name, symbol);
        
        fundCount++;
        
        // Send creation fee to fee recipient
        if (creationFee > 0) {
            payable(feeRecipient).transfer(creationFee);
        }
        
        // Return any excess ETH
        if (msg.value > creationFee) {
            payable(msg.sender).transfer(msg.value - creationFee);
        }
        
        return fundAddress;
    }

    /**
     * @dev Get all funds created by a specific address
     */
    function getFundsByCreator(address creator) external view returns (uint256[] memory) {
        return creatorFunds[creator];
    }

    /**
     * @dev Get fund information by ID
     */
    function getFundInfo(uint256 fundId) external view returns (IndexFundInfo memory) {
        require(fundId < fundCount, "Invalid fund ID");
        return indexFunds[fundId];
    }

    /**
     * @dev Get all active funds (for pagination)
     */
    function getActiveFunds(uint256 startIndex, uint256 limit) 
        external 
        view 
        returns (IndexFundInfo[] memory funds) 
    {
        require(startIndex < fundCount, "Invalid start index");
        
        uint256 end = startIndex + limit;
        if (end > fundCount) {
            end = fundCount;
        }
        
        uint256 activeCount = 0;
        for (uint256 i = startIndex; i < end; i++) {
            if (indexFunds[i].isActive) {
                activeCount++;
            }
        }
        
        funds = new IndexFundInfo[](activeCount);
        uint256 currentIndex = 0;
        
        for (uint256 i = startIndex; i < end && currentIndex < activeCount; i++) {
            if (indexFunds[i].isActive) {
                funds[currentIndex] = indexFunds[i];
                currentIndex++;
            }
        }
        
        return funds;
    }

    /**
     * @dev Deactivate a fund (admin only)
     */
    function deactivateFund(uint256 fundId) external onlyOwner {
        require(fundId < fundCount, "Invalid fund ID");
        indexFunds[fundId].isActive = false;
        emit FundStatusChanged(fundId, false);
    }

    /**
     * @dev Reactivate a fund (admin only)
     */
    function reactivateFund(uint256 fundId) external onlyOwner {
        require(fundId < fundCount, "Invalid fund ID");
        indexFunds[fundId].isActive = true;
        emit FundStatusChanged(fundId, true);
    }

    /**
     * @dev Update creation fee
     */
    function setCreationFee(uint256 _creationFee) external onlyOwner {
        creationFee = _creationFee;
    }

    /**
     * @dev Update fee recipient
     */
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }

    /**
     * @dev Withdraw collected fees
     */
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        payable(feeRecipient).transfer(balance);
    }

    receive() external payable {}
}
