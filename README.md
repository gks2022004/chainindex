# ChainIndex - Onchain Index Funds

A decentralized platform for creating and investing in index funds on Ethereum. Built with Solidity, Hardhat, and Next.js.

## 🚀 Features

### Smart Contracts
- **ChainIndexFund**: Core index fund contract with automated rebalancing
- **ChainIndexFactory**: Factory contract for creating new index funds
- **Mock Contracts**: ERC20 tokens and price feeds for testing

### Frontend
- **Next.js** application with TypeScript
- **RainbowKit** for wallet connection
- **Wagmi** for Ethereum interactions
- **Tailwind CSS** for styling
- Responsive design with dark mode support

### Key Capabilities
- ✅ Create custom index funds with configurable weights
- ✅ Automated rebalancing based on target allocations
- ✅ Chainlink price feeds for accurate asset pricing
- ✅ Management and performance fees
- ✅ Transparent on-chain operations
- ✅ Factory pattern for multiple fund deployment

## 🏗️ Project Structure

```
chainindex/
├── contracts/                 # Solidity smart contracts
│   ├── ChainIndexFund.sol    # Main index fund contract
│   ├── ChainIndexFactory.sol # Factory for creating funds
│   ├── MockERC20.sol         # Mock ERC20 for testing
│   └── MockPriceFeed.sol     # Mock price feed for testing
├── test/                     # Contract tests
├── scripts/                  # Deployment scripts
├── frontend/                 # Next.js frontend
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/           # Next.js pages
│   │   └── styles/          # CSS styles
└── deployments/             # Deployment artifacts
```

## 🛠️ Installation & Setup

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Git

### 1. Install Dependencies

**Backend (Smart Contracts):**
```bash
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

### 2. Environment Setup

Copy the environment example file:
```bash
copy .env.example .env
```

Update `.env` with your values:
```env
PRIVATE_KEY=your_private_key_here
SEPOLIA_URL=https://sepolia.infura.io/v3/your_project_id
MAINNET_URL=https://mainnet.infura.io/v3/your_project_id
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### 3. Compile Contracts

```bash
npx hardhat compile
```

### 4. Run Tests

```bash
npx hardhat test
```

### 5. Deploy Contracts

**Local Development:**
```bash
# Start local Hardhat node
npx hardhat node

# Deploy to local network (in another terminal)
npx hardhat run scripts/deploy.js --network localhost
```

**Testnet (Sepolia):**
```bash
npx hardhat run scripts/deploy.js --network sepolia
```

### 6. Start Frontend

```bash
cd frontend
npm run dev
```

Visit `http://localhost:3000` to see the application.

## 📖 Usage

### Creating an Index Fund

1. Connect your wallet using the "Connect" button
2. Click "Create Fund" 
3. Fill in fund details:
   - Fund Name (e.g., "Crypto Top 10 Index")
   - Symbol (e.g., "CT10")
   - Management Fee (in basis points, e.g., 200 = 2%)
   - Performance Fee (in basis points, e.g., 1000 = 10%)
4. Pay the 0.01 ETH creation fee
5. Confirm the transaction

### Managing an Index Fund

After creating a fund, you can:
- Add assets with target weights
- Update asset allocations
- Trigger rebalancing
- Collect management fees
- Pause/unpause the fund

### Investing in a Fund

1. Browse available funds on the main page
2. Click "View Details" on a fund
3. Enter investment amount
4. Confirm transaction
5. Receive index fund tokens

## 🔧 Smart Contract Architecture

### ChainIndexFund
The core contract that manages individual index funds:

- **Assets Management**: Add/remove/update assets with target weights
- **Deposits/Withdrawals**: ETH-based investing with proportional shares
- **Rebalancing**: Automated rebalancing when thresholds are exceeded
- **Fee Collection**: Management and performance fee mechanisms
- **Oracle Integration**: Chainlink price feeds for asset valuation

### ChainIndexFactory
Factory contract for deploying new index funds:

- **Fund Creation**: Deploy new ChainIndexFund instances
- **Fund Registry**: Track all created funds and their metadata
- **Access Control**: Admin functions for fund management
- **Fee Collection**: Creation fees and revenue sharing

## 🧪 Testing

The project includes comprehensive tests for:

- **ChainIndexFund**: Asset management, deposits, withdrawals, rebalancing
- **ChainIndexFactory**: Fund creation, registry management
- **Mock Contracts**: Price feed updates, token minting

Run tests with:
```bash
npx hardhat test
```

Generate coverage report:
```bash
npx hardhat coverage
```

## 🚀 Deployment

### Local Development
```bash
npm run node        # Start Hardhat node
npm run deploy:local # Deploy contracts
npm run dev         # Start frontend
```

### Testnet
```bash
npm run deploy:testnet
```

### Production
```bash
npm run deploy:mainnet
npm run build
npm run start
```

## 📊 Contract Addresses

After deployment, contract addresses are saved in `deployments/{network}.json`:

```json
{
  "network": "sepolia",
  "deployer": "0x...",
  "factory": "0x...",
  "mockTokens": {
    "WBTC": "0x...",
    "USDC": "0x...",
    "LINK": "0x..."
  }
}
```

## 🔐 Security Considerations

- **Auditing**: Contracts should be audited before mainnet deployment
- **Access Control**: Proper ownership and role management
- **Reentrancy Protection**: ReentrancyGuard on critical functions
- **Price Oracle**: Chainlink integration with fallback mechanisms
- **Emergency Functions**: Pause functionality and emergency withdrawals

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Open an issue on GitHub
- Join our Discord community
- Check the documentation

## 🗺️ Roadmap

- [x] Basic index fund functionality
- [x] Factory pattern implementation
- [x] Frontend interface
- [ ] DEX integration for automated trading
- [ ] Advanced rebalancing strategies
- [ ] Governance token and DAO
- [ ] Mobile application
- [ ] Multi-chain support

## ⚠️ Disclaimer

This software is experimental and provided "as is". Use at your own risk. Always do your own research before investing in any financial products.
