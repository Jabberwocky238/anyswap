import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAnySwap } from '../../App';
import { useStorage } from '../../contexts/StorageContext';
import { BN } from '@coral-xyz/anchor';

export default function CreatePool() {
  const { publicKey } = useWallet();
  const { anyswap: client } = useAnySwap();
  const { addPool } = useStorage();
  
  const [feeNumerator, setFeeNumerator] = useState('5');
  const [feeDenominator, setFeeDenominator] = useState('1000');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<string>('');

  const handleCreatePool = async () => {
    if (!client || !publicKey) {
      setStatus('请先连接钱包');
      return;
    }

    const numerator = parseInt(feeNumerator);
    const denominator = parseInt(feeDenominator);

    if (isNaN(numerator) || isNaN(denominator) || numerator < 0 || denominator <= 0) {
      setStatus('请输入有效的费率参数');
      return;
    }

    setLoading(true);
    setStatus('正在创建 Pool...');
    setResult('');

    try {
      const createResult = await client.createPool(
        new BN(numerator),
        new BN(denominator),
        publicKey
      );

      const poolAddr = createResult.pool.toString();
      setStatus('✅ Pool 创建成功！');
      setResult(poolAddr);
      
      // 保存到 Storage Context
      addPool(poolAddr);
      
      console.log('Pool 创建结果:', createResult);
    } catch (error) {
      const err = error as Error;
      setStatus(`❌ 创建 Pool 失败: ${err.message}`);
      console.error('创建 Pool 错误:', error);
    } finally {
      setLoading(false);
    }
  };

  const feePercentage = (parseInt(feeNumerator) / parseInt(feeDenominator) * 100).toFixed(2);

  return (
    <div className="instruction-card">
      <h3>创建新 Pool</h3>
      
      <div className="form-group">
        <label>费率分子:</label>
        <input
          type="number"
          value={feeNumerator}
          onChange={(e) => setFeeNumerator(e.target.value)}
          disabled={loading}
          className="form-input"
        />
        
        <label>费率分母:</label>
        <input
          type="number"
          value={feeDenominator}
          onChange={(e) => setFeeDenominator(e.target.value)}
          disabled={loading}
          className="form-input"
        />
        
        <div className="info-text">
          当前费率: {feePercentage}%
        </div>
        
        <button
          onClick={handleCreatePool}
          disabled={loading || !publicKey || !client}
          className="action-button primary"
        >
          {loading ? '创建中...' : '创建 Pool'}
        </button>
      </div>
      
      {status && (
        <div className={`status-message ${status.includes('✅') ? 'success' : status.includes('❌') ? 'error' : ''}`}>
          {status}
        </div>
      )}
      
      {result && (
        <div className="result-box">
          <strong>Pool 地址:</strong>
          <div className="address-display">{result}</div>
        </div>
      )}
    </div>
  );
}

