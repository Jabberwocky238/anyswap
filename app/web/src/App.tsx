import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import AnySwapTest from './components/AnySwapTest';
import ErrorBoundary from './components/ErrorBoundary';
import '@solana/wallet-adapter-react-ui/styles.css';
import './App.css';

function App() {
  // 强制使用测试网
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => {
    // 确保使用测试网
    return clusterApiUrl(network);
  }, [network]);


  // 在开发模式下，可以选择不使用 ErrorBoundary 以查看 Vite 的错误覆盖层
  const useErrorBoundary = false;

  const appContent = (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[new PhantomWalletAdapter()]} autoConnect>
        <WalletModalProvider>
          <div className="app">
            <header className="app-header">
              <h1>AnySwap 测试页面</h1>
              <p>使用 Phantom 钱包在测试网测试 AnySwap 协议</p>
            </header>
            <main className="app-main">
              <AnySwapTest />
            </main>
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );

  return useErrorBoundary ? (
    <ErrorBoundary>{appContent}</ErrorBoundary>
  ) : (
    appContent
  );
}

export default App;

