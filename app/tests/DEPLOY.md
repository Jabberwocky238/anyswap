# Anchor 程序部署到测试网指南

## 前置条件

1. 安装 Solana CLI 和 Anchor CLI
2. 配置 Solana CLI 使用测试网
3. 确保钱包有足够的测试网 SOL

## 步骤 1: 配置 Solana CLI 使用测试网

```bash
# 设置 Solana CLI 使用测试网
solana config set --url devnet

# 验证配置
solana config get
```

## 步骤 2: 获取测试网 SOL

```bash
# 检查当前余额
solana balance

# 如果余额不足，请求空投（每次最多 2 SOL）
solana airdrop 2

# 或者使用多个账户请求
solana airdrop 2 <你的钱包地址>
```

## 步骤 3: 生成新的程序 ID（可选）

如果你想要一个新的程序 ID（而不是使用现有的），可以：

```bash
# 生成新的 keypair
anchor keys list

# 或者手动生成
solana-keygen new -o target/deploy/anyswap-keypair.json

# 获取程序 ID
solana address -k target/deploy/anyswap-keypair.json
```

然后更新以下文件中的程序 ID：
- `programs/anyswap/src/lib.rs` 中的 `declare_id!()`
- `Anchor.toml` 中的 `[programs.devnet]` 部分

## 步骤 4: 构建程序

```bash
# 构建程序（会生成 .so 文件）
anchor build
```

构建完成后，会生成：
- `target/deploy/anyswap.so` - 程序二进制文件
- `target/idl/anyswap.json` - IDL 文件
- `target/types/anyswap.ts` - TypeScript 类型文件

## 步骤 5: 部署到测试网

### 方法 1: 使用 Anchor 部署（推荐）

```bash
# 部署到测试网
anchor deploy --provider.cluster devnet

# 或者使用环境变量
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com anchor deploy
```

### 方法 2: 使用 Solana CLI 部署

```bash
# 部署程序
solana program deploy target/deploy/anyswap.so --program-id target/deploy/anyswap-keypair.json

# 验证部署
solana program show <程序ID>
```

## 步骤 6: 验证部署

```bash
# 查看程序信息
solana program show <程序ID>

# 查看程序账户
solana account <程序ID>
```

## 步骤 7: 更新客户端配置

部署成功后，需要更新客户端代码中的程序 ID：

1. **更新 web 应用中的程序 ID**：
   - 编辑 `app/web/src/components/AnySwapTest.tsx`
   - 更新 `PROGRAM_ID` 常量

2. **更新 IDL**：
   - 将 `target/idl/anyswap.json` 复制到 web 应用可以访问的位置
   - 或者使用动态加载方式

## 常见问题

### 1. 部署失败：余额不足

```bash
# 检查余额
solana balance

# 请求更多测试网 SOL
solana airdrop 2
```

### 2. 程序 ID 不匹配

确保以下文件中的程序 ID 一致：
- `programs/anyswap/src/lib.rs`
- `Anchor.toml`
- `target/deploy/anyswap-keypair.json`

### 3. 部署后程序不可用

检查程序是否成功部署：
```bash
solana program show <程序ID>
```

如果程序大小为 0 或显示错误，需要重新部署。

## 测试部署的程序

部署成功后，可以使用测试脚本验证：

```bash
# 设置环境变量使用测试网
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json

# 运行测试
anchor test --provider.cluster devnet
```

## 更新程序

如果需要更新已部署的程序：

```bash
# 重新构建
anchor build

# 升级程序（需要程序升级权限）
anchor upgrade target/deploy/anyswap.so --program-id <程序ID> --provider.cluster devnet
```

注意：程序升级需要满足 Solana 的升级权限要求。

## 主网部署

主网部署步骤类似，但需要注意：

1. 使用 `mainnet-beta` 而不是 `devnet`
2. 需要真实 SOL（不是测试币）
3. 确保程序经过充分测试
4. 考虑使用程序升级权限管理

```bash
# 配置主网
solana config set --url mainnet-beta

# 部署到主网
anchor deploy --provider.cluster mainnet-beta
```

