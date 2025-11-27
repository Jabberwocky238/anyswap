import { CreateToken, MintToSelf, TokenList } from '../instructions';
import '../instructions/Instructions.css';

export default function TokenOperations() {
  return (
    <div className="page-container">
      <h1>Token 操作</h1>
      <p className="page-description">创建和管理 Token</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px' }}>
        <CreateToken />
        <TokenList />
        <MintToSelf />
      </div>
    </div>
  );
}

