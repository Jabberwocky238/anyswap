import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useAnySwap } from '../../App';
import { useStorage } from '../../contexts/StorageContext';
import { BN } from '@coral-xyz/anchor';
import * as token from '@solana/spl-token';
import type { UserTokenAccount, ChainPoolInfo } from '../../types/anyswap';

export default function AddTokenToPool() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { anyswap: client } = useAnySwap();
  const { pools: savedPools } = useStorage();
  
  const [poolAddress, setPoolAddress] = useState('');
  const [selectedMint, setSelectedMint] = useState('');
  const [customMint, setCustomMint] = useState('');
  const [weight, setWeight] = useState('20');
  const [liquidity, setLiquidity] = useState('1000');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [userTokens, setUserTokens] = useState<UserTokenAccount[]>([]);

  // 设置默认 pool
  useEffect(() => {
    if (savedPools.length > 0 && !poolAddress) {
      setPoolAddress(savedPools[0]);
    }
  }, [savedPools, poolAddress]);

  // 加载用户的 token 账户
  useEffect(() => {
    const loadUserTokens = async () => {
      if (!publicKey || !connection) return;
      
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: token.TOKEN_PROGRAM_ID }
        );
        
        const tokens: UserTokenAccount[] = tokenAccounts.value
          .map((account) => {
            const parsed = account.account.data.parsed.info;
            return {
              mint: parsed.mint as string,
              balance: parsed.tokenAmount.uiAmountString as string,
              decimals: parsed.tokenAmount.decimals as number,
            };
          })
          .filter(t => parseFloat(t.balance) > 0);
        
        setUserTokens(tokens);
      } catch (error) {
        console.error('加载用户 token 失败:', error);
      }
    };
    
    loadUserTokens();
  }, [publicKey, connection]);

  const handleAddToken = async () => {
    if (!client || !publicKey || !poolAddress || !connection) {
      setStatus('请填写所有必需字段');
      return;
    }

    const mintAddress = customMint || selectedMint;
    if (!mintAddress) {
      setStatus('请选择或输入 Token Mint 地址');
      return;
    }

    const weightNum = parseInt(weight);
    const liquidityNum = parseFloat(liquidity);

    if (isNaN(weightNum) || isNaN(liquidityNum) || weightNum <= 0 || liquidityNum < 0) {
      setStatus('请输入有效的权重和流动性数量');
      return;
    }

    setLoading(true);
    setStatus('正在添加 Token...');

    try {
      const mint = new PublicKey(mintAddress);
      const pool = new PublicKey(poolAddress);

      // 获取 mint 信息以获取小数位数
      const mintInfo = await token.getMint(connection, mint);
      const decimals = mintInfo.decimals;
      
      // 计算实际的流动性数量（考虑小数位数）
      const liquidityInSmallestUnit = Math.floor(liquidityNum * Math.pow(10, decimals));

      // 获取现有 vaults
      const poolInfo = await client.getPoolInfo(pool) as ChainPoolInfo;
      const existingVaults = poolInfo.tokens.map((t) => t.vaultAccount);

      const signature = await client.addTokenToPool(
        pool,
        mint,
        new BN(weightNum),
        new BN(liquidityInSmallestUnit),
        existingVaults
      );

      setStatus(`✅ Token 添加成功！\n初始流动性: ${liquidityNum} (${liquidityInSmallestUnit} 最小单位)\n交易签名: ${signature.slice(0, 8)}...`);
      
      // 清空表单
      setSelectedMint('');
      setCustomMint('');
      setWeight('20');
      setLiquidity('1000');
    } catch (error) {
      const err = error as Error;
      setStatus(`❌ 添加 Token 失败: ${err.message}`);
      console.error('添加 Token 错误:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="instruction-card">
      <h3>添加 Token 到 Pool</h3>
      
      <div className="form-group">
        <label>Pool 地址:</label>
        <select
          value={poolAddress}
          onChange={(e) => setPoolAddress(e.target.value)}
          disabled={loading}
          className="form-select"
        >
          <option value="">-- 选择 Pool 或手动输入 --</option>
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
        
        <label>选择 Token（从你的钱包）:</label>
        <select
          value={selectedMint}
          onChange={(e) => {
            setSelectedMint(e.target.value);
            setCustomMint('');
          }}
          disabled={loading}
          className="form-select"
        >
          <option value="">-- 选择 Token --</option>
          {userTokens.map((t) => (
            <option key={t.mint} value={t.mint}>
              {t.mint.slice(0, 8)}...{t.mint.slice(-8)} (余额: {t.balance})
            </option>
          ))}
        </select>
        
        <label>或手动输入 Mint 地址:</label>
        <input
          type="text"
          value={customMint}
          onChange={(e) => {
            setCustomMint(e.target.value);
            setSelectedMint('');
          }}
          placeholder="Token Mint 地址"
          disabled={loading}
          className="form-input"
        />
        
        <label>权重:</label>
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="例如: 20"
          disabled={loading}
          className="form-input"
        />
        
        <label>初始流动性数量（可选，0 表示不提供）:</label>
        <input
          type="number"
          value={liquidity}
          onChange={(e) => setLiquidity(e.target.value)}
          placeholder="例如: 1000"
          min="0"
          step="any"
          disabled={loading}
          className="form-input"
        />
        <small style={{ color: '#666', fontSize: '0.85em', display: 'block', marginTop: '4px' }}>
          💡 输入的是实际数量（如 1000），会根据 Token 的小数位数自动转换
        </small>
        
        <button
          onClick={handleAddToken}
          disabled={loading || !publicKey || !client || !poolAddress || (!selectedMint && !customMint)}
          className="action-button primary"
        >
          {loading ? '添加中...' : '添加 Token'}
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

