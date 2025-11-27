import {
  CreatePool,
  AddTokenToPool,
  RemoveTokenFromPool,
  ModifyTokenWeight,
  ModifyFee,
  PoolInfo,
  PoolList,
} from '../instructions';
import '../instructions/Instructions.css';

export default function PoolOperations() {
  return (
    <div className="page-container">
      <h1>Pool 管理</h1>
      <p className="page-description">创建和管理 Pool（管理员操作）</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px' }}>
        <CreatePool />
        <PoolList />
        <PoolInfo />
        <AddTokenToPool />
        <RemoveTokenFromPool />
        <ModifyTokenWeight />
        <ModifyFee />
      </div>
    </div>
  );
}
