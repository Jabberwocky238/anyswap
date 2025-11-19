import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Client, getVault, getPoolMint } from '@anyswap/client';
import { Program, Idl } from '@coral-xyz/anchor';
import type { BN } from '@coral-xyz/anchor';
import * as token from '@solana/spl-token';

interface UserActionsProps {
  client: Client | null;
  program: Program<Idl> | null;
  connection: Connection | null;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | undefined;
  poolAddress: string;
  loading: boolean;
  onStatusChange: (status: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

export default function UserActions({
  client,
  program,
  connection,
  publicKey,
  signTransaction,
  poolAddress,
  loading,
  onStatusChange,
  onLoadingChange,
}: UserActionsProps) {
  const handleGetPoolInfo = async () => {
    if (!client || !poolAddress || !connection) {
      onStatusChange('请输入 Pool 地址');
      return;
    }

    onLoadingChange(true);
    onStatusChange('正在获取 Pool 信息...');

    try {
      const pool = new PublicKey(poolAddress);
      const poolAccount = await client.getPool(pool);
      const tokens = poolAccount.tokens;

      let info = `Pool 信息:\n`;
      info += `- Token 数量: ${poolAccount.tokenCount}\n`;
      info += `- 费率: ${poolAccount.feeNumerator.toString()} / ${poolAccount.feeDenominator.toString()}\n`;
      info += `- 管理员: ${poolAccount.admin.toString()}\n\n`;
      info += `Token 列表:\n`;

      for (let i = 0; i < tokens.length; i++) {
        const tokenInfo = tokens[i];
        const vaultBalance = await token.getAccount(connection, tokenInfo.vaultAccount);
        info += `${i + 1}. Mint: ${tokenInfo.mintAccount.toString()}\n`;
        info += `   权重: ${tokenInfo.weight.toString()}\n`;
        info += `   Vault: ${tokenInfo.vaultAccount.toString()}\n`;
        info += `   余额: ${vaultBalance.amount.toString()}\n\n`;
      }

      onStatusChange(info);
      console.log('Pool 信息:', poolAccount);
      console.log('Tokens:', tokens);
    } catch (error: any) {
      onStatusChange(`获取 Pool 信息失败: ${error.message}`);
      console.error('获取 Pool 信息错误:', error);
    } finally {
      onLoadingChange(false);
    }
  };

  const handleAddLiquidity = async () => {
    if (!client || !publicKey || !poolAddress || !connection || !signTransaction || !program) {
      onStatusChange('请先连接钱包并输入 Pool 地址');
      return;
    }

    onLoadingChange(true);
    onStatusChange('正在获取 Pool 信息...');

    try {
      const { BN } = await import('@coral-xyz/anchor');
      const pool = new PublicKey(poolAddress);
      const poolMint = getPoolMint(program as any, pool);

      // 确保用户 LP ATA 存在
      const userPoolAta = await token.getAssociatedTokenAddress(poolMint, publicKey);
      try {
        await token.getAccount(connection, userPoolAta);
      } catch {
        const createIx = token.createAssociatedTokenAccountInstruction(
          publicKey,
          userPoolAta,
          publicKey,
          poolMint
        );
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        const tx = new Transaction().add(createIx);
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;
        const signedTx = await signTransaction(tx);
        const signature = await connection.sendRawTransaction(signedTx.serialize());
        await connection.confirmTransaction(signature, 'confirmed');
      }
      const poolAccount = await client.getPool(pool);
      const tokens = poolAccount.tokens;

      if (tokens.length === 0) {
        onStatusChange('Pool 中还没有 Token，请先添加 Token');
        onLoadingChange(false);
        return;
      }

      // 准备流动性参数
      const userTokenAccounts: PublicKey[] = [];
      const vaultAccounts: PublicKey[] = [];
      const amounts: BN[] = [];

      for (const tokenInfo of tokens) {
        const userTokenAccountAddress = await token.getAssociatedTokenAddress(
          tokenInfo.mintAccount,
          publicKey
        );

        // 检查账户是否存在，如果不存在则创建
        try {
          await token.getAccount(connection, userTokenAccountAddress);
        } catch {
          // 账户不存在，需要创建
          const createIx = token.createAssociatedTokenAccountInstruction(
            publicKey,
            userTokenAccountAddress,
            publicKey,
            tokenInfo.mintAccount
          );
          const { blockhash } = await connection.getLatestBlockhash('confirmed');
          const tx = new Transaction().add(createIx);
          tx.recentBlockhash = blockhash;
          tx.feePayer = publicKey;
          const signedTx = await signTransaction(tx);
          const signature = await connection.sendRawTransaction(signedTx.serialize());
          await connection.confirmTransaction(signature, 'confirmed');
        }

        userTokenAccounts.push(userTokenAccountAddress);
        vaultAccounts.push(tokenInfo.vaultAccount);

        const defaultAmount =
          amounts.length === 0 ? tokenInfo.weight.toString() : '0';
        const input = prompt(
          `请输入要为第 ${amounts.length + 1} 个 Token 添加的数量（单位：最小计量单位）\nMint: ${tokenInfo.mintAccount.toString()}\n权重: ${tokenInfo.weight.toString()}`,
          defaultAmount
        );

        if (input === null) {
          onStatusChange('已取消添加流动性');
          onLoadingChange(false);
          return;
        }

        const trimmed = input.trim();
        if (!trimmed || !/^\d+$/.test(trimmed)) {
          onStatusChange('请输入有效的整数数量（单位为最小计量单位）');
          onLoadingChange(false);
          return;
        }

        const amountBN = new BN(trimmed);
        if (amountBN.lte(new BN(0))) {
          onStatusChange('数量必须大于 0');
          onLoadingChange(false);
          return;
        }

        amounts.push(amountBN);
      }

      onStatusChange('正在添加流动性...');

      const signature = await client.addLiquidity(
        pool,
        {
          amounts,
          userTokenAccounts,
          vaultAccounts,
        }
      );

      onStatusChange(`流动性添加成功！交易签名: ${signature}`);
    } catch (error: any) {
      onStatusChange(`添加流动性失败: ${error.message}`);
      console.error('添加流动性错误:', error);
    } finally {
      onLoadingChange(false);
    }
  };

  const handleSwap = async () => {
    if (!client || !publicKey || !poolAddress || !connection || !signTransaction || !program) {
      onStatusChange('请先连接钱包并输入 Pool 地址');
      return;
    }

    const mintIn = prompt('请输入输入 Token Mint 地址:');
    const mintOut = prompt('请输入输出 Token Mint 地址:');
    const amount = prompt('请输入交换数量 (例如: 1000000000，即 1 token，假设 9 位小数):');

    if (!mintIn || !mintOut || !amount) {
      onStatusChange('请输入有效的参数');
      return;
    }

    onLoadingChange(true);
    onStatusChange('正在执行交换...');

    try {
      const { BN } = await import('@coral-xyz/anchor');
      const pool = new PublicKey(poolAddress);
      const mintInPubkey = new PublicKey(mintIn);
      const mintOutPubkey = new PublicKey(mintOut);
      const amountBN = new BN(amount);

      // 获取 vault 地址
      const vaultIn = getVault(program as any, pool, mintInPubkey);
      const vaultOut = getVault(program as any, pool, mintOutPubkey);

      // 获取或创建用户的 token 账户
      const userInAccountInfo = await token.getAssociatedTokenAddress(
        mintInPubkey,
        publicKey
      );
      
      const userOutAccountInfo = await token.getAssociatedTokenAddress(
        mintOutPubkey,
        publicKey
      );

      // 检查账户是否存在，如果不存在则创建
      try {
        await token.getAccount(connection, userInAccountInfo);
      } catch {
        const createIx = token.createAssociatedTokenAccountInstruction(
          publicKey,
          userInAccountInfo,
          publicKey,
          mintInPubkey
        );
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        const tx = new Transaction().add(createIx);
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;
        const signedTx = await signTransaction(tx);
        const signature = await connection.sendRawTransaction(signedTx.serialize());
        await connection.confirmTransaction(signature, 'confirmed');
      }

      try {
        await token.getAccount(connection, userOutAccountInfo);
      } catch {
        const createIx = token.createAssociatedTokenAccountInstruction(
          publicKey,
          userOutAccountInfo,
          publicKey,
          mintOutPubkey
        );
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        const tx = new Transaction().add(createIx);
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;
        const signedTx = await signTransaction(tx);
        const signature = await connection.sendRawTransaction(signedTx.serialize());
        await connection.confirmTransaction(signature, 'confirmed');
      }

      const signature = await client.swap(
        pool,
        {
          amountIn: amountBN,
          minAmountOut: new BN(0),
          vaultIn,
          vaultOut,
          userIn: userInAccountInfo,
          userOut: userOutAccountInfo,
        }
      );

      onStatusChange(`交换成功！交易签名: ${signature}`);
    } catch (error: any) {
      onStatusChange(`交换失败: ${error.message}`);
      console.error('交换错误:', error);
    } finally {
      onLoadingChange(false);
    }
  };

  return (
    <div>
      <h2>普通用户操作</h2>
      <div className="button-group">
        <button
          onClick={handleGetPoolInfo}
          disabled={loading || !client}
          className="action-button"
        >
          获取 Pool 信息
        </button>
        <button
          onClick={handleAddLiquidity}
          disabled={loading || !publicKey || !client}
          className="action-button"
        >
          添加流动性
        </button>
        <button
          onClick={handleSwap}
          disabled={loading || !publicKey || !client}
          className="action-button"
        >
          交换代币
        </button>
      </div>
    </div>
  );
}

