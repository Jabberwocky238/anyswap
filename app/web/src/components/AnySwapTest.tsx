import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import * as anchor from '@coral-xyz/anchor';
import { Program, Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { Client } from '@anyswap/client';
import CreateToken from './CreateToken';
import MintToken from './MintToken';
import PoolManagement from './PoolManagement';
import AdminActions from './AdminActions';
import UserActions from './UserActions';
import StatusDisplay from './StatusDisplay';
import CreatedTokensList from './CreatedTokensList';
import PoolInfo, { PoolInfoData } from './PoolInfo';
import './AnySwapTest.css';

interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  mint: string;
}

function AnySwapTest() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, signTransaction, signAllTransactions } = wallet;
  const { client, program, setClient, setProgram } = useClient();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [poolAddress, setPoolAddress] = useState<string>('');
  const [poolId, setPoolId] = useState<string>('0');
  const [createdPools, setCreatedPools] = useState<string[]>([]);
  const [idl, setIdl] = useState<any>(null);
  const [idlError, setIdlError] = useState<string>('');
  const [createdTokens, setCreatedTokens] = useState<TokenInfo[]>([]);
  const [poolInfo, setPoolInfo] = useState<PoolInfoData | null>(null);
  const [poolInfoLoading, setPoolInfoLoading] = useState(false);
  const [poolInfoError, setPoolInfoError] = useState('');

  // 从 localStorage 加载已创建的 pools 和 tokens
  useEffect(() => {
    const savedPools = localStorage.getItem('anyswap_created_pools');
    if (savedPools) {
      try {
        const pools = JSON.parse(savedPools);
        setCreatedPools(pools);
        if (pools.length > 0) {
          setPoolAddress(pools[0]);
        }
      } catch (e) {
        console.error('Failed to load saved pools:', e);
      }
    }
    
    const savedTokens = localStorage.getItem('anyswap_created_tokens');
    if (savedTokens) {
      try {
        const tokens = JSON.parse(savedTokens);
        setCreatedTokens(tokens);
      } catch (e) {
        console.error('Failed to load saved tokens:', e);
      }
    }
  }, []);

  // 从本地文件加载 IDL
  useEffect(() => {
    const loadIDL = async () => {
      try {
        setStatus('正在加载 IDL...');
        
        const response = await fetch('/idl/anyswap.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const loadedIdl = await response.json();
        
        if (loadedIdl && loadedIdl.instructions) {
          if (!Array.isArray(loadedIdl.instructions)) {
            throw new Error('IDL 结构无效：instructions 不是数组');
          }
          
          if (!loadedIdl.accounts || !Array.isArray(loadedIdl.accounts)) {
            loadedIdl.accounts = [];
          }
          
          const poolAccountIndex = loadedIdl.accounts.findIndex((acc: any) => acc.name === 'AnySwapPool');
          if (poolAccountIndex >= 0) {
            const existingAccount = loadedIdl.accounts[poolAccountIndex];
            if (!existingAccount.size) {
              existingAccount.size = 73792;
            }
            if (!existingAccount.type) {
              existingAccount.type = {
                defined: 'AnySwapPool'
              };
            }
          } else {
            loadedIdl.accounts.push({
              name: 'AnySwapPool',
              discriminator: [163, 124, 202, 65, 144, 69, 54, 192],
              type: {
                defined: 'AnySwapPool'
              },
              size: 73792
            });
          }
          
          if (loadedIdl.types && Array.isArray(loadedIdl.types)) {
            const poolTypeIndex = loadedIdl.types.findIndex((t: any) => t.name === 'AnySwapPool');
            if (poolTypeIndex >= 0) {
              const poolType = loadedIdl.types[poolTypeIndex];
              if (!poolType.size) {
                poolType.size = 73792;
              }
            }
          }
          
          console.log('IDL 加载成功，包含', loadedIdl.instructions.length, '个指令');
          
          setIdl(loadedIdl);
          setIdlError('');
          setStatus('IDL 加载成功，已连接到测试网');
        } else {
          throw new Error('IDL 格式不正确');
        }
      } catch (error: any) {
        console.error('加载 IDL 失败:', error);
        setIdlError(`无法加载 IDL: ${error.message}`);
        setStatus(`IDL 加载失败: ${error.message}`);
      }
    };

    loadIDL();
  }, []);

  // 初始化程序
  useEffect(() => {
    if (!idl) return;
    
    if (!idl.instructions || !Array.isArray(idl.instructions)) {
      console.error('IDL 结构无效:', idl);
      setStatus('IDL 结构无效，请检查 IDL 文件');
      return;
    }
    
    if (!connection || !publicKey || !signTransaction || !signAllTransactions) {
      return;
    }

    try {
      const walletAdapter = {
        publicKey: wallet.publicKey,
        signTransaction: signTransaction,
        signAllTransactions: signAllTransactions,
      };

      const provider = new anchor.AnchorProvider(
        connection,
        walletAdapter as anchor.Wallet,
        { 
          commitment: 'confirmed',
          skipPreflight: false
        }
      );

      anchor.setProvider(provider);

      const poolAccount = idl.accounts?.find((acc: any) => acc.name === 'AnySwapPool');
      const poolType = idl.types?.find((t: any) => t.name === 'AnySwapPool');
      
      if (poolAccount && poolAccount.type && poolAccount.type.defined === 'AnySwapPool') {
        if (!poolType) {
          throw new Error('找不到 AnySwapPool 类型定义');
        }
        if (!poolType.size) {
          poolType.size = 73792;
        }
        if (!poolAccount.size) {
          poolAccount.size = poolType.size;
        }
      }
      
      if (!poolAccount) {
        throw new Error('找不到 AnySwapPool 账户定义');
      }
      if (!poolAccount.type) {
        throw new Error('AnySwapPool 账户定义缺少 type 字段');
      }
      if (!poolAccount.size) {
        throw new Error('AnySwapPool 账户定义缺少 size 字段');
      }
      if (!poolType) {
        throw new Error('找不到 AnySwapPool 类型定义');
      }
      if (!poolType.size) {
        throw new Error('AnySwapPool 类型定义缺少 size 字段');
      }
      
      console.log('正在创建 Program 实例...');
      
      const programInstance = new Program(
        idl as Idl,
        provider as any
      ) as any;
      
      setProgram(programInstance);
      setClient(new Client(provider));
      setStatus('程序初始化成功，可以开始使用');
    } catch (error: any) {
      console.error('程序初始化失败:', error);
      setStatus(`程序初始化失败: ${error.message}`);
    }
  }, [wallet.publicKey, connection, signTransaction, signAllTransactions, idl]);

  const handleTokenCreated = (tokenInfo: TokenInfo) => {
    const updatedTokens = [...createdTokens, tokenInfo];
    setCreatedTokens(updatedTokens);
    localStorage.setItem('anyswap_created_tokens', JSON.stringify(updatedTokens));
  };

  const handlePoolCreated = (poolAddress: string) => {
    const updatedPools = [...createdPools, poolAddress];
    setCreatedPools(updatedPools);
    localStorage.setItem('anyswap_created_pools', JSON.stringify(updatedPools));
    setPoolAddress(poolAddress);
  };

  const fetchPoolInfo = useCallback(async () => {
    if (!client || !poolAddress) {
      setPoolInfo(null);
      setPoolInfoError('');
      return;
    }

    let poolPubkey: PublicKey;
    try {
      poolPubkey = new PublicKey(poolAddress);
    } catch (error) {
      setPoolInfo(null);
      setPoolInfoError('请输入有效的 Pool 地址');
      return;
    }

    try {
      setPoolInfoLoading(true);
      const info = await client.getPoolInfo(poolPubkey)

      setPoolInfo({
        address: poolPubkey.toString(),
        admin: info.admin.toString(),
        feeNumerator: info.feeNumerator.toString(),
        feeDenominator: info.feeDenominator.toString(),
        lpMint: info.lpMint.toString(),
        lpSupply: info.lpSupply.toString(),
        tokenCount: info.tokenCount,
        tokens: info.tokens.map((token, index) => ({
          index: index + 1,
          mint: token.mintAccount.toString(),
          vault: token.vaultAccount.toString(),
          weight: token.weight.toString(),
        })),
      });
      setPoolInfoError('');
    } catch (error: any) {
      console.error('获取 Pool 信息失败:', error);
      setPoolInfo(null);
      setPoolInfoError(error.message || '获取 Pool 信息失败');
    } finally {
      setPoolInfoLoading(false);
    }
  }, [client, poolAddress]);

  useEffect(() => {
    fetchPoolInfo();
  }, [fetchPoolInfo]);

  return (
    <div className="anyswap-test">
      <div className="wallet-section">
        <WalletMultiButton />
        {publicKey && (
          <div className="wallet-info">
            <p>已连接钱包: {publicKey.toString()}</p>
            <p>网络: Devnet (测试网)</p>
          </div>
        )}
      </div>

      <PoolManagement
        poolId={poolId}
        poolAddress={poolAddress}
        createdPools={createdPools}
        onPoolIdChange={setPoolId}
        onPoolAddressChange={setPoolAddress}
      />

      <PoolInfo
        poolInfo={poolInfo}
        loading={poolInfoLoading}
        error={poolInfoError}
        onRefresh={fetchPoolInfo}
        hasPoolAddress={Boolean(poolAddress)}
      />

      <div className="actions-section">
        <CreateToken
          connection={connection}
          publicKey={publicKey}
          signTransaction={signTransaction}
          onTokenCreated={handleTokenCreated}
          onStatusChange={setStatus}
          onLoadingChange={setLoading}
        />

        <CreatedTokensList tokens={createdTokens} />

        <MintToken
          connection={connection}
          publicKey={publicKey}
          signTransaction={signTransaction}
          createdTokens={createdTokens}
          onStatusChange={setStatus}
          onLoadingChange={setLoading}
        />

        <AdminActions
          client={client}
          publicKey={publicKey}
          poolAddress={poolAddress}
          loading={loading}
          onStatusChange={setStatus}
          onLoadingChange={setLoading}
          onPoolCreated={handlePoolCreated}
        />

        <UserActions  
          connection={connection}
          publicKey={publicKey}
          signTransaction={signTransaction}
          client={client}
          program={program}
          poolAddress={poolAddress}
          loading={loading}
          onStatusChange={setStatus}
          onLoadingChange={setLoading}
        />
      </div>

      <StatusDisplay
        status={status}
        loading={loading}
        idlError={idlError}
      />
    </div>
  );
}

const ClientContext = createContext<{
  client: Client | null;
  program: Program<Idl> | null;
  setClient: (client: Client) => void;
  setProgram: (program: Program<Idl>) => void;
} | null>(null);

function ClientProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<Client | null>(null);
  const [program, setProgram] = useState<Program<Idl> | null>(null);
  return (
    <ClientContext.Provider value={{ client, program, setClient, setProgram }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClient() {
  const client = useContext(ClientContext);
  if (!client) {
    throw new Error('Client not found');
  }
  return client;
};

export default function() {
  return (
    <ClientProvider>
      <AnySwapTest />
    </ClientProvider>
  );
}