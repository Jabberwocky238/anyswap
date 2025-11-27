# Instructions 组件目录

## ✅ 已创建的所有组件 (10/10)

### Token 操作
1. **CreateToken** - 创建新 Token ✅
2. **MintToSelf** - Mint Token 到自己账户 ✅

### Pool 管理操作（管理员）
3. **CreatePool** - 创建新的 Pool ✅
4. **AddTokenToPool** - 添加 Token 到 Pool ✅
5. **RemoveTokenFromPool** - 从 Pool 移除 Token ✅
6. **ModifyTokenWeight** - 修改 Token 权重 ✅
7. **ModifyFee** - 修改 Pool 费率 ✅

### 流动性和交易操作（用户）
8. **AddLiquidity** - 添加流动性 ✅
9. **RemoveLiquidity** - 移除流动性 ✅
10. **Swap** - Token 交换 ✅

## 使用方法

每个组件都是完全独立的，可以直接导入使用：

```tsx
import { CreatePool, AddTokenToPool, RemoveTokenFromPool } from '@/components/instructions';

function MyPage() {
  return (
    <div>
      <CreatePool />
      <AddTokenToPool />
      <RemoveTokenFromPool />
    </div>
  );
}
```

## 组件特点

- ✅ 完全独立，不需要父组件传递数据
- ✅ 自动从 hooks 获取 wallet、connection、client
- ✅ 自动加载保存的 pools 和 tokens
- ✅ 使用表单元素（select、input）而非 prompt
- ✅ 实时状态反馈
- ✅ 类型安全（使用 TypeScript 类型定义）

## 快速开始

### 使用单个组件

```tsx
import { CreatePool } from '@/components/instructions';

function MyPage() {
  return (
    <div>
      <h1>创建 Pool</h1>
      <CreatePool />
    </div>
  );
}
```

### 使用完整的操作面板

查看 `InstructionsDemo.tsx` 示例：

```tsx
import {
  CreatePool,
  AddTokenToPool,
  RemoveTokenFromPool,
  ModifyTokenWeight,
  ModifyFee,
  AddLiquidity,
  RemoveLiquidity,
  Swap,
  CreateToken,
  MintToSelf,
} from '../instructions';

export default function InstructionsDemo() {
  return (
    <div className="page-container">
      <h1>AnySwap 操作面板</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '20px' }}>
        <CreateToken />
        <MintToSelf />
        <CreatePool />
        <AddTokenToPool />
        <RemoveTokenFromPool />
        <ModifyTokenWeight />
        <ModifyFee />
        <AddLiquidity />
        <RemoveLiquidity />
        <Swap />
      </div>
    </div>
  );
}
```

## 组件详细说明

### Token 操作

#### CreateToken
- 输入 Token 名称、符号和小数位
- 自动创建 Mint 账户
- 保存到 localStorage

#### MintToSelf
- 从已创建的 Token 中选择或手动输入 Mint 地址
- 输入要 mint 的数量
- 自动创建或获取 Token 账户

### Pool 管理操作

#### CreatePool
- 输入费率分子和分母
- 创建新的 Pool
- 返回 Pool 地址

#### AddTokenToPool
- 选择 Pool
- 选择或输入 Token Mint 地址
- 输入权重和初始流动性
- 添加 Token 到 Pool

#### RemoveTokenFromPool
- 选择 Pool
- 从 Pool 中选择要移除的 Token
- 确认移除

#### ModifyTokenWeight
- 选择 Pool
- 选择 Token
- 输入新权重
- 更新权重

#### ModifyFee
- 选择 Pool
- 输入新的费率分子和分母
- 更新费率

### 流动性和交易操作

#### AddLiquidity
- 选择 Pool
- 自动加载所有 Token
- 为每个 Token 输入数量
- 提交添加流动性

#### RemoveLiquidity
- 选择 Pool
- 显示当前 LP Token 余额
- 输入要销毁的 LP Token 数量
- 提交移除流动性

#### Swap
- 选择 Pool
- 为每个 Token 选择输入/输出方向
- 输入数量
- 执行多对多交换

