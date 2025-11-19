# AnySwap Web 测试应用

这是一个使用 React 和 Phantom 钱包的简单测试页面，用于在测试网测试 AnySwap 协议。

## 安装依赖

```bash
cd app/web
npm install
```

## 配置

### 1. 复制 IDL 文件

将 IDL 文件复制到 `public` 目录：

```bash
# 从项目根目录运行
mkdir -p app/web/public/idl
cp target/idl/anyswap.json app/web/public/idl/
```

### 2. 更新程序 ID（如果需要）

如果程序 ID 不同，编辑 `src/components/AnySwapTest.tsx`，更新 `PROGRAM_ID`：

```typescript
const PROGRAM_ID = new PublicKey('你的程序ID');
```

## 运行

```bash
npm run dev
```

应用会在 `http://localhost:5173` 启动。

## 使用说明

1. **连接钱包**：点击 "Select Wallet" 按钮，选择 Phantom 钱包
2. **切换到测试网**：确保 Phantom 钱包连接到 Devnet（测试网）
3. **创建 Pool**：点击 "创建 Pool" 按钮（需要管理员权限）
4. **添加 Token**：在 Pool 中添加 token
5. **添加流动性**：为 Pool 添加流动性
6. **交换代币**：测试代币交换功能

## 注意事项

- **只支持测试网（Devnet）**：应用强制使用测试网
- 确保钱包连接到 Devnet（测试网）
- 确保钱包有足够的测试网 SOL
- 程序必须已部署到测试网
- IDL 文件必须存在于 `public/idl/anyswap.json`

## 构建生产版本

```bash
npm run build
```

构建产物在 `dist/` 目录。部署时确保 `public/idl/anyswap.json` 文件被包含在构建产物中。

