export interface PoolInfoTokenRow {
  index: number;
  mint: string;
  vault: string;
  weight: string;
}

export interface PoolInfoData {
  address: string;
  admin: string;
  feeNumerator: string;
  feeDenominator: string;
  lpMint: string;
  lpSupply: string;
  tokenCount: number;
  tokens: PoolInfoTokenRow[];
}

interface PoolInfoProps {
  poolInfo: PoolInfoData | null;
  loading: boolean;
  error: string;
  hasPoolAddress: boolean;
  onRefresh: () => void;
}

export default function PoolInfo({
  poolInfo,
  loading,
  error,
  hasPoolAddress,
  onRefresh,
}: PoolInfoProps) {
  const renderContent = () => {
    if (!hasPoolAddress) {
      return <p className="pool-info-placeholder">请输入或选择 Pool 地址以查看详情</p>;
    }

    if (loading) {
      return <p className="pool-info-placeholder">正在加载 Pool 信息...</p>;
    }

    if (error) {
      return (
        <div className="warning">
          <p>⚠️ {error}</p>
        </div>
      );
    }

    if (!poolInfo) {
      return <p className="pool-info-placeholder">尚未加载 Pool 信息</p>;
    }

    return (
      <>
        <div className="pool-info-grid">
          <div className="pool-info-card">
            <label>Pool 地址</label>
            <p className="mono-text">{poolInfo.address}</p>
          </div>
          <div className="pool-info-card">
            <label>管理员</label>
            <p className="mono-text">{poolInfo.admin}</p>
          </div>
          <div className="pool-info-card">
            <label>手续费</label>
            <p>{poolInfo.feeNumerator} / {poolInfo.feeDenominator}</p>
          </div>
          <div className="pool-info-card">
            <label>LP Mint</label>
            <p className="mono-text">{poolInfo.lpMint}</p>
          </div>
          <div className="pool-info-card">
            <label>LP Supply</label>
            <p className="mono-text">{poolInfo.lpSupply}</p>
          </div>
          <div className="pool-info-card">
            <label>Token 数量</label>
            <p>{poolInfo.tokenCount}</p>
          </div>
        </div>

        <div className="pool-token-list">
          <h3>Pool Tokens</h3>
          {poolInfo.tokens.length === 0 ? (
            <p className="pool-info-placeholder">当前 Pool 还没有 Token</p>
          ) : (
            poolInfo.tokens.map((token) => (
              <div key={token.index} className="pool-token-card">
                <div className="token-header">
                  <span>Token #{token.index}</span>
                  <span>权重: {token.weight}</span>
                </div>
                <div>
                  <label>Mint</label>
                  <p className="mono-text">{token.mint}</p>
                </div>
                <div>
                  <label>Vault</label>
                  <p className="mono-text">{token.vault}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </>
    );
  };

  return (
    <div className="pool-info-section">
      <div className="pool-info-header">
        <h2>Pool 基本信息</h2>
        <button
          className="action-button"
          onClick={onRefresh}
          disabled={!hasPoolAddress || loading}
        >
          刷新
        </button>
      </div>
      {renderContent()}
    </div>
  );
}


