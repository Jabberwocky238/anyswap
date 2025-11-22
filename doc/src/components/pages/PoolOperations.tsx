import { useState, useEffect, useCallback } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { Client } from '@anyswap/client';
import * as anchor from '@coral-xyz/anchor';
import { Program, Idl } from '@coral-xyz/anchor';
import AdminActions from '../AdminActions';
import PoolManagement from '../PoolManagement';
import PoolInfo, { PoolInfoData } from '../PoolInfo';
import StatusDisplay from '../StatusDisplay';

export default function PoolOperations() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, signTransaction, signAllTransactions } = wallet;
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [poolAddress, setPoolAddress] = useState<string>('');
  const [poolId, setPoolId] = useState<string>('0');
  const [createdPools, setCreatedPools] = useState<string[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [program, setProgram] = useState<Program<Idl> | null>(null);
  const [poolInfo, setPoolInfo] = useState<PoolInfoData | null>(null);
  const [poolInfoLoading, setPoolInfoLoading] = useState(false);
  const [poolInfoError, setPoolInfoError] = useState('');

  // 从 localStorage 加载已创建的 pools
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
  }, []);

  // 初始化 Client 和 Program
  useEffect(() => {
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

      // 加载 IDL
      fetch('/idl/anyswap.json')
        .then(res => res.json())
        .then(idl => {
          const programInstance = new Program(
            idl as Idl,
            provider as any
          ) as any;
          
          setProgram(programInstance);
          setClient(new Client(provider));
          setStatus('程序初始化成功');
        })
        .catch(error => {
          console.error('加载 IDL 失败:', error);
          setStatus(`加载 IDL 失败: ${error.message}`);
        });
    } catch (error: any) {
      console.error('程序初始化失败:', error);
      setStatus(`程序初始化失败: ${error.message}`);
    }
  }, [wallet.publicKey, connection, signTransaction, signAllTransactions]);

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
      const info = await client.getPoolInfo(poolPubkey);

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
    <div className="page-container">
      <h1>Pool 操作</h1>
      <p className="page-description">创建和管理 Pool（管理员操作）</p>

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

      <AdminActions
        client={client}
        publicKey={publicKey}
        poolAddress={poolAddress}
        loading={loading}
        onStatusChange={setStatus}
        onLoadingChange={setLoading}
        onPoolCreated={handlePoolCreated}
      />

      <StatusDisplay
        status={status}
        loading={loading}
        idlError=""
      />
    </div>
  );
}

