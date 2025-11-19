import { useState } from 'react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { handleMintToken } from './utils';

interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  mint: string;
}

interface MintTokenProps {
  connection: Connection | null;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | undefined;
  createdTokens: TokenInfo[];
  onStatusChange: (status: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

export default function MintToken({
  connection,
  publicKey,
  signTransaction,
  createdTokens,
  onStatusChange,
  onLoadingChange,
}: MintTokenProps) {
  const [selectedMintToken, setSelectedMintToken] = useState<string>('');
  const [mintAmount, setMintAmount] = useState<string>('');

  const handleMint = async () => {
    if (!connection || !publicKey || !signTransaction) {
      onStatusChange('请先连接钱包');
      return;
    }

    if (!selectedMintToken || !mintAmount) {
      onStatusChange('请选择 Token 并输入数量');
      return;
    }

    const amount = parseFloat(mintAmount);
    if (isNaN(amount)) {
      onStatusChange('请输入有效的数量');
      return;
    }

    // 查找 token 信息以获取小数位数
    const tokenInfo = createdTokens.find(t => t.mint === selectedMintToken);
    if (!tokenInfo) {
      onStatusChange('找不到 Token 信息');
      return;
    }

    onLoadingChange(true);
    onStatusChange('正在 Mint Token...');

    try {
      const result = await handleMintToken(
        connection,
        publicKey,
        signTransaction,
        selectedMintToken,
        amount,
        tokenInfo.decimals
      );

      onStatusChange(`Token Mint 成功！\n数量: ${result.amount} ${tokenInfo.symbol}\n账户: ${result.userTokenAccount}\n交易签名: ${result.signature}`);
      
      // 清空输入
      setMintAmount('');
    } catch (error: any) {
      onStatusChange(`Mint Token 失败: ${error.message}`);
      console.error('Mint Token 错误:', error);
    } finally {
      onLoadingChange(false);
    }
  };

  return (
    <div>
      <h2>Mint Token 给自己</h2>
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
        {createdTokens.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
            请先创建 Token
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                选择 Token:
              </label>
              <select
                value={selectedMintToken}
                onChange={(e) => setSelectedMintToken(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
              >
                <option value="">选择 Token...</option>
                {createdTokens.map((token, idx) => (
                  <option key={idx} value={token.mint}>
                    {token.name} ({token.symbol}) - {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                数量:
              </label>
              <input
                type="number"
                placeholder="例如: 1000"
                value={mintAmount}
                onChange={(e) => setMintAmount(e.target.value)}
                min="0"
                step="0.000000001"
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
              />
              {selectedMintToken && (() => {
                const tokenInfo = createdTokens.find(t => t.mint === selectedMintToken);
                return tokenInfo ? (
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    小数位数: {tokenInfo.decimals}
                  </div>
                ) : null;
              })()}
            </div>
            <button
              onClick={handleMint}
              disabled={!publicKey || !signTransaction || !selectedMintToken || !mintAmount}
              className="action-button primary"
              style={{ width: '100%' }}
            >
              Mint Token 给自己
            </button>
          </>
        )}
      </div>
    </div>
  );
}

