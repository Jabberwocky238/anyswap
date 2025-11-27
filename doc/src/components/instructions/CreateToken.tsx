import { useState } from 'react';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useStorage } from '../../contexts/StorageContext';
import * as token from '@solana/spl-token';
import type { CreatedTokenInfo } from '../../types/anyswap';

export default function CreateToken() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { addToken } = useStorage();
  
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState('9');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<CreatedTokenInfo | null>(null);

  const handleCreateToken = async () => {
    if (!publicKey || !connection || !signTransaction) {
      setStatus('请先连接钱包');
      return;
    }

    if (!name || !symbol) {
      setStatus('请填写 Token 名称和符号');
      return;
    }

    const dec = parseInt(decimals);
    if (isNaN(dec) || dec < 0 || dec > 9) {
      setStatus('小数位数必须在 0-9 之间');
      return;
    }

    setLoading(true);
    setStatus('正在创建 Token...');
    setResult(null);

    try {
      // 创建 mint 账户
      const mintKeypair = Keypair.generate();
      
      const lamports = await token.getMinimumBalanceForRentExemptMint(connection);
      
      const transaction = new Transaction();
      
      // 添加创建账户指令
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: token.MINT_SIZE,
          lamports,
          programId: token.TOKEN_PROGRAM_ID,
        })
      );
      
      // 添加初始化 mint 指令
      transaction.add(
        token.createInitializeMintInstruction(
          mintKeypair.publicKey,
          dec,
          publicKey,
          publicKey,
          token.TOKEN_PROGRAM_ID
        )
      );

      // 设置交易属性
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // mintKeypair 先签名（部分签名）
      transaction.partialSign(mintKeypair);
      
      // 钱包签名
      const signedTransaction = await signTransaction(transaction);
      
      // 发送交易
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      await connection.confirmTransaction(signature, 'confirmed');

      const tokenInfo: CreatedTokenInfo = {
        name,
        symbol,
        decimals: dec,
        mint: mintKeypair.publicKey.toString(),
      };

      setStatus(`✅ Token 创建成功！\nMint 地址: ${tokenInfo.mint}`);
      setResult(tokenInfo);
      
      // 保存到 Storage Context
      addToken(tokenInfo);
      
      // 清空表单
      setName('');
      setSymbol('');
      setDecimals('9');
    } catch (error) {
      const err = error as Error;
      setStatus(`❌ 创建 Token 失败: ${err.message}`);
      console.error('创建 Token 错误:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="instruction-card">
      <h3>创建新 Token</h3>
      
      <div className="form-group">
        <label>Token 名称:</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如: My Token"
          disabled={loading}
          className="form-input"
        />
        
        <label>Token 符号:</label>
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="例如: MTK"
          disabled={loading}
          className="form-input"
        />
        
        <label>小数位数:</label>
        <input
          type="number"
          value={decimals}
          onChange={(e) => setDecimals(e.target.value)}
          placeholder="0-9"
          min="0"
          max="9"
          disabled={loading}
          className="form-input"
        />
        
        <button
          onClick={handleCreateToken}
          disabled={loading || !publicKey || !name || !symbol}
          className="action-button primary"
        >
          {loading ? '创建中...' : '创建 Token'}
        </button>
      </div>
      
      {status && (
        <div className={`status-message ${status.includes('✅') ? 'success' : status.includes('❌') ? 'error' : ''}`} style={{ whiteSpace: 'pre-line' }}>
          {status}
        </div>
      )}
      
      {result && (
        <div className="result-box">
          <strong>Token 信息:</strong>
          <div>名称: {result.name}</div>
          <div>符号: {result.symbol}</div>
          <div>小数位: {result.decimals}</div>
          <div className="address-display">Mint: {result.mint}</div>
        </div>
      )}
    </div>
  );
}

