import { PublicKey } from '@solana/web3.js';

interface PoolManagementProps {
  poolId: string;
  poolAddress: string;
  createdPools: string[];
  onPoolIdChange: (poolId: string) => void;
  onPoolAddressChange: (address: string) => void;
}

export default function PoolManagement({
  poolId,
  poolAddress,
  createdPools,
  onPoolIdChange,
  onPoolAddressChange,
}: PoolManagementProps) {
  return (
    <div className="pool-section">
      <h2>Pool 管理</h2>
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
          Pool ID（创建新 Pool 时使用）:
        </label>
        <input
          type="number"
          placeholder="输入 Pool ID（例如: 0）"
          value={poolId}
          onChange={(e) => onPoolIdChange(e.target.value)}
          className="pool-input"
          min="0"
          style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
        />
      </div>
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
          Pool 地址（使用现有 Pool）:
        </label>
        {createdPools.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '14px', color: '#666' }}>已创建的 Pools:</label>
            <select
              value={poolAddress}
              onChange={(e) => onPoolAddressChange(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '8px', 
                marginTop: '5px',
                borderRadius: '4px',
                border: '1px solid #ddd'
              }}
            >
              <option value="">选择 Pool...</option>
              {createdPools.map((addr, idx) => (
                <option key={idx} value={addr}>
                  Pool {idx + 1}: {addr.slice(0, 8)}...{addr.slice(-8)}
                </option>
              ))}
            </select>
          </div>
        )}
        <input
          type="text"
          placeholder="或手动输入 Pool 地址"
          value={poolAddress}
          onChange={(e) => onPoolAddressChange(e.target.value)}
          className="pool-input"
          style={{ width: '100%', padding: '8px' }}
        />
      </div>
    </div>
  );
}

