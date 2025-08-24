'use client';

import '@/styles/globals.css'
import '@rainbow-me/rainbowkit/styles.css';
import type { AppProps } from 'next/app'
import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiConfig } from 'wagmi'
import { RainbowKitProvider, getDefaultWallets, connectorsForWallets } from '@rainbow-me/rainbowkit'
import { configureChains, createConfig } from 'wagmi'
import { mainnet, sepolia, hardhat } from 'wagmi/chains'
import { publicProvider } from 'wagmi/providers/public'
import { infuraProvider } from 'wagmi/providers/infura'
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets'

const providerList = [] as any[]
if (process.env.NEXT_PUBLIC_INFURA_ID) {
  providerList.push(infuraProvider({ apiKey: process.env.NEXT_PUBLIC_INFURA_ID }))
}
providerList.push(publicProvider())

const { chains, publicClient, webSocketPublicClient } = configureChains(
  [sepolia, hardhat],
  providerList
)

const wcId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
let connectors
if (wcId) {
  const res = getDefaultWallets({ appName: 'ChainIndex', projectId: wcId, chains })
  connectors = res.connectors
} else {
  // Fallback to injected-only connectors when no WalletConnect project ID is provided
  connectors = connectorsForWallets([
    {
      groupName: 'Recommended',
      wallets: [injectedWallet({ chains })],
    },
  ])
}

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors,
  publicClient,
  webSocketPublicClient,
})

const queryClient = new QueryClient()

export default function App({ Component, pageProps }: AppProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return (
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider chains={chains}>
          <Component {...pageProps} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiConfig>
  )
}
