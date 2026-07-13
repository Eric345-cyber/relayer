export interface DelegationRequest {
  userAddress: string;
  chainId: number;
  router: string;
  nonce: number;
  yParity: number;
  r: string;
  s: string;
  callData?: string;
  deadline?: number;
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
