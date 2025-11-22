interface StatusDisplayProps {
  status: string;
  loading: boolean;
  idlError: string;
}

export default function StatusDisplay({ status, loading, idlError }: StatusDisplayProps) {
  return (
    <>
      <div className="status-section">
        <h2>状态</h2>
        <div className="status-box">
          {loading ? (
            <div className="loading">处理中...</div>
          ) : (
            <pre className="status-text">{status || '等待操作...'}</pre>
          )}
        </div>
      </div>

      {idlError && (
        <div className="warning">
          <p>⚠️ 警告: {idlError}</p>
          <p>请确保将 IDL 文件复制到 <code>public/idl/anyswap.json</code></p>
        </div>
      )}
    </>
  );
}

