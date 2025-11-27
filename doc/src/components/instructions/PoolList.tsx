import { useStorage } from '../../contexts/StorageContext';

export default function PoolList() {
  const { pools, clearPools } = useStorage();

  const handleClearPools = () => {
    if (window.confirm('确定要清除所有缓存的 Pool 记录吗？')) {
      clearPools();
    }
  };

  if (pools.length === 0) {
    return (
      <div className="instruction-card">
        <h3>已创建的 Pools</h3>
        <div className="info-text">还没有创建任何 Pool</div>
      </div>
    );
  }

  return (
    <div className="instruction-card">
      <h3>已创建的 Pools ({pools.length})</h3>
      
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {pools.map((pool, index) => (
          <div 
            key={pool} 
            style={{ 
              padding: '12px', 
              marginBottom: '8px',
              background: '#f8f9fa',
              borderRadius: '6px',
              border: '1px solid #e0e0e0'
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
              Pool {index + 1}
            </div>
            <div className="address-display">
              {pool}
            </div>
          </div>
        ))}
      </div>
      
      <button
        onClick={handleClearPools}
        className="action-button"
        style={{ 
          marginTop: '12px',
          backgroundColor: '#ff6b6b',
          color: 'white',
          width: '100%'
        }}
      >
        🗑️ 清除所有 Pool 记录
      </button>
    </div>
  );
}

