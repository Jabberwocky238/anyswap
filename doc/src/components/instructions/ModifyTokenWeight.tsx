import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAnySwap } from '../../App';
import { useStorage } from '../../contexts/StorageContext';
import { BN } from '@coral-xyz/anchor';
import type { ChainPoolInfo, PoolToken } from '../../types/anyswap';

export default function ModifyTokenWeight() {
  const { publicKey } = useWallet();
  const { anyswap: client } = useAnySwap();
  const { pools: savedPools } = useStorage();
  
  const [poolAddress, setPoolAddress] = useState('');
  const [selectedMint, setSelectedMint] = useState('');
  const [newWeight, setNewWeight] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [poolTokens, setPoolTokens] = useState<PoolToken[]>([]);

  useEffect(() => {
    if (savedPools.length > 0 && !poolAddress) {
      setPoolAddress(savedPools[0]);
    }
  }, [savedPools, poolAddress]);

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

  const handleModifyWeight = async () => {
    if (!client || !publicKey || !poolAddress || !selectedMint || !newWeight) {
      setStatus('请填写所有必需字段');
      return;
    }

    const weightNum = parseInt(newWeight);
    if (isNaN(weightNum) || weightNum <= 0) {
      setStatus('请输入有效的权重（正整数）');
      return;
    }

    setLoading(true);
    setStatus('正在修改 Token 权重...');

    try {
      const mint = new PublicKey(selectedMint);
      const pool = new PublicKey(poolAddress);

      const signature = await client.modifyTokenWeight(
        pool,
        [new BN(weightNum)],
        [mint]
      );

      setStatus(`✅ Token 权重修改成功！\n交易签名: ${signature.slice(0, 8)}...`);
      
      // 重新加载 pool tokens
      setTimeout(async () => {
        try {
          const poolInfo = await client.getPoolInfo(pool) as ChainPoolInfo;
          const tokens: PoolToken[] = poolInfo.tokens.map((t) => ({
            mint: t.mintAccount.toString(),
            weight: t.weight.toString(),
            balance: t.balance ? t.balance.toString() : '0',
          }));
          setPoolTokens(tokens);
        } catch (error) {
          console.error('重新加载失败:', error);
        }
      }, 1000);
    } catch (error) {
      const err = error as Error;
      setStatus(`❌ 修改 Token 权重失败: ${err.message}`);
      console.error('修改权重错误:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentWeight = poolTokens.find(t => t.mint === selectedMint)?.weight || 'N/A';

  return (
    <div className="instruction-card">
      <h3>修改 Token 权重</h3>
      
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
        
        <label>选择 Token:</label>
        <select
          value={selectedMint}
          onChange={(e) => setSelectedMint(e.target.value)}
          disabled={loading || poolTokens.length === 0}
          className="form-select"
        >
          <option value="">-- 选择 Token --</option>
          {poolTokens.map((t) => (
            <option key={t.mint} value={t.mint}>
              {t.mint.slice(0, 8)}...{t.mint.slice(-8)} (当前权重: {t.weight})
            </option>
          ))}
        </select>
        
        {selectedMint && (
          <div className="info-text">
            当前权重: {currentWeight}
          </div>
        )}
        
        <label>新权重:</label>
        <input
          type="number"
          value={newWeight}
          onChange={(e) => setNewWeight(e.target.value)}
          placeholder="例如: 30"
          disabled={loading}
          className="form-input"
        />
        
        <button
          onClick={handleModifyWeight}
          disabled={loading || !publicKey || !client || !poolAddress || !selectedMint || !newWeight}
          className="action-button primary"
        >
          {loading ? '修改中...' : '修改权重'}
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

