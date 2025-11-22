import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import CreateToken from '../CreateToken';
import MintToken from '../MintToken';
import CreatedTokensList from '../CreatedTokensList';
import StatusDisplay from '../StatusDisplay';

interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  mint: string;
}

export default function TokenOperations() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, signTransaction } = wallet;
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [createdTokens, setCreatedTokens] = useState<TokenInfo[]>([]);

  // 从 localStorage 加载已创建的 tokens
  useEffect(() => {
    const savedTokens = localStorage.getItem('anyswap_created_tokens');
    if (savedTokens) {
      try {
        const tokens = JSON.parse(savedTokens);
        setCreatedTokens(tokens);
      } catch (e) {
        console.error('Failed to load saved tokens:', e);
      }
    }
  }, []);

  const handleTokenCreated = (tokenInfo: TokenInfo) => {
    const updatedTokens = [...createdTokens, tokenInfo];
    setCreatedTokens(updatedTokens);
    localStorage.setItem('anyswap_created_tokens', JSON.stringify(updatedTokens));
  };

  return (
    <div className="page-container">
      <h1>Token 操作</h1>
      <p className="page-description">创建和管理 Token</p>

      <div className="actions-section">
        <CreateToken
          connection={connection}
          publicKey={publicKey}
          signTransaction={signTransaction}
          onTokenCreated={handleTokenCreated}
          onStatusChange={setStatus}
          onLoadingChange={setLoading}
        />

        <CreatedTokensList tokens={createdTokens} />

        <MintToken
          connection={connection}
          publicKey={publicKey}
          signTransaction={signTransaction}
          createdTokens={createdTokens}
          onStatusChange={setStatus}
          onLoadingChange={setLoading}
        />
      </div>

      <StatusDisplay
        status={status}
        loading={loading}
        idlError=""
      />
    </div>
  );
}

