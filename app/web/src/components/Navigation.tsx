import { Link, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import './Navigation.css';

export default function Navigation() {
  const location = useLocation();
  const wallet = useWallet();
  const { publicKey } = wallet;

  return (
    <nav className="navigation">
      <div className="nav-header">
        <h1>AnySwap</h1>
        <WalletMultiButton />
      </div>
      {publicKey && (
        <div className="wallet-info">
          <p>已连接: {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}</p>
          <p>网络: Devnet</p>
        </div>
      )}
      <div className="nav-links">
        <Link 
          to="/tokens" 
          className={location.pathname === '/tokens' ? 'active' : ''}
        >
          Token 操作
        </Link>
        <Link 
          to="/pools" 
          className={location.pathname === '/pools' ? 'active' : ''}
        >
          Pool 操作
        </Link>
        <Link 
          to="/liquidity" 
          className={location.pathname === '/liquidity' ? 'active' : ''}
        >
          流动性操作
        </Link>
      </div>
    </nav>
  );
}

