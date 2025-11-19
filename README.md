# AnySwap

AnySwap 是一个**超越并碾压 Balancer** 的多 token 交换系统。Balancer 受限于硬编码的 8 个 token，而 AnySwap 支持最多 **1024 个 token** 在同一个流动性池中自由交换。这使得 AnySwap 能够支持更复杂的 DeFi 场景，如大型指数基金、多资产组合池等，是 Balancer 无法企及的。

## 📍 程序部署地址

| Network | Program ID | IDL Account |
|---------|------------|-------------|
| Devnet  | `3GBxn5VSThpKNyUgaQ96xjSXD2zJ1164LzK28MXv4MDC` | `AHeBfQGsvCtWn2hFV3CrenfcqM38yk4ZAZMg2ZixQHPP` |
| Mainnet | 未部署 | - |

## 🔬 核心原理

### 恒定乘积和公式（Constant Sum of Products）

AnySwap 使用**恒定乘积和公式**来维持池子的平衡：

```
Σ(vault_i × weight_i) = constant
```

其中：
- `vault_i` 是第 i 个 token 在池中的储备量
- `weight_i` 是第 i 个 token 的权重（不变量）
- `constant` 是池子的不变量，在每次交易后保持不变

### 交换公式

当用户用 token A 交换 token B 时：

```
amount_in × weight_in = amount_out × weight_out
```

因此：

```
amount_out = (amount_in × weight_in) / weight_out
```

### 权重（Weight）的作用

- **权重是不变量**：每个 token 的权重在添加到池子时设置，之后保持不变
- **权重决定交换比例**：权重越高的 token，交换时需要的数量越多
- **权重可以不同**：不同 token 可以有不同的权重，实现非对称的流动性池

### 手续费机制

每次交换会收取一定比例的手续费（可配置），手续费会保留在相应的 vault 中，增加流动性提供者的收益。

## 🚀 碾压 Balancer 的优势

### 1. **Token 数量碾压**

| 特性 | Balancer | AnySwap |
|------|----------|---------|
| 最大 Token 数量 | 8（硬编码，无法扩展） | **1024（128倍）** |
| 扩展性 | 严重受限 | **完全可扩展** |

### 2. **完全动态的池子配置**

Balancer 的池子配置是静态的，而 AnySwap 支持完全动态的池子管理：

- **动态添加 Token**：可以在池子创建后动态添加新的 token
- **动态移除 Token**：可以移除不需要的 token
- **动态调整权重**：管理员可以调整 token 的权重
- **动态调整手续费**：可以调整池子的手续费率

### 3. **Solana 生态优势**

- **低交易费用**：Solana 的交易费用极低（通常 < $0.001）
- **高吞吐量**：支持每秒数千笔交易
- **快速确认**：交易确认时间 < 1 秒
- **原生集成**：与 Solana 生态无缝集成

### 4. **更适合复杂场景**

- **指数基金池**：可以创建包含数百个 token 的指数基金池
- **多资产组合**：支持复杂的多资产投资组合
- **跨链资产池**：可以聚合来自不同链的资产（通过桥接）

## 🏗️ 技术架构

### 主要指令

- `create_pool`：创建新的流动性池
- `add_token`：添加 token 到池子
- `remove_token`：从池子移除 token
- `modify_weight`：修改 token 权重
- `modify_fee`：修改手续费率
- `add_liquidity`：添加流动性
- `remove_liquidity`：移除流动性
- `swap`：uniswap

## 📦 安装与使用

### 前置要求

- Rust 1.70+
- Solana CLI 1.18+
- Anchor 0.32+
- Node.js 18+
- Yarn

### 构建

```bash
# 安装依赖
yarn install

# 构建程序
anchor build

# 运行测试
anchor test
```

### 使用示例

```typescript
import { Program } from "@coral-xyz/anchor";
import { Anyswap } from "./target/types/anyswap";

// 创建池子
await program.methods
  .createPool(poolId, feeNumerator, feeDenominator)
  .accounts({ /* ... */ })
  .rpc();

// 添加 token
await program.methods
  .addTokenToPool(weight)
  .accounts({ /* ... */ })
  .rpc();

// 交换 token
await program.methods
  .swapAnyswap(amountIn, minAmountOut)
  .accounts({ /* ... */ })
  .rpc();
```

## 📝 许可证

ISC

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 联系方式

如有问题或建议，请通过 Issue 联系我们。

---

**注意**：本项目仍在开发中，请勿在生产环境使用未经审计的版本。

