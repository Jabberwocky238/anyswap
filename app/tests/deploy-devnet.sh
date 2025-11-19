#!/bin/bash
# 快速部署脚本 - 部署 AnySwap 程序到测试网

set -e

echo "🚀 开始部署 AnySwap 到测试网..."
echo ""

# 检查 Solana CLI 是否安装
if ! command -v solana &> /dev/null; then
    echo "❌ 错误: 未找到 Solana CLI，请先安装 Solana CLI"
    exit 1
fi

# 检查 Anchor 是否安装
if ! command -v anchor &> /dev/null; then
    echo "❌ 错误: 未找到 Anchor CLI，请先安装 Anchor CLI"
    exit 1
fi

# 检查当前网络配置
echo "📋 检查当前网络配置..."
CURRENT_CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $3}')
echo "当前 RPC: $CURRENT_CLUSTER"

# 询问是否切换到 devnet
if [[ "$CURRENT_CLUSTER" != *"devnet"* ]]; then
    echo ""
    read -p "当前不是 devnet，是否切换到 devnet? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🔄 切换到 devnet..."
        solana config set --url devnet
    else
        echo "❌ 取消部署"
        exit 1
    fi
fi

# 检查余额
echo ""
echo "💰 检查钱包余额..."
BALANCE=$(solana balance | awk '{print $1}')
echo "当前余额: $BALANCE SOL"

if (( $(echo "$BALANCE < 1" | bc -l) )); then
    echo "⚠️  余额不足，尝试请求空投..."
    solana airdrop 2 || echo "⚠️  空投失败，请手动请求: solana airdrop 2"
fi

# 构建程序
echo ""
echo "🔨 构建程序..."
anchor build

if [ ! -f "target/deploy/anyswap.so" ]; then
    echo "❌ 错误: 构建失败，未找到 target/deploy/anyswap.so"
    exit 1
fi

# 部署程序
echo ""
echo "📦 部署程序到测试网..."
anchor deploy --provider.cluster devnet

# 验证部署
echo ""
echo "✅ 验证部署..."
PROGRAM_ID="3GBxn5VSThpKNyUgaQ96xjSXD2zJ1164LzK28MXv4MDC"
solana program show "$PROGRAM_ID" --url devnet

# 复制 IDL 文件
echo ""
echo "📋 复制 IDL 文件到 Web 应用..."
mkdir -p app/web/public/idl
cp target/idl/anyswap.json app/web/public/idl/

echo ""
echo "🎉 部署完成！"
echo ""
echo "程序 ID: $PROGRAM_ID"
echo "IDL 文件已复制到: app/web/public/idl/anyswap.json"
echo ""
echo "下一步："
echo "1. 确保 Web 应用中的 PROGRAM_ID 正确"
echo "2. 运行 Web 应用: cd app/web && npm run dev"
echo "3. 在测试网测试程序功能"

