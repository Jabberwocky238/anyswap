import { useMemo, createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { AnySwap, IDL } from 'anyswap';
import { StorageProvider } from './contexts/StorageContext';
import Navigation from './components/Navigation';
import TokenOperations from './components/pages/TokenOperations';
import PoolOperations from './components/pages/PoolOperations';
import LiquidityOperations from './components/pages/LiquidityOperations';
import '@solana/wallet-adapter-react-ui/styles.css';
import './App.css';

// 创建 AnySwap Context
interface AnySwapContextType {
  anyswap: AnySwap | null;
  program: Program<Idl> | null;
}

const AnySwapContext = createContext<AnySwapContextType>({
  anyswap: null,
  program: null,
});

export const useAnySwap = () => useContext(AnySwapContext);

// AnySwap Provider 组件
function AnySwapProvider({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [anyswap, setAnyswap] = useState<AnySwap | null>(null);
  const [program, setProgram] = useState<Program<Idl> | null>(null);

  useEffect(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      setAnyswap(null);
      setProgram(null);
      return;
    }

    try {
      // 创建符合 Anchor Wallet 接口的对象
      const anchorWallet = {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction!.bind(wallet),
        signAllTransactions: wallet.signAllTransactions!.bind(wallet),
      };

      // 创建 Provider
      const provider = new AnchorProvider(
        connection,
        anchorWallet,
        { 
          commitment: 'confirmed',
          preflightCommitment: 'confirmed',
        }
      );

      // 创建 Program
      const programInstance = new Program(IDL as Idl, provider);

      // 创建 AnySwap 实例
      const anyswapInstance = new AnySwap(provider);

      setProgram(programInstance);
      setAnyswap(anyswapInstance);
      
      console.log('✅ AnySwap 初始化成功');
    } catch (error) {
      console.error('❌ 初始化 AnySwap 失败:', error);
      setAnyswap(null);
      setProgram(null);
    }
  }, [connection, wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]);

  return (
    <AnySwapContext.Provider value={{ anyswap, program }}>
      {children}
    </AnySwapContext.Provider>
  );
}

function App() {
  // 使用本地测试网进行开发
  // 可以改为 WalletAdapterNetwork.Devnet 或 WalletAdapterNetwork.Testnet
  const endpoint = useMemo(() => {
    // 本地网络
    return 'http://localhost:8899';
    
    // 或使用 devnet（取消注释下面这行）
    // return clusterApiUrl(WalletAdapterNetwork.Devnet);
  }, []);

  const appContent = (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[new PhantomWalletAdapter()]} autoConnect>
        <WalletModalProvider>
          <StorageProvider>
            <AnySwapProvider>
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
            </AnySwapProvider>
          </StorageProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );

  return appContent
}

export default App;

