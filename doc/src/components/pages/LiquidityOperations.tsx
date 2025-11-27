import {
  AddLiquidity,
  RemoveLiquidity,
  Swap,
  PoolInfo,
} from '../instructions';
import '../instructions/Instructions.css';

export default function LiquidityOperations() {
  return (
    <div className="page-container">
      <h1>流动性与交易</h1>
      <p className="page-description">添加和移除流动性、执行代币交换</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px' }}>
        <PoolInfo />
        <AddLiquidity />
        <RemoveLiquidity />
        <Swap />
      </div>
    </div>
  );
}
