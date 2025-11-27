import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAnySwap } from '../../App';
import { useStorage } from '../../contexts/StorageContext';
import type { ChainPoolInfo, PoolToken } from '../../types/anyswap';

export default function RemoveTokenFromPool() {
  const { publicKey } = useWallet();
  const { anyswap: client } = useAnySwap();
  const { pools: savedPools } = useStorage();
  
  const [poolAddress, setPoolAddress] = useState('');
  const [selectedMint, setSelectedMint] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [poolTokens, setPoolTokens] = useState<PoolToken[]>([]);

  // 设置默认 pool
  useEffect(() => {
    if (savedPools.length > 0 && !poolAddress) {
      setPoolAddress(savedPools[0]);
    }
  }, [savedPools, poolAddress]);

  // 加载 Pool 中的 tokens
  useEffect(() => {
    const loadPoolTokens = async () => {
      if (!poolAddress || !client) return;
      
      try {
        const pool = new PublicKey(poolAddress);
        const poolInfo = await client.getPoolInfo(pool) as ChainPoolInfo;
        
        const tokens: PoolToken[] = poolInfo.tokens.map((t) => ({
          mint: t.mintAccount.toString(),
          weight: t.weight.toString(),
          balance: t.balance ? t.balance.toString() : '0',
        }));
        
        setPoolTokens(tokens);
      } catch (error) {
        console.error('加载 Pool tokens 失败:', error);
        setPoolTokens([]);
      }
    };
    
    loadPoolTokens();
  }, [poolAddress, client]);

  const handleRemoveToken = async () => {
    if (!client || !publicKey || !poolAddress || !selectedMint) {
      setStatus('请填写所有必需字段');
      return;
    }

    setLoading(true);
    setStatus('正在移除 Token...');

    try {
      const mint = new PublicKey(selectedMint);
      const pool = new PublicKey(poolAddress);

      const signature = await client.removeTokenFromPool(pool, mint);

      setStatus(`✅ Token 移除成功！交易签名: ${signature.slice(0, 8)}...`);
      setSelectedMint('');
      
      // 重新加载 pool tokens
      setTimeout(() => {
        const loadPoolTokens = async () => {
          try {
            const poolInfo = await client.getPoolInfo(pool) as ChainPoolInfo;
            const tokens: PoolToken[] = poolInfo.tokens.map((t) => ({
              mint: t.mintAccount.toString(),
              weight: t.weight.toString(),
              balance: t.balance ? t.balance.toString() : '0',
            }));
            setPoolTokens(tokens);
          } catch (error) {
            console.error('重新加载 Pool tokens 失败:', error);
          }
        };
        loadPoolTokens();
      }, 1000);
    } catch (error) {
      const err = error as Error;
      setStatus(`❌ 移除 Token 失败: ${err.message}`);
      console.error('移除 Token 错误:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="instruction-card">
      <h3>从 Pool 移除 Token</h3>
      
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
        
        <label>选择要移除的 Token:</label>
        <select
          value={selectedMint}
          onChange={(e) => setSelectedMint(e.target.value)}
          disabled={loading || poolTokens.length === 0}
          className="form-select"
        >
          <option value="">-- 选择 Token --</option>
          {poolTokens.map((t) => (
            <option key={t.mint} value={t.mint}>
              {t.mint.slice(0, 8)}...{t.mint.slice(-8)} (权重: {t.weight}, 余额: {t.balance})
            </option>
          ))}
        </select>
        
        <button
          onClick={handleRemoveToken}
          disabled={loading || !publicKey || !client || !poolAddress || !selectedMint}
          className="action-button danger"
        >
          {loading ? '移除中...' : '移除 Token'}
        </button>
      </div>
      
      {status && (
        <div className={`status-message ${status.includes('✅') ? 'success' : status.includes('❌') ? 'error' : ''}`}>
          {status}
        </div>
      )}
    </div>
  );
}

