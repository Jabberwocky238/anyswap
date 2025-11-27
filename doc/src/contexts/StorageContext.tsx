import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { CreatedTokenInfo } from '../types/anyswap';

interface StorageContextType {
  // Pools
  pools: string[];
  addPool: (pool: string) => void;
  clearPools: () => void;
  
  // Tokens
  tokens: CreatedTokenInfo[];
  addToken: (token: CreatedTokenInfo) => void;
  clearTokens: () => void;
}

const StorageContext = createContext<StorageContextType | null>(null);

const POOLS_KEY = 'anyswap_created_pools';
const TOKENS_KEY = 'anyswap_created_tokens';

export function StorageProvider({ children }: { children: ReactNode }) {
  const [pools, setPools] = useState<string[]>([]);
  const [tokens, setTokens] = useState<CreatedTokenInfo[]>([]);

  // 初始化：从 localStorage 加载数据
  useEffect(() => {
    try {
      const savedPools = localStorage.getItem(POOLS_KEY);
      if (savedPools) {
        setPools(JSON.parse(savedPools));
      }
    } catch (error) {
      console.error('加载 pools 失败:', error);
    }

    try {
      const savedTokens = localStorage.getItem(TOKENS_KEY);
      if (savedTokens) {
        setTokens(JSON.parse(savedTokens));
      }
    } catch (error) {
      console.error('加载 tokens 失败:', error);
    }
  }, []);

  // 监听其他标签页的 storage 变化
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === POOLS_KEY && e.newValue) {
        try {
          setPools(JSON.parse(e.newValue));
        } catch (error) {
          console.error('解析 pools 失败:', error);
        }
      } else if (e.key === TOKENS_KEY && e.newValue) {
        try {
          setTokens(JSON.parse(e.newValue));
        } catch (error) {
          console.error('解析 tokens 失败:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Pool 操作
  const addPool = (pool: string) => {
    setPools((prev) => {
      // 避免重复
      if (prev.includes(pool)) {
        return prev;
      }
      const updated = [...prev, pool];
      localStorage.setItem(POOLS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const clearPools = () => {
    setPools([]);
    localStorage.removeItem(POOLS_KEY);
  };

  // Token 操作
  const addToken = (token: CreatedTokenInfo) => {
    setTokens((prev) => {
      // 避免重复
      if (prev.some(t => t.mint === token.mint)) {
        return prev;
      }
      const updated = [...prev, token];
      localStorage.setItem(TOKENS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const clearTokens = () => {
    setTokens([]);
    localStorage.removeItem(TOKENS_KEY);
  };

  const value: StorageContextType = {
    pools,
    addPool,
    clearPools,
    tokens,
    addToken,
    clearTokens,
  };

  return (
    <StorageContext.Provider value={value}>
      {children}
    </StorageContext.Provider>
  );
}

export function useStorage() {
  const context = useContext(StorageContext);
  if (!context) {
    throw new Error('useStorage 必须在 StorageProvider 内使用');
  }
  return context;
}

