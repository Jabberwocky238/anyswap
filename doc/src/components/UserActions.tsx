import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Client } from '@anyswap/client';
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
      const poolAccount = await client.getPoolInfo(pool);
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
      const poolMint = client.getPoolMint(pool);

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
      const poolAccount = await client.getPoolInfo(pool);
      const tokens = poolAccount.tokens;

      if (tokens.length === 0) {
        onStatusChange('Pool 中还没有 Token，请先添加 Token');
        onLoadingChange(false);
        return;
      }

      // 获取所有 vault 余额和 mint 信息
      const vaultBalances: bigint[] = [];
      const mintDecimals: number[] = [];
      
      for (const tokenInfo of tokens) {
        try {
          const vaultAccount = await token.getAccount(connection, tokenInfo.vaultAccount);
          vaultBalances.push(BigInt(vaultAccount.amount.toString()));
        } catch {
          vaultBalances.push(BigInt(0));
        }

        try {
          const mintInfo = await token.getMint(connection, tokenInfo.mintAccount);
          mintDecimals.push(mintInfo.decimals);
        } catch {
          mintDecimals.push(9); // 默认 9 位小数
        }
      }

      // 判断是否是首次添加流动性（所有 vault 余额为 0）
      const isFirstLiquidity = vaultBalances.every(b => b === BigInt(0));

      // 显示 token 列表，让用户选择基准币
      let tokenListStr = '请选择作为基准的 Token（输入序号）:\n\n';
      for (let i = 0; i < tokens.length; i++) {
        const tokenInfo = tokens[i];
        const decimals = mintDecimals[i];
        const vaultBalanceReadable = (Number(vaultBalances[i].toString()) / Math.pow(10, decimals)).toFixed(decimals);
        tokenListStr += `${i + 1}. 权重: ${tokenInfo.weight.toString()}, 当前余额: ${vaultBalanceReadable}, Mint: ${tokenInfo.mintAccount.toString().slice(0, 8)}...\n`;
      }

      const baseTokenIndexInput = prompt(tokenListStr, '1');
      if (baseTokenIndexInput === null) {
        onStatusChange('已取消添加流动性');
        onLoadingChange(false);
        return;
      }

      const baseTokenIndex = parseInt(baseTokenIndexInput.trim()) - 1;
      if (isNaN(baseTokenIndex) || baseTokenIndex < 0 || baseTokenIndex >= tokens.length) {
        onStatusChange('请输入有效的 Token 序号');
        onLoadingChange(false);
        return;
      }

      const baseTokenInfo = tokens[baseTokenIndex];
      const baseDecimals = mintDecimals[baseTokenIndex];
      const baseVaultBalance = vaultBalances[baseTokenIndex];
      const baseVaultBalanceReadable = (Number(baseVaultBalance.toString()) / Math.pow(10, baseDecimals)).toFixed(baseDecimals);

      // 建议默认数量
      const defaultAmount = isFirstLiquidity 
        ? (1000 * Math.pow(10, baseDecimals) / Math.pow(10, baseDecimals)).toFixed(baseDecimals)
        : (100 * Math.pow(10, baseDecimals) / Math.pow(10, baseDecimals)).toFixed(baseDecimals);

      // 让用户输入基准币数量
      const amountInput = prompt(
        `基准 Token: ${baseTokenIndex + 1}\n` +
        `权重: ${baseTokenInfo.weight.toString()}\n` +
        `当前 Vault 余额: ${baseVaultBalanceReadable}\n` +
        `小数位数: ${baseDecimals}\n\n` +
        `请输入要注入的基准币数量:`,
        defaultAmount
      );

      if (amountInput === null) {
        onStatusChange('已取消添加流动性');
        onLoadingChange(false);
        return;
      }

      const amountFloat = parseFloat(amountInput.trim());
      if (isNaN(amountFloat) || amountFloat <= 0) {
        onStatusChange('请输入有效的正数数量');
        onLoadingChange(false);
        return;
      }

      // 转换为最小计量单位
      const baseAmountInSmallestUnit = BigInt(Math.floor(amountFloat * Math.pow(10, baseDecimals)));
      const baseAmountBN = new BN(baseAmountInSmallestUnit.toString());

      // 计算所有币的数量
      const userTokenAccounts: PublicKey[] = [];
      const vaultAccounts: PublicKey[] = [];
      const amounts: BN[] = [];

      for (let i = 0; i < tokens.length; i++) {
        const tokenInfo = tokens[i];
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

        let amountBN: BN;
        if (i === baseTokenIndex) {
          // 基准币使用用户输入的数量
          amountBN = baseAmountBN;
        } else if (isFirstLiquidity) {
          // 首次添加：根据权重比例计算
          // amount_i = baseAmount * (weight_i / weight_base)
          // 使用整数运算避免精度损失
          const weightBase = BigInt(baseTokenInfo.weight.toString());
          const weightI = BigInt(tokenInfo.weight.toString());
          // 使用更大的倍数来保持精度，然后向下取整
          const calculatedAmount = (baseAmountInSmallestUnit * weightI) / weightBase;
          amountBN = new BN(calculatedAmount.toString());
        } else {
          // 后续添加：根据当前池余额比例计算（与合约逻辑一致）
          // amount_i = baseAmount * vault_balances[i] / base_vault_balance
          // 合约使用整数运算：expected_deposit = base_amount * vault_balances[i] / base_vault_balance
          if (baseVaultBalance === BigInt(0)) {
            onStatusChange('基准币的 Vault 余额为 0，无法计算其他币的数量');
            onLoadingChange(false);
            return;
          }
          if (vaultBalances[i] === BigInt(0)) {
            onStatusChange(`Token ${i + 1} 的 Vault 余额为 0，无法添加流动性`);
            onLoadingChange(false);
            return;
          }
          // 使用整数运算，与合约完全一致
          // 合约计算：expected_deposit = (base_amount * vault_balances[i]) / base_vault_balance
          // 为了确保通过合约检查（expected_deposit <= amounts[i]），我们计算精确值
          // 由于整数除法向下取整，我们计算的值应该等于或略大于合约期望的值
          const calculatedAmount = (baseAmountInSmallestUnit * vaultBalances[i]) / baseVaultBalance;
          // 添加 1 的最小单位作为安全余量，确保通过检查（处理整数除法的舍入误差）
          const safeAmount = calculatedAmount + BigInt(1);
          amountBN = new BN(safeAmount.toString());
        }

        amounts.push(amountBN);
      }

      // 显示计算结果让用户确认
      let confirmStr = '将添加以下流动性:\n\n';
      for (let i = 0; i < tokens.length; i++) {
        const decimals = mintDecimals[i];
        const amountReadable = (Number(amounts[i].toString()) / Math.pow(10, decimals)).toFixed(decimals);
        confirmStr += `Token ${i + 1}: ${amountReadable} (权重: ${tokens[i].weight.toString()})\n`;
      }
      confirmStr += '\n确认添加？(输入 y 确认)';

      const confirm = prompt(confirmStr, 'y');
      if (confirm === null || confirm.trim().toLowerCase() !== 'y') {
        onStatusChange('已取消添加流动性');
        onLoadingChange(false);
        return;
      }

      // 检查用户账户余额是否足够
      onStatusChange('正在检查账户余额...');
      for (let i = 0; i < tokens.length; i++) {
        try {
          const userAccount = await token.getAccount(connection, userTokenAccounts[i]);
          const requiredAmount = amounts[i];
          const userBalance = new BN(userAccount.amount.toString());
          
          if (userBalance.lt(requiredAmount)) {
            const decimals = mintDecimals[i];
            const requiredReadable = (Number(requiredAmount.toString()) / Math.pow(10, decimals)).toFixed(decimals);
            const balanceReadable = (Number(userBalance.toString()) / Math.pow(10, decimals)).toFixed(decimals);
            onStatusChange(
              `Token ${i + 1} 余额不足！\n` +
              `需要: ${requiredReadable}\n` +
              `当前余额: ${balanceReadable}\n` +
              `Mint: ${tokens[i].mintAccount.toString()}`
            );
            onLoadingChange(false);
            return;
          }
        } catch (error: any) {
          const decimals = mintDecimals[i];
          const requiredReadable = (Number(amounts[i].toString()) / Math.pow(10, decimals)).toFixed(decimals);
          onStatusChange(
            `无法获取 Token ${i + 1} 账户信息！\n` +
            `需要: ${requiredReadable}\n` +
            `Mint: ${tokens[i].mintAccount.toString()}\n` +
            `错误: ${error.message}`
          );
          onLoadingChange(false);
          return;
        }
      }

      onStatusChange('正在添加流动性...');

      const signature = await client.addLiquidity(
        pool,
        amounts,
        userTokenAccounts,
        vaultAccounts,
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
      const vaultIn = client.getVault(pool, mintInPubkey);
      const vaultOut = client.getVault(pool, mintOutPubkey);

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
        amountBN,
        new BN(0),
        vaultIn,
        vaultOut,
        userInAccountInfo,
        userOutAccountInfo,
      );

      onStatusChange(`交换成功！交易签名: ${signature}`);
    } catch (error: any) {
      onStatusChange(`交换失败: ${error.message}`);
      console.error('交换错误:', error);
    } finally {
      onLoadingChange(false);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!client || !publicKey || !poolAddress || !connection || !signTransaction || !program) {
      onStatusChange('请先连接钱包并输入 Pool 地址');
      return;
    }

    onLoadingChange(true);
    onStatusChange('正在获取 Pool 信息...');

    try {
      const { BN } = await import('@coral-xyz/anchor');
      const pool = new PublicKey(poolAddress);
      const poolMint = client.getPoolMint(pool);
      const poolAccount = await client.getPoolInfo(pool);
      const tokens = poolAccount.tokens;

      if (tokens.length === 0) {
        onStatusChange('Pool 中还没有 Token');
        onLoadingChange(false);
        return;
      }

      // 获取用户的 LP token 账户
      const userPoolAta = await token.getAssociatedTokenAddress(poolMint, publicKey);
      let userLpBalance = BigInt(0);
      try {
        const lpAccount = await token.getAccount(connection, userPoolAta);
        userLpBalance = BigInt(lpAccount.amount.toString());
      } catch {
        onStatusChange('您没有 LP token，无法移除流动性');
        onLoadingChange(false);
        return;
      }

      if (userLpBalance === BigInt(0)) {
        onStatusChange('您的 LP token 余额为 0，无法移除流动性');
        onLoadingChange(false);
        return;
      }

      // 获取 LP mint 信息以显示可读格式
      const lpMintInfo = await token.getMint(connection, poolMint);
      const lpDecimals = lpMintInfo.decimals;
      const lpBalanceReadable = (Number(userLpBalance.toString()) / Math.pow(10, lpDecimals)).toFixed(lpDecimals);

      // 让用户输入要销毁的 LP token 数量
      const burnAmountInput = prompt(
        `您的 LP token 余额: ${lpBalanceReadable}\n` +
        `小数位数: ${lpDecimals}\n\n` +
        `请输入要销毁的 LP token 数量:`,
        lpBalanceReadable
      );

      if (burnAmountInput === null) {
        onStatusChange('已取消移除流动性');
        onLoadingChange(false);
        return;
      }

      const burnAmountFloat = parseFloat(burnAmountInput.trim());
      if (isNaN(burnAmountFloat) || burnAmountFloat <= 0) {
        onStatusChange('请输入有效的正数数量');
        onLoadingChange(false);
        return;
      }

      // 转换为最小计量单位
      const burnAmountInSmallestUnit = BigInt(Math.floor(burnAmountFloat * Math.pow(10, lpDecimals)));
      if (burnAmountInSmallestUnit > userLpBalance) {
        onStatusChange(`销毁数量不能超过您的 LP token 余额: ${lpBalanceReadable}`);
        onLoadingChange(false);
        return;
      }

      const burnAmountBN = new BN(burnAmountInSmallestUnit.toString());

      // 准备用户 token 账户和 vault 账户
      const userTokenAccounts: PublicKey[] = [];
      const vaultAccounts: PublicKey[] = [];

      for (const tokenInfo of tokens) {
        const userTokenAccountAddress = await token.getAssociatedTokenAddress(
          tokenInfo.mintAccount,
          publicKey
        );

        // 检查账户是否存在，如果不存在则创建
        try {
          await token.getAccount(connection, userTokenAccountAddress);
        } catch {
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
      }

      onStatusChange('正在移除流动性...');

      const signature = await client.removeLiquidity(
        pool,
        burnAmountBN,
        userTokenAccounts,
        vaultAccounts,
      );

      onStatusChange(`流动性移除成功！交易签名: ${signature}`);
    } catch (error: any) {
      onStatusChange(`移除流动性失败: ${error.message}`);
      console.error('移除流动性错误:', error);
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
          onClick={handleRemoveLiquidity}
          disabled={loading || !publicKey || !client}
          className="action-button"
        >
          移除流动性
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

