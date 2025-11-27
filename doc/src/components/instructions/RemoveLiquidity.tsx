import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useAnySwap } from '../../App';
import { useStorage } from '../../contexts/StorageContext';
import { BN } from '@coral-xyz/anchor';
import * as token from '@solana/spl-token';
import type { ChainPoolInfo } from '../../types/anyswap';

interface TokenOutput {
  mint: string;
  decimals: number;
  weight: string;
}

export default function RemoveLiquidity() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { anyswap: client } = useAnySwap();
  const { pools: savedPools } = useStorage();
  
  const [poolAddress, setPoolAddress] = useState('');
  const [burnAmount, setBurnAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [lpBalance, setLpBalance] = useState('0');
  const [lpDecimals, setLpDecimals] = useState(9);
  const [tokenOutputs, setTokenOutputs] = useState<TokenOutput[]>([]);

  useEffect(() => {
    if (savedPools.length > 0 && !poolAddress) {
      setPoolAddress(savedPools[0]);
    }
  }, [savedPools, poolAddress]);

  useEffect(() => {
    const loadPoolInfo = async () => {
      if (!poolAddress || !client || !connection || !publicKey) return;
      
      try {
        const pool = new PublicKey(poolAddress);
        const poolInfo = await client.getPoolInfo(pool) as ChainPoolInfo;
        const poolMint = client.getPoolMint(pool);
        
        // 获取 LP token 余额
        try {
          const userPoolAta = await token.getAssociatedTokenAddress(poolMint, publicKey);
          const accountInfo = await token.getAccount(connection, userPoolAta);
          const mintInfo = await token.getMint(connection, poolMint);
          setLpBalance((Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals)).toString());
          setLpDecimals(mintInfo.decimals);
        } catch {
          setLpBalance('0');
        }
        
        // 加载 token 信息
        const outputs: TokenOutput[] = [];
        for (const t of poolInfo.tokens) {
          try {
            const mintInfo = await token.getMint(connection, t.mintAccount);
            outputs.push({
              mint: t.mintAccount.toString(),
              decimals: mintInfo.decimals,
              weight: t.weight.toString(),
            });
          } catch (error) {
            console.error('获取 mint 信息失败:', error);
          }
        }
        
        setTokenOutputs(outputs);
      } catch (error) {
        console.error('加载 Pool 信息失败:', error);
      }
    };
    
    loadPoolInfo();
  }, [poolAddress, client, connection, publicKey]);

  const handleRemoveLiquidity = async () => {
    if (!client || !publicKey || !poolAddress || !connection) {
      setStatus('请填写所有必需字段');
      return;
    }

    const burnNum = parseFloat(burnAmount);
    if (isNaN(burnNum) || burnNum <= 0) {
      setStatus('请输入有效的销毁数量');
      return;
    }

    if (burnNum > parseFloat(lpBalance)) {
      setStatus('销毁数量不能超过你的 LP token 余额');
      return;
    }

    setLoading(true);
    setStatus('正在移除流动性...');

    try {
      const pool = new PublicKey(poolAddress);
      const burnAmountInSmallestUnit = Math.floor(burnNum * Math.pow(10, lpDecimals));
      const burnAmountBN = new BN(burnAmountInSmallestUnit);

      const userTokenAccounts: PublicKey[] = [];
      const vaultAccounts: PublicKey[] = [];

      for (const output of tokenOutputs) {
        const mint = new PublicKey(output.mint);
        const userTokenAccount = await token.getAssociatedTokenAddress(mint, publicKey);
        userTokenAccounts.push(userTokenAccount);

        const vault = client.getVault(pool, mint);
        vaultAccounts.push(vault);
      }

      const signature = await client.removeLiquidity(
        pool,
        burnAmountBN,
        userTokenAccounts,
        vaultAccounts
      );

      setStatus(`✅ 流动性移除成功！\n交易签名: ${signature.slice(0, 8)}...`);
      setBurnAmount('');
      
      // 重新加载余额
      setTimeout(async () => {
        try {
          const poolMint = client.getPoolMint(pool);
          const userPoolAta = await token.getAssociatedTokenAddress(poolMint, publicKey);
          const accountInfo = await token.getAccount(connection, userPoolAta);
          const mintInfo = await token.getMint(connection, poolMint);
          setLpBalance((Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals)).toString());
        } catch (error) {
          console.error('重新加载余额失败:', error);
        }
      }, 1000);
    } catch (error) {
      const err = error as Error;
      setStatus(`❌ 移除流动性失败: ${err.message}`);
      console.error('移除流动性错误:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="instruction-card">
      <h3>移除流动性</h3>
      
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
        
        {poolAddress && (
          <div className="info-text">
            你的 LP Token 余额: {lpBalance}
          </div>
        )}
        
        <label>要销毁的 LP Token 数量:</label>
        <input
          type="number"
          value={burnAmount}
          onChange={(e) => setBurnAmount(e.target.value)}
          placeholder={`最大: ${lpBalance}`}
          disabled={loading}
          className="form-input"
          step={`0.${'0'.repeat(Math.max(0, lpDecimals - 1))}1`}
        />
        
        {tokenOutputs.length > 0 && (
          <div className="info-text" style={{ marginTop: '10px' }}>
            <strong>Pool 中的 Tokens:</strong>
            {tokenOutputs.map((output, index) => (
              <div key={output.mint} style={{ marginLeft: '10px', fontSize: '0.9em' }}>
                • Token {index + 1}: {output.mint.slice(0, 8)}...{output.mint.slice(-8)} (权重: {output.weight})
              </div>
            ))}
          </div>
        )}
        
        <button
          onClick={handleRemoveLiquidity}
          disabled={loading || !publicKey || !client || !poolAddress || !burnAmount}
          className="action-button danger"
        >
          {loading ? '移除中...' : '移除流动性'}
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

