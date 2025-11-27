import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { useAnySwap } from '../../App';
import { useStorage } from '../../contexts/StorageContext';
import * as token from '@solana/spl-token';
import type { ChainPoolInfo } from '../../types/anyswap';

interface PoolInfoDisplay {
  address: string;
  admin: string;
  feeNumerator: string;
  feeDenominator: string;
  lpMint: string;
  tokenCount: number;
  tokens: {
    index: number;
    mint: string;
    vault: string;
    weight: string;
    balance: string;
    decimals: number;
  }[];
}

export default function PoolInfo() {
  const { connection } = useConnection();
  const { anyswap: client } = useAnySwap();
  const { pools: savedPools } = useStorage();
  
  const [poolAddress, setPoolAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [poolInfo, setPoolInfo] = useState<PoolInfoDisplay | null>(null);

  useEffect(() => {
    if (savedPools.length > 0 && !poolAddress) {
      setPoolAddress(savedPools[0]);
    }
  }, [savedPools, poolAddress]);

  useEffect(() => {
    const loadPoolInfo = async () => {
      if (!poolAddress || !client || !connection) return;
      
      setLoading(true);
      try {
        const pool = new PublicKey(poolAddress);
        const info = await client.getPoolInfo(pool) as ChainPoolInfo;

        // 获取每个 token 的详细信息
        const tokensWithBalance = await Promise.all(
          info.tokens.map(async (t, index) => {
            try {
              const vaultAccount = await token.getAccount(connection, t.vaultAccount);
              const mintInfo = await token.getMint(connection, t.mintAccount);
              return {
                index: index + 1,
                mint: t.mintAccount.toString(),
                vault: t.vaultAccount.toString(),
                weight: t.weight.toString(),
                balance: vaultAccount.amount.toString(),
                decimals: mintInfo.decimals,
              };
            } catch (error) {
              return {
                index: index + 1,
                mint: t.mintAccount.toString(),
                vault: t.vaultAccount.toString(),
                weight: t.weight.toString(),
                balance: '0',
                decimals: 9,
              };
            }
          })
        );

        setPoolInfo({
          address: pool.toString(),
          admin: info.admin.toString(),
          feeNumerator: info.feeNumerator.toString(),
          feeDenominator: info.feeDenominator.toString(),
          lpMint: info.lpMint.toString(),
          tokenCount: info.tokenCount,
          tokens: tokensWithBalance,
        });
      } catch (error) {
        console.error('加载 Pool 信息失败:', error);
        setPoolInfo(null);
      } finally {
        setLoading(false);
      }
    };
    
    loadPoolInfo();
  }, [poolAddress, client, connection]);

  const feePercentage = poolInfo 
    ? (parseInt(poolInfo.feeNumerator) / parseInt(poolInfo.feeDenominator) * 100).toFixed(2)
    : '0';

  return (
    <div className="instruction-card">
      <h3>Pool 信息查询</h3>
      
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
      </div>
      
      {loading && <div className="status-message">正在加载 Pool 信息...</div>}
      
      {poolInfo && !loading && (
        <div className="result-box">
          <div><strong>Pool 地址:</strong> {poolInfo.address}</div>
          <div><strong>管理员:</strong> {poolInfo.admin}</div>
          <div><strong>费率:</strong> {poolInfo.feeNumerator} / {poolInfo.feeDenominator} ({feePercentage}%)</div>
          <div><strong>LP Mint:</strong> {poolInfo.lpMint}</div>
          <div><strong>Token 数量:</strong> {poolInfo.tokenCount}</div>
          
          <div style={{ marginTop: '16px' }}>
            <strong>Tokens:</strong>
            {poolInfo.tokens.map((t) => (
              <div key={t.mint} style={{ 
                marginTop: '12px', 
                padding: '12px', 
                background: 'white', 
                border: '1px solid #ddd',
                borderRadius: '6px'
              }}>
                <div><strong>Token {t.index}</strong></div>
                <div style={{ fontSize: '0.9em', marginTop: '4px' }}>
                  <div>Mint: {t.mint}</div>
                  <div>Vault: {t.vault}</div>
                  <div>权重: {t.weight}</div>
                  <div>余额: {(Number(t.balance) / Math.pow(10, t.decimals)).toFixed(t.decimals)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

