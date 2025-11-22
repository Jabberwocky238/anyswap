import { useState } from 'react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { handleCreateToken } from './utils';

interface CreateTokenProps {
  connection: Connection | null;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | undefined;
  onTokenCreated: (tokenInfo: { name: string; symbol: string; decimals: number; mint: string }) => void;
  onStatusChange: (status: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

export default function CreateToken({
  connection,
  publicKey,
  signTransaction,
  onTokenCreated,
  onStatusChange,
  onLoadingChange,
}: CreateTokenProps) {
  const [tokenName, setTokenName] = useState<string>('');
  const [tokenSymbol, setTokenSymbol] = useState<string>('');
  const [tokenDecimals, setTokenDecimals] = useState<string>('9');

  const handleCreate = async () => {
    if (!connection || !publicKey || !signTransaction) {
      onStatusChange('请先连接钱包');
      return;
    }

    const decimals = parseInt(tokenDecimals);
    if (isNaN(decimals)) {
      onStatusChange('请输入有效的小数位数');
      return;
    }

    onLoadingChange(true);
    onStatusChange('正在创建 Token...');

    try {
      const result = await handleCreateToken(
        connection,
        publicKey,
        signTransaction,
        tokenName,
        tokenSymbol,
        decimals
      );

      onTokenCreated({
        name: result.name,
        symbol: result.symbol,
        decimals: result.decimals,
        mint: result.mint.toString(),
      });
      
      onStatusChange(`Token 创建成功！\n名称: ${result.name}\n符号: ${result.symbol}\n小数位数: ${result.decimals}\nMint 地址: ${result.mint.toString()}\n交易签名: ${result.signature || '已确认'}`);
      
      // 清空输入框
      setTokenName('');
      setTokenSymbol('');
      setTokenDecimals('9');
    } catch (error: any) {
      onStatusChange(`创建 Token 失败: ${error.message}`);
      console.error('创建 Token 错误:', error);
    } finally {
      onLoadingChange(false);
    }
  };

  return (
    <div>
      <h2>创建 Token</h2>
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Token 名称:
          </label>
          <input
            type="text"
            placeholder="例如: My Token"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Token 符号:
          </label>
          <input
            type="text"
            placeholder="例如: MTK"
            value={tokenSymbol}
            onChange={(e) => setTokenSymbol(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            小数位数 (0-9):
          </label>
          <input
            type="number"
            placeholder="例如: 9"
            value={tokenDecimals}
            onChange={(e) => setTokenDecimals(e.target.value)}
            min="0"
            max="9"
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={!publicKey || !signTransaction}
          className="action-button primary"
          style={{ width: '100%' }}
        >
          创建 Token
        </button>
      </div>
    </div>
  );
}

