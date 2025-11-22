import { PublicKey } from '@solana/web3.js';
import { Client } from '@anyswap/client';

interface AdminActionsProps {
  client: Client | null;
  publicKey: PublicKey | null;
  poolAddress: string;
  loading: boolean;
  onStatusChange: (status: string) => void;
  onLoadingChange: (loading: boolean) => void;
  onPoolCreated?: (poolAddress: string) => void;
}

export default function AdminActions({
  client,
  publicKey,
  poolAddress,
  loading,
  onStatusChange,
  onLoadingChange,
  onPoolCreated,
}: AdminActionsProps) {
  const handleCreatePool = async () => {
    if (!client || !publicKey) {
      onStatusChange('请先连接钱包');
      return;
    }

    const poolIdNum = prompt('请输入 Pool ID (例如: 0):');
    if (!poolIdNum) {
      onStatusChange('请输入 Pool ID');
      return;
    }

    onLoadingChange(true);
    onStatusChange('正在创建 Pool...');

    try {
      const { BN } = await import('@coral-xyz/anchor');
      const result = await client.createPool(
        new BN(5),// fee numerator: 5
        new BN(1000), // fee denominator: 1000 (0.5%)
        publicKey
      );

      const poolAddr = result.pool.toString();
      onStatusChange(`Pool 创建成功！\nPool ID: ${poolIdNum}\nPool 地址: ${poolAddr}`);
      if (onPoolCreated) {
        onPoolCreated(poolAddr);
      }
      console.log('Pool 创建结果:', result);
    } catch (error: any) {
      onStatusChange(`创建 Pool 失败: ${error.message}`);
      console.error('创建 Pool 错误:', error);
    } finally {
      onLoadingChange(false);
    }
  };

  const handleAddToken = async () => {
    if (!client || !publicKey || !poolAddress) {
      onStatusChange('请先创建 Pool 或输入 Pool 地址');
      return;
    }

    const mintAddress = prompt('请输入 Token Mint 地址:');
    const weight = prompt('请输入权重 (例如: 20):');

    if (!mintAddress || !weight) {
      onStatusChange('请输入有效的 Mint 地址和权重');
      return;
    }

    onLoadingChange(true);
    onStatusChange('正在添加 Token...');

    try {
      const { BN } = await import('@coral-xyz/anchor');
      const mint = new PublicKey(mintAddress);
      const weightBN = new BN(parseInt(weight));
      const pool = new PublicKey(poolAddress);

      // 获取现有 vaults
      const poolInfo = await client.getPoolInfo(pool);
      const existingVaults = poolInfo.tokens.map((t: any) => t.vaultAccount);

      const signature = await client.addTokenToPool(
        pool,
        mint,
        weightBN,
        existingVaults
      );

      onStatusChange(`Token 添加成功！交易签名: ${signature}`);
    } catch (error: any) {
      onStatusChange(`添加 Token 失败: ${error.message}`);
      console.error('添加 Token 错误:', error);
    } finally {
      onLoadingChange(false);
    }
  };

  const handleRemoveToken = async () => {
    if (!client || !publicKey || !poolAddress) {
      onStatusChange('请先创建 Pool 或输入 Pool 地址');
      return;
    }

    const mintAddress = prompt('请输入要移除的 Token Mint 地址:');
    if (!mintAddress) {
      onStatusChange('请输入有效的 Mint 地址');
      return;
    }

    onLoadingChange(true);
    onStatusChange('正在移除 Token...');

    try {
      const mint = new PublicKey(mintAddress);
      const pool = new PublicKey(poolAddress);

      const signature = await client.removeTokenFromPool(
        pool,
        mint
      );

      onStatusChange(`Token 移除成功！交易签名: ${signature}`);
    } catch (error: any) {
      onStatusChange(`移除 Token 失败: ${error.message}`);
      console.error('移除 Token 错误:', error);
    } finally {
      onLoadingChange(false);
    }
  };

  const handleModifyTokenWeight = async () => {
    if (!client || !publicKey || !poolAddress) {
      onStatusChange('请先创建 Pool 或输入 Pool 地址');
      return;
    }

    const mintAddress = prompt('请输入要修改的 Token Mint 地址:');
    const newWeight = prompt('请输入新的权重 (例如: 30):');

    if (!mintAddress || !newWeight) {
      onStatusChange('请输入有效的 Mint 地址和新权重');
      return;
    }

    onLoadingChange(true);
    onStatusChange('正在修改 Token 权重...');

    try {
      const { BN } = await import('@coral-xyz/anchor');
      const mint = new PublicKey(mintAddress);
      const weightBN = new BN(parseInt(newWeight));
      const pool = new PublicKey(poolAddress);

      const signature = await client.modifyTokenWeight(
        pool,
        mint,
        weightBN
      );

      onStatusChange(`Token 权重修改成功！交易签名: ${signature}`);
    } catch (error: any) {
      onStatusChange(`修改 Token 权重失败: ${error.message}`);
      console.error('修改 Token 权重错误:', error);
    } finally {
      onLoadingChange(false);
    }
  };

  const handleModifyFee = async () => {
    if (!client || !publicKey || !poolAddress) {
      onStatusChange('请先创建 Pool 或输入 Pool 地址');
      return;
    }

    const feeNumerator = prompt('请输入手续费分子 (例如: 5):');
    const feeDenominator = prompt('请输入手续费分母 (例如: 1000，表示 0.5%):');

    if (!feeNumerator || !feeDenominator) {
      onStatusChange('请输入有效的手续费分子和分母');
      return;
    }

    onLoadingChange(true);
    onStatusChange('正在修改费率...');

    try {
      const { BN } = await import('@coral-xyz/anchor');
      const numeratorBN = new BN(parseInt(feeNumerator));
      const denominatorBN = new BN(parseInt(feeDenominator));
      const pool = new PublicKey(poolAddress);

      const signature = await client.modifyFee(
        pool,
        numeratorBN,
        denominatorBN
      );

      onStatusChange(`费率修改成功！交易签名: ${signature}\n新费率: ${feeNumerator} / ${feeDenominator} = ${(parseInt(feeNumerator) / parseInt(feeDenominator) * 100).toFixed(2)}%`);
    } catch (error: any) {
      onStatusChange(`修改费率失败: ${error.message}`);
      console.error('修改费率错误:', error);
    } finally {
      onLoadingChange(false);
    }
  };

  return (
    <div>
      <h2>管理员操作</h2>
      <div className="button-group">
        <button
          onClick={handleCreatePool}
          disabled={loading || !publicKey || !client}
          className="action-button primary"
        >
          创建 Pool
        </button>
        <button
          onClick={handleAddToken}
          disabled={loading || !publicKey || !client || !poolAddress}
          className="action-button primary"
        >
          添加 Token 到 Pool
        </button>
        <button
          onClick={handleRemoveToken}
          disabled={loading || !publicKey || !client || !poolAddress}
          className="action-button"
        >
          从 Pool 移除 Token
        </button>
        <button
          onClick={handleModifyTokenWeight}
          disabled={loading || !publicKey || !client || !poolAddress}
          className="action-button"
        >
          修改 Token 权重
        </button>
        <button
          onClick={handleModifyFee}
          disabled={loading || !publicKey || !client || !poolAddress}
          className="action-button"
        >
          修改费率
        </button>
      </div>
    </div>
  );
}

