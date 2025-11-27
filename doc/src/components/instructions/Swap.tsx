import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useAnySwap } from '../../App';
import { useStorage } from '../../contexts/StorageContext';
import { BN } from '@coral-xyz/anchor';
import * as token from '@solana/spl-token';
import type { ChainPoolInfo } from '../../types/anyswap';

interface TokenSwapItem {
  mint: string;
  decimals: number;
  weight: string;
  status: 'input' | 'output' | 'none';  // 输入、输出、不参与
  amount: string;
}

export default function Swap() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { anyswap: client } = useAnySwap();
  const { pools: savedPools } = useStorage();
  
  const [poolAddress, setPoolAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [tokens, setTokens] = useState<TokenSwapItem[]>([]);

  useEffect(() => {
    if (savedPools.length > 0 && !poolAddress) {
      setPoolAddress(savedPools[0]);
    }
  }, [savedPools, poolAddress]);

  useEffect(() => {
    const loadPoolTokens = async () => {
      if (!poolAddress || !client || !connection) return;
      
      try {
        const pool = new PublicKey(poolAddress);
        const poolInfo = await client.getPoolInfo(pool) as ChainPoolInfo;
        
        const items: TokenSwapItem[] = [];
        for (const t of poolInfo.tokens) {
          try {
            const mintInfo = await token.getMint(connection, t.mintAccount);
            items.push({
              mint: t.mintAccount.toString(),
              decimals: mintInfo.decimals,
              weight: t.weight.toString(),
              status: 'none',  // 默认为不参与
              amount: '',
            });
          } catch (error) {
            console.error('获取 mint 信息失败:', error);
          }
        }
        
        setTokens(items);
      } catch (error) {
        console.error('加载 Pool tokens 失败:', error);
        setTokens([]);
      }
    };
    
    loadPoolTokens();
  }, [poolAddress, client, connection]);

  const handleStatusChange = (mint: string, status: 'input' | 'output' | 'none') => {
    setTokens(prev => prev.map(t => 
      t.mint === mint ? { ...t, status, amount: status === 'none' ? '' : t.amount } : t
    ));
  };

  const handleAmountChange = (mint: string, value: string) => {
    setTokens(prev => prev.map(t => 
      t.mint === mint ? { ...t, amount: value } : t
    ));
  };

  const handleSwap = async () => {
    if (!client || !publicKey || !poolAddress || !connection) {
      setStatus('请填写所有必需字段');
      return;
    }

    const inputTokens = tokens.filter(t => t.status === 'input' && t.amount && parseFloat(t.amount) > 0);
    const outputTokens = tokens.filter(t => t.status === 'output' && t.amount && parseFloat(t.amount) > 0);

    if (inputTokens.length === 0 || outputTokens.length === 0) {
      setStatus('请至少选择一个输入 Token 和一个输出 Token，并填写数量');
      return;
    }

    setLoading(true);
    setStatus('正在执行 Swap...');

    try {
      const pool = new PublicKey(poolAddress);

      const inlets = [];
      for (const t of inputTokens) {
        const mint = new PublicKey(t.mint);
        const amountInSmallestUnit = Math.floor(parseFloat(t.amount) * Math.pow(10, t.decimals));
        const userAccount = await token.getAssociatedTokenAddress(mint, publicKey);
        const vault = client.getVault(pool, mint);

        inlets.push({
          amount: new BN(amountInSmallestUnit),
          vault,
          user: userAccount,
        });
      }

      const outlets = [];
      for (const t of outputTokens) {
        const mint = new PublicKey(t.mint);
        const amountInSmallestUnit = Math.floor(parseFloat(t.amount) * Math.pow(10, t.decimals));
        const userAccount = await token.getAssociatedTokenAddress(mint, publicKey);
        const vault = client.getVault(pool, mint);

        outlets.push({
          amount: new BN(amountInSmallestUnit),
          vault,
          user: userAccount,
        });
      }

      const signature = await client.swap(pool, inlets, outlets);

      setStatus(`✅ Swap 成功！\n交易签名: ${signature.slice(0, 8)}...`);
      
      // 清空数量
      setTokens(prev => prev.map(t => ({ ...t, amount: '' })));
    } catch (error) {
      const err = error as Error;
      setStatus(`❌ Swap 失败: ${err.message}`);
      console.error('Swap 错误:', error);
    } finally {
      setLoading(false);
    }
  };

  const inputTokens = tokens.filter(t => t.status === 'input');
  const outputTokens = tokens.filter(t => t.status === 'output');

  return (
    <div className="instruction-card">
      <h3>Token 交换 (Swap)</h3>
      
      <div className="form-group">
        <label>Pool 地址:</label>
        <select
          value={poolAddress}
          onChange={(e) => setPoolAddress(e.target.value)}
          disabled={loading}
          className="form-select"
        >
          <option value="">-- 选择 Pool --</option>
          {savedPools.map((pool) => (
            <option key={pool} value={pool}>
              {pool.slice(0, 8)}...{pool.slice(-8)}
            </option>
          ))}
        </select>
        
        <input
          type="text"
          value={poolAddress}
          onChange={(e) => setPoolAddress(e.target.value)}
          placeholder="或手动输入 Pool 地址"
          disabled={loading}
          className="form-input"
        />
        
        {tokens.length > 0 && (
          <>
            <div className="info-text" style={{ marginTop: '20px', marginBottom: '10px' }}>
              选择输入/输出 Token 并填写数量:
            </div>
            {tokens.map((item, index) => (
              <div 
                key={item.mint} 
                style={{ 
                  marginBottom: '15px', 
                  padding: '10px', 
                  border: item.status === 'none' ? '1px solid #ddd' : item.status === 'input' ? '2px solid #4CAF50' : '2px solid #2196F3',
                  borderRadius: '5px',
                  backgroundColor: item.status === 'none' ? 'transparent' : item.status === 'input' ? '#f1f8f4' : '#e3f2fd'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ flex: 1 }}>
                    Token {index + 1}: {item.mint.slice(0, 8)}...{item.mint.slice(-8)}
                  </strong>
                  <select
                    value={item.status}
                    onChange={(e) => handleStatusChange(item.mint, e.target.value as 'input' | 'output' | 'none')}
                    disabled={loading}
                    style={{ marginLeft: '10px', padding: '4px 8px', borderRadius: '4px' }}
                  >
                    <option value="none">⊘ 不参与</option>
                    <option value="input">↓ 输入 (从钱包)</option>
                    <option value="output">↑ 输出 (到钱包)</option>
                  </select>
                </div>
                <div style={{ fontSize: '0.9em', color: '#666', marginBottom: '8px' }}>
                  权重: {item.weight}, 小数位: {item.decimals}
                </div>
                {item.status !== 'none' && (
                  <input
                    type="number"
                    value={item.amount}
                    onChange={(e) => handleAmountChange(item.mint, e.target.value)}
                    placeholder={`输入${item.status === 'input' ? '支付' : '接收'}数量`}
                    disabled={loading}
                    className="form-input"
                    step={`0.${'0'.repeat(Math.max(0, item.decimals - 1))}1`}
                  />
                )}
              </div>
            ))}
            
            <div className="info-text" style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '5px' }}>
              <div><strong>输入 Tokens:</strong> {inputTokens.length > 0 ? inputTokens.map(t => `${t.amount} (${t.mint.slice(0, 8)}...)`).join(', ') : '未选择'}</div>
              <div style={{ marginTop: '5px' }}><strong>输出 Tokens:</strong> {outputTokens.length > 0 ? outputTokens.map(t => `${t.amount} (${t.mint.slice(0, 8)}...)`).join(', ') : '未选择'}</div>
            </div>
          </>
        )}
        
        <button
          onClick={handleSwap}
          disabled={loading || !publicKey || !client || !poolAddress || tokens.length === 0}
          className="action-button primary"
          style={{ marginTop: '15px' }}
        >
          {loading ? '交换中...' : '执行 Swap'}
        </button>
      </div>
      
      {status && (
        <div className={`status-message ${status.includes('✅') ? 'success' : status.includes('❌') ? 'error' : ''}`} style={{ whiteSpace: 'pre-line' }}>
          {status}
        </div>
      )}
    </div>
  );
}

