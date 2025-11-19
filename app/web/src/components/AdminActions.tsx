import { PublicKey, Transaction } from '@solana/web3.js';
import { AdminClient } from '@anyswap/client';

interface AdminActionsProps {
  adminClient: AdminClient | null;
  publicKey: PublicKey | null;
  poolAddress: string;
  loading: boolean;
  onStatusChange: (status: string) => void;
  onLoadingChange: (loading: boolean) => void;
  onPoolCreated?: (poolAddress: string) => void;
}

export default function AdminActions({
  adminClient,
  publicKey,
  poolAddress,
  loading,
  onStatusChange,
  onLoadingChange,
  onPoolCreated,
}: AdminActionsProps) {
  const handleCreatePool = async () => {
    if (!adminClient || !publicKey) {
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
      const result = await adminClient.createPool(
        new BN(poolIdNum),
        new BN(5), // fee numerator: 5
        new BN(1000) // fee denominator: 1000 (0.5%)
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
    if (!adminClient || !publicKey || !poolAddress) {
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

      const signature = await adminClient.addTokenToPool(
        pool,
        mint,
        weightBN
      );

      onStatusChange(`Token 添加成功！交易签名: ${signature}`);
    } catch (error: any) {
      onStatusChange(`添加 Token 失败: ${error.message}`);
      console.error('添加 Token 错误:', error);
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
          disabled={loading || !publicKey || !adminClient}
          className="action-button primary"
        >
          创建 Pool
        </button>
        <button
          onClick={handleAddToken}
          disabled={loading || !publicKey || !adminClient}
          className="action-button primary"
        >
          添加 Token 到 Pool
        </button>
      </div>
    </div>
  );
}

