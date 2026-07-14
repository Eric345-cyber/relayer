import { ethers } from 'ethers';
import type { DelegationRequest, BroadcastResult } from './types.js';
import type { AuthTuple } from './auth.js';
import { buildAuthTuple, verifyAuthDigest, toEvenHex } from './auth.js';

export class RelayerService {
  private provider: ethers.JsonRpcProvider;
  private fallbackProvider?: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  
  constructor(
    privateKey: string,
    rpcUrl: string,
    fallbackRpcUrl?: string
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    
    if (fallbackRpcUrl) {
      this.fallbackProvider = new ethers.JsonRpcProvider(fallbackRpcUrl);
    }
  }
  
  get address(): string {
    return this.wallet.address;
  }
  
  async delegate(request: DelegationRequest): Promise<BroadcastResult> {
    const {
      userAddress,
      chainId,
      router,
      nonce,
      yParity,
      r,
      s,
      callData,
      deadline
    } = request;
    
    if (deadline && Math.floor(Date.now() / 1000) > deadline) {
      return { success: false, error: 'Authorization expired' };
    }
    
    const isValid = verifyAuthDigest(userAddress, chainId, router, nonce, yParity, r, s);
    if (!isValid) {
      return { success: false, error: 'Invalid authorization signature' };
    }
    
    const authTuple = buildAuthTuple(chainId, router, nonce, yParity, r, s);
    
    const yParityNum = parseInt(authTuple[3], 16);
    
    // ─── FIX: Use AuthorizationLike without serialized signature ───
    const authorizationLike = {
      chainId: BigInt(authTuple[0]),
      address: authTuple[1],
      nonce: parseInt(authTuple[2], 16),
      yParity: yParityNum,
      r: authTuple[4],
      s: authTuple[5]
    };
    
    console.log('[AUTH] authorizationLike:', JSON.stringify(authorizationLike, (k, v) => 
      typeof v === 'bigint' ? v.toString() : v
    ));
    
    const feeData = await this.provider.getFeeData();
    console.log('[FEE] feeData:', JSON.stringify({
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString()
    }));
    
    const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('50', 'gwei');
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei');
    
    const tx: ethers.TransactionRequest = {
      type: 4,
      chainId: chainId,
      to: userAddress,
      value: 0,
      data: callData || '0x',
      gasLimit: 200000,
      maxFeePerGas,
      maxPriorityFeePerGas,
      accessList: [],
      authorizationList: [authorizationLike]
    };
    
    console.log('[TX] Full tx object:', JSON.stringify(tx, (k, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (v === undefined) return 'undefined';
      return v;
    }, 2));
    
    let signedTx: string;
    try {
      signedTx = await this.wallet.signTransaction(tx);
    } catch (e: any) {
      console.error('[TX SIGN ERROR]', e);
      return { success: false, error: `Failed to sign tx: ${e.message}` };
    }
    
    try {
      const txResponse = await this.provider.broadcastTransaction(signedTx);
      return { success: true, txHash: txResponse.hash };
    } catch (e: any) {
      if (this.fallbackProvider) {
        try {
          const txResponse = await this.fallbackProvider.broadcastTransaction(signedTx);
          return { success: true, txHash: txResponse.hash };
        } catch (fallbackError: any) {
          return { success: false, error: `Broadcast failed: ${e.message}. Fallback: ${fallbackError.message}` };
        }
      }
      return { success: false, error: `Broadcast failed: ${e.message}` };
    }
  }
  
  async getBalance(): Promise<string> {
    const balance = await this.provider.getBalance(this.wallet.address);
    return ethers.formatEther(balance);
  }
      }
      
