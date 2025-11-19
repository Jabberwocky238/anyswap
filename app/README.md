# AnySwap TypeScript 客户端库

这是一个用于与 AnySwap 合约交互的 TypeScript 客户端库。

## 安装

```bash
npm install
npm run build
```
zq1 (zqsymbol1)
小数位数: 9
Mint: FuC17k1oyBbkZ6xS4PFLL8nX9g8Zh7yPTnFkVjZJG7mv
zq2 (zqsymbol2)
小数位数: 9
Mint: 5Bfkxkjjjvt1KmiypkhWJvkDuZK6P19yCy54FxrBT8re
## 签名方式

**重要**：客户端库使用 `AnchorProvider` 的 `wallet` 进行自动签名。这意味着：

- **浏览器环境**：使用钱包适配器（如 Phantom、Solflare）时，用户会在浏览器中看到签名提示
- **Node.js 环境**：使用配置的钱包文件（如 `~/.config/solana/id.json`）自动签名
- **自定义钱包**：可以传入实现了 `Wallet` 接口的对象

所有方法都支持可选的 `owner` 参数，如果不提供，默认使用 `provider.wallet.publicKey`。

## 使用示例

### 管理员操作（AdminClient）

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Anyswap } from "../target/types/anyswap";
import { AdminClient, BN } from "@anyswap/client";

// 初始化 provider 和 program
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.anyswap as Program<Anyswap>;

// 创建管理员客户端
const adminClient = new AdminClient(provider, program);

// 创建 Pool（使用 provider.wallet 作为 admin）
const result = await adminClient.createPool(
  new BN(0),
  new BN(5),      // fee numerator
  new BN(1000)    // fee denominator
  // admin 和 poolKeypair 都是可选的
);

// 添加 token 到 Pool
await adminClient.addTokenToPool(
  result.pool,
  mintPublicKey,
  new BN(20)      // weight
  // existingVaults 和 admin 都是可选的
);

// 修改费率
await adminClient.modifyFee(
  result.pool,
  new BN(10),     // new fee numerator
  new BN(1000)    // new fee denominator
  // admin 是可选的
);

// 修改 token 权重
await adminClient.modifyTokenWeight(
  result.pool,
  mintPublicKey,
  new BN(30)      // new weight
  // admin 是可选的
);
```

### 普通用户操作（Client）

```typescript
import { Client, BN } from "@anyswap/client";

// 创建客户端
const client = new Client(provider, program);

// 添加流动性（使用 provider.wallet 自动签名）
await client.addLiquidity(pool, {
  amounts: [new BN(10000), new BN(20000)],
  userTokenAccounts: [userToken0Account, userToken1Account],
  vaultAccounts: [vault0, vault1],
});
// owner 和 signers 都是可选的

// 移除流动性
await client.removeLiquidity(pool, {
  burnAmount: new BN(1000),
  userTokenAccounts: [userToken0Account, userToken1Account],
  vaultAccounts: [vault0, vault1],
});

// 交换代币
await client.swap(pool, {
  amountIn: new BN(1000),
  minAmountOut: new BN(0),
  vaultIn: vaultIn,
  vaultOut: vaultOut,
  userIn: userInAccount,
  userOut: userOutAccount,
});
```

### 使用钱包适配器（浏览器环境）

```typescript
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { AdminClient, Client } from "@anyswap/client";

// 在 React 组件中
function MyComponent() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  
  // 创建自定义 provider
  const walletAdapter = {
    publicKey,
    signTransaction,
    signAllTransactions,
  };
  
  const provider = new anchor.AnchorProvider(
    connection,
    walletAdapter as any,
    { commitment: "confirmed" }
  );
  
  const client = new Client(provider, program);
  
  // 现在所有操作都会通过钱包适配器签名
  // 用户会在浏览器中看到签名提示（如 Phantom 弹窗）
  const handleSwap = async () => {
    await client.swap(pool, swapParams);
    // 用户会在 Phantom 中看到签名请求
  };
}
```

## API 文档

### AdminClient

管理员客户端类，提供需要管理员权限的操作。

#### 方法

- `createPool(poolId, feeNumerator, feeDenominator, admin?, poolKeypair?)` - 创建新的 Pool
  - `admin` - 管理员地址（可选，默认使用 `provider.wallet.publicKey`）
  - `poolKeypair` - Pool 账户的 Keypair（可选，会自动生成）
  
- `addTokenToPool(pool, mint, weight, existingVaults?, admin?)` - 添加 token 到 Pool
  - `existingVaults` - 现有 vault 列表（可选）
  - `admin` - 管理员地址（可选，默认使用 `provider.wallet.publicKey`）
  
- `removeTokenFromPool(pool, mint, admin?)` - 从 Pool 移除 token
  - `admin` - 管理员地址（可选，默认使用 `provider.wallet.publicKey`）
  
- `modifyTokenWeight(pool, mint, newWeight, admin?)` - 修改 token 权重
  - `admin` - 管理员地址（可选，默认使用 `provider.wallet.publicKey`）
  
- `modifyFee(pool, feeNumerator, feeDenominator, admin?)` - 修改 Pool 费率
  - `admin` - 管理员地址（可选，默认使用 `provider.wallet.publicKey`）

### Client

普通用户客户端类，提供交换和流动性操作。

#### 方法

- `swap(pool, params, owner?, signers?)` - 交换代币
  - `owner` - 用户地址（可选，默认使用 `provider.wallet.publicKey`）
  - `signers` - 额外的签名者（可选，当 owner 不是 provider.wallet 时需要）
  
- `addLiquidity(pool, params, owner?, signers?)` - 添加流动性
  - `owner` - 用户地址（可选，默认使用 `provider.wallet.publicKey`）
  - `signers` - 额外的签名者（可选）
  
- `removeLiquidity(pool, params, owner?, signers?)` - 移除流动性
  - `owner` - 用户地址（可选，默认使用 `provider.wallet.publicKey`）
  - `signers` - 额外的签名者（可选）
  
- `getPool(pool)` - 获取 Pool 账户信息
- `getPoolTokens(pool)` - 获取 Pool 的所有 token 信息
- `calculateRequiredWSOLLiquidity(pool, weight)` - 计算需要的 WSOL 流动性
- `wrapSOL(amount, owner?, signers?)` - 包装 SOL 为 WSOL
  - `owner` - 用户地址（可选，默认使用 `provider.wallet.publicKey`）
  - `signers` - 额外的签名者（可选，当 owner 不是 provider.wallet 时需要）

### 工具函数

- `getPoolAuthority(program, pool)` - 计算 Pool Authority PDA
- `getPoolMint(program, pool)` - 计算 Pool Mint PDA
- `getVault(program, pool, mint)` - 计算 Vault PDA
- `getPoolSpace()` - 获取 Pool 账户所需空间

## 注意事项

1. **签名方式**：所有方法默认使用 `provider.wallet` 进行签名，无需手动传入 Keypair
2. **钱包适配器**：在浏览器环境中，使用钱包适配器时，用户会在钱包中看到签名提示
3. **测试环境**：在测试环境中，如果使用不同的 Keypair，可以通过 `signers` 参数传入额外的签名者
