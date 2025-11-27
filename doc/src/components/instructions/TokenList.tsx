import { useStorage } from '../../contexts/StorageContext';

export default function TokenList() {
  const { tokens, clearTokens } = useStorage();

  const handleClearTokens = () => {
    if (window.confirm('确定要清除所有缓存的 Token 记录吗？')) {
      clearTokens();
    }
  };

  if (tokens.length === 0) {
    return (
      <div className="instruction-card">
        <h3>已创建的 Tokens</h3>
        <div className="info-text">还没有创建任何 Token</div>
      </div>
    );
  }

  return (
    <div className="instruction-card">
      <h3>已创建的 Tokens ({tokens.length})</h3>
      
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {tokens.map((token, index) => (
          <div 
            key={token.mint} 
            style={{ 
              padding: '12px', 
              marginBottom: '8px',
              background: '#f8f9fa',
              borderRadius: '6px',
              border: '1px solid #e0e0e0'
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
              {index + 1}. {token.name} ({token.symbol})
            </div>
            <div style={{ fontSize: '0.85em', color: '#666' }}>
              <div>小数位: {token.decimals}</div>
              <div className="address-display" style={{ marginTop: '4px' }}>
                {token.mint}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <button
        onClick={handleClearTokens}
        className="action-button"
        style={{ 
          marginTop: '12px',
          backgroundColor: '#ff6b6b',
          color: 'white',
          width: '100%'
        }}
      >
        🗑️ 清除所有 Token 记录
      </button>
    </div>
  );
}

