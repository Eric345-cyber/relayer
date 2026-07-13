export interface DelegationRequest {
  userAddress: string;
  chainId: number;
  router: string;
  nonce: number;          // nonce used in auth digest
  yParity: number;        // 0 or 1
  r: string;              // hex
  s: string;              // hex
  callData?: string;      // optional post-delegation call
  deadline?: number;      // optional expiry timestamp
}

export interface RelayerConfig {
  relayerKey: string;
  rpcUrl: string;
  fallbackRpcUrl?: string;
  port: number;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMax: number;
  telegramBotToken?: string;
  telegramChatId?: string;
}

export interface BroadcastResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

