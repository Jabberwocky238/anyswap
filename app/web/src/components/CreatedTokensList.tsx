interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  mint: string;
}

interface CreatedTokensListProps {
  tokens: TokenInfo[];
}

export default function CreatedTokensList({ tokens }: CreatedTokensListProps) {
  if (tokens.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: '10px' }}>
      <label style={{ fontSize: '14px', color: '#666', fontWeight: 'bold' }}>已创建的 Tokens:</label>
      <div style={{ marginTop: '5px', fontSize: '12px', color: '#888', maxHeight: '200px', overflowY: 'auto', padding: '10px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #eee' }}>
        {tokens.map((token, idx) => (
          <div key={idx} style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <div style={{ fontWeight: 'bold', color: '#333' }}>
              {token.name} ({token.symbol})
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
              小数位数: {token.decimals}
            </div>
            <div style={{ fontSize: '11px', color: '#666', wordBreak: 'break-all', marginTop: '4px' }}>
              Mint: {token.mint}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

