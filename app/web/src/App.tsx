import { useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import Navigation from './components/Navigation';
import TokenOperations from './components/pages/TokenOperations';
import PoolOperations from './components/pages/PoolOperations';
import LiquidityOperations from './components/pages/LiquidityOperations';
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
          <BrowserRouter>
            <div className="app">
              <Navigation />
              <main className="app-main">
                <Routes>
                  <Route path="/" element={<Navigate to="/tokens" replace />} />
                  <Route path="/tokens" element={<TokenOperations />} />
                  <Route path="/pools" element={<PoolOperations />} />
                  <Route path="/liquidity" element={<LiquidityOperations />} />
                </Routes>
              </main>
            </div>
          </BrowserRouter>
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

