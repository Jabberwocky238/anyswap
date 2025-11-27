import { useState, useEffect } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useAnySwap } from '../../App';
import { useStorage } from '../../contexts/StorageContext';
import { BN } from '@coral-xyz/anchor';
import * as token from '@solana/spl-token';
import type { ChainPoolInfo } from '../../types/anyswap';

interface TokenInput {
  mint: string;
  amount: string;
  decimals: number;
  weight: string;
}

export default function AddLiquidity() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { anyswap: client } = useAnySwap();
  const { pools: savedPools } = useStorage();
  
  const [poolAddress, setPoolAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [tokenInputs, setTokenInputs] = useState<TokenInput[]>([]);

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
        
        const inputs: TokenInput[] = [];
        for (const t of poolInfo.tokens) {
          try {
            const mintInfo = await token.getMint(connection, t.mintAccount);
            inputs.push({
              mint: t.mintAccount.toString(),
              amount: '',
              decimals: mintInfo.decimals,
              weight: t.weight.toString(),
            });
          } catch (error) {
            console.error('获取 mint 信息失败:', error);
          }
        }
        
        setTokenInputs(inputs);
      } catch (error) {
        console.error('加载 Pool tokens 失败:', error);
        setTokenInputs([]);
      }
    };
    
    loadPoolTokens();
  }, [poolAddress, client, connection]);

  const handleAmountChange = (mint: string, value: string) => {
    setTokenInputs(prev => prev.map(t => 
      t.mint === mint ? { ...t, amount: value } : t
    ));
  };

  const handleAddLiquidity = async () => {
    if (!client || !publicKey || !poolAddress || !connection || !signTransaction) {
      setStatus('请填写所有必需字段');
      return;
    }

    // 验证所有金额都已输入
    const hasEmptyAmount = tokenInputs.some(t => !t.amount || parseFloat(t.amount) <= 0);
    if (hasEmptyAmount) {
      setStatus('请为所有 Token 输入有效的数量');
      return;
    }

    setLoading(true);
    setStatus('正在添加流动性...');

    try {
      const pool = new PublicKey(poolAddress);
      const poolMint = client.getPoolMint(pool);

      // 准备账户
      const userPoolAta = await token.getAssociatedTokenAddress(poolMint, publicKey);
      
      // 检查并创建 LP token 账户
      try {
        await token.getAccount(connection, userPoolAta);
      } catch {
        setStatus('正在创建 LP token 账户...');
        const createIx = token.createAssociatedTokenAccountInstruction(
          publicKey,
          userPoolAta,
          publicKey,
          poolMint
        );
        const tx = new Transaction().add(createIx);
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;
        const signedTx = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signedTx.serialize());
        await connection.confirmTransaction(sig, 'confirmed');
      }

      const amounts: BN[] = [];
      const userTokenAccounts: PublicKey[] = [];
      const vaultAccounts: PublicKey[] = [];

      for (const input of tokenInputs) {
        const mint = new PublicKey(input.mint);
        const amountInSmallestUnit = Math.floor(parseFloat(input.amount) * Math.pow(10, input.decimals));
        amounts.push(new BN(amountInSmallestUnit));

        const userTokenAccount = await token.getAssociatedTokenAddress(mint, publicKey);
        userTokenAccounts.push(userTokenAccount);

        const vault = client.getVault(pool, mint);
        vaultAccounts.push(vault);
      }

      const signature = await client.addLiquidity(
        pool,
        amounts,
        userTokenAccounts,
        vaultAccounts
      );

      setStatus(`✅ 流动性添加成功！\n交易签名: ${signature.slice(0, 8)}...`);
      
      // 清空输入
      setTokenInputs(prev => prev.map(t => ({ ...t, amount: '' })));
    } catch (error) {
      const err = error as Error;
      setStatus(`❌ 添加流动性失败: ${err.message}`);
      console.error('添加流动性错误:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="instruction-card">
      <h3>添加流动性</h3>
      
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
        
        {tokenInputs.length > 0 && (
          <>
            <div className="info-text" style={{ marginTop: '20px', marginBottom: '10px' }}>
              为每个 Token 输入数量:
            </div>
            {tokenInputs.map((input, index) => (
              <div key={input.mint} style={{ marginBottom: '15px' }}>
                <label>
                  Token {index + 1} ({input.mint.slice(0, 8)}...{input.mint.slice(-8)})
                  <br />
                  <small>权重: {input.weight}, 小数位: {input.decimals}</small>
                </label>
                <input
                  type="number"
                  value={input.amount}
                  onChange={(e) => handleAmountChange(input.mint, e.target.value)}
                  placeholder={`输入数量（最多 ${input.decimals} 位小数）`}
                  disabled={loading}
                  className="form-input"
                  step={`0.${'0'.repeat(Math.max(0, input.decimals - 1))}1`}
                />
              </div>
            ))}
          </>
        )}
        
        <button
          onClick={handleAddLiquidity}
          disabled={loading || !publicKey || !client || !poolAddress || tokenInputs.length === 0}
          className="action-button primary"
        >
          {loading ? '添加中...' : '添加流动性'}
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

