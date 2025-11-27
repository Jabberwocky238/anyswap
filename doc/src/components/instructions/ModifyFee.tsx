import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAnySwap } from '../../App';
import { useStorage } from '../../contexts/StorageContext';
import { BN } from '@coral-xyz/anchor';

export default function ModifyFee() {
  const { publicKey } = useWallet();
  const { anyswap: client } = useAnySwap();
  const { pools: savedPools } = useStorage();
  
  const [poolAddress, setPoolAddress] = useState('');
  const [feeNumerator, setFeeNumerator] = useState('5');
  const [feeDenominator, setFeeDenominator] = useState('1000');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (savedPools.length > 0 && !poolAddress) {
      setPoolAddress(savedPools[0]);
    }
  }, [savedPools, poolAddress]);

  const handleModifyFee = async () => {
    if (!client || !publicKey || !poolAddress) {
      setStatus('请填写所有必需字段');
      return;
    }

    const numerator = parseInt(feeNumerator);
    const denominator = parseInt(feeDenominator);

    if (isNaN(numerator) || isNaN(denominator) || numerator < 0 || denominator <= 0) {
      setStatus('请输入有效的费率参数');
      return;
    }

    setLoading(true);
    setStatus('正在修改费率...');

    try {
      const pool = new PublicKey(poolAddress);
      const signature = await client.modifyFee(
        pool,
        new BN(numerator),
        new BN(denominator)
      );

      const percentage = (numerator / denominator * 100).toFixed(2);
      setStatus(`✅ 费率修改成功！新费率: ${numerator} / ${denominator} = ${percentage}%\n交易签名: ${signature.slice(0, 8)}...`);
    } catch (error) {
      const err = error as Error;
      setStatus(`❌ 修改费率失败: ${err.message}`);
      console.error('修改费率错误:', error);
    } finally {
      setLoading(false);
    }
  };

  const feePercentage = (parseInt(feeNumerator) / parseInt(feeDenominator) * 100).toFixed(2);

  return (
    <div className="instruction-card">
      <h3>修改 Pool 费率</h3>
      
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
          onClick={handleModifyFee}
          disabled={loading || !publicKey || !client || !poolAddress}
          className="action-button primary"
        >
          {loading ? '修改中...' : '修改费率'}
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
