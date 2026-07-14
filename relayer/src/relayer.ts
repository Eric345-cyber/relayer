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
    
    console.log('[DELEGATE] Starting delegate');
    console.log('[DELEGATE] request:', JSON.stringify({
      userAddress, chainId, router, nonce, yParity,
      r: r.slice(0, 10) + '...',
      s: s.slice(0, 10) + '...',
      deadline
    }));
    
    if (deadline && Math.floor(Date.now() / 1000) > deadline) {
      console.log('[DELEGATE] Expired deadline');
      return { success: false, error: 'Authorization expired' };
    }
    
    console.log('[DELEGATE] Verifying auth digest...');
    const isValid = verifyAuthDigest(userAddress, chainId, router, nonce, yParity, r, s);
    console.log('[DELEGATE] isValid:', isValid);
    
    if (!isValid) {
      console.log('[DELEGATE] Signature verification FAILED');
      return { success: false, error: 'Invalid authorization signature' };
    }
    
    console.log('[DELEGATE] Signature verified!');
    
    // ... rest same as before ...
    
    const authTuple = buildAuthTuple(chainId, router, nonce, yParity, r, s);
    
    const yParityNum = parseInt(authTuple[3], 16);
    
    const authorizationLike = {
      chainId: BigInt(authTuple[0]),
      address: authTuple[1],
      nonce: parseInt(authTuple[2], 16),
      yParity: yParityNum,
      r: authTuple[4],
      s: authTuple[5],
      signature: ethers.Signature.from({
        r: authTuple[4],
        s: authTuple[5],
        v: yParityNum + 27
      }).serialized
    };
    
    const feeData = await this.provider.getFeeData();
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
    
    let signedTx: string;
    try {
      signedTx = await this.wallet.signTransaction(tx);
    } catch (e: any) {
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
      
