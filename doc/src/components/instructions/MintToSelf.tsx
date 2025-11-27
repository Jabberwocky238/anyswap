import { useState } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useStorage } from '../../contexts/StorageContext';
import * as token from '@solana/spl-token';

export default function MintToSelf() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { tokens: createdTokens } = useStorage();
  
  const [selectedMint, setSelectedMint] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handleMint = async () => {
    if (!publicKey || !connection || !signTransaction) {
      setStatus('请先连接钱包');
      return;
    }

    if (!selectedMint) {
      setStatus('请选择 Token');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setStatus('请输入有效的数量');
      return;
    }

    setLoading(true);
    setStatus('正在 Mint Token...');

    try {
      const mint = new PublicKey(selectedMint);
      
      // 获取 mint 信息
      const mintInfo = await token.getMint(connection, mint);
      
      // 获取或创建用户的 token 账户
      const userTokenAccount = await token.getAssociatedTokenAddress(
        mint,
        publicKey
      );
      
      // 检查账户是否存在，如果不存在则创建
      let needCreateAccount = false;
      try {
        await token.getAccount(connection, userTokenAccount);
      } catch {
        needCreateAccount = true;
      }
      
      // 如果需要，先创建账户
      if (needCreateAccount) {
        setStatus('正在创建 Token 账户...');
        const createTx = new Transaction();
        createTx.add(
          token.createAssociatedTokenAccountInstruction(
            publicKey,
            userTokenAccount,
            publicKey,
            mint
          )
        );
        
        const { blockhash: createBlockhash } = await connection.getLatestBlockhash();
        createTx.recentBlockhash = createBlockhash;
        createTx.feePayer = publicKey;
        
        const signedCreateTx = await signTransaction(createTx);
        const createSig = await connection.sendRawTransaction(signedCreateTx.serialize());
        await connection.confirmTransaction(createSig, 'confirmed');
        
        setStatus('Token 账户创建成功，正在 Mint...');
      }
      
      // Mint tokens
      const amountInSmallestUnit = Math.floor(amountNum * Math.pow(10, mintInfo.decimals));
      
      const mintTx = new Transaction();
      mintTx.add(
        token.createMintToInstruction(
          mint,
          userTokenAccount,
          publicKey,
          amountInSmallestUnit
        )
      );
      
      const { blockhash } = await connection.getLatestBlockhash();
      mintTx.recentBlockhash = blockhash;
      mintTx.feePayer = publicKey;
      
      const signedMintTx = await signTransaction(mintTx);
      const signature = await connection.sendRawTransaction(signedMintTx.serialize());
      await connection.confirmTransaction(signature, 'confirmed');

      setStatus(`✅ Mint 成功！\n数量: ${amountNum}\n交易签名: ${signature.slice(0, 8)}...`);
      setAmount('');
    } catch (error) {
      const err = error as Error;
      setStatus(`❌ Mint 失败: ${err.message}`);
      console.error('Mint 错误:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedToken = createdTokens.find(t => t.mint === selectedMint);

  if (createdTokens.length === 0) {
    return (
      <div className="instruction-card">
        <h3>Mint Token 到自己账户</h3>
        <div className="info-text">
          还没有创建任何 Token。请先创建 Token。
        </div>
      </div>
    );
  }

  return (
    <div className="instruction-card">
      <h3>Mint Token 到自己账户</h3>
      
      <div className="form-group">
        <label>选择 Token:</label>
        <select
          value={selectedMint}
          onChange={(e) => setSelectedMint(e.target.value)}
          disabled={loading}
          className="form-select"
        >
          <option value="">-- 选择 Token --</option>
          {createdTokens.map((t) => (
            <option key={t.mint} value={t.mint}>
              {t.symbol} - {t.name} ({t.mint.slice(0, 8)}...{t.mint.slice(-8)})
            </option>
          ))}
        </select>
        
        {selectedToken && (
          <div className="info-text">
            Token 信息: {selectedToken.name} ({selectedToken.symbol}), 小数位: {selectedToken.decimals}
          </div>
        )}
        
        <label>数量:</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="输入要 mint 的数量"
          disabled={loading}
          className="form-input"
          step={selectedToken ? `0.${'0'.repeat(Math.max(0, selectedToken.decimals - 1))}1` : '0.000000001'}
        />
        
        <button
          onClick={handleMint}
          disabled={loading || !publicKey || !selectedMint || !amount}
          className="action-button primary"
        >
          {loading ? 'Minting...' : 'Mint Token'}
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

