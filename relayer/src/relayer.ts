import { ethers } from 'ethers';
import type { DelegationRequest, BroadcastResult, AuthTuple } from './types.js';
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
  
  /**
   * Build and broadcast EIP-7702 type-0x4 transaction
   */
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
    
    // 1. Check deadline
    if (deadline && Math.floor(Date.now() / 1000) > deadline) {
      return { success: false, error: 'Authorization expired' };
    }
    
    // 2. Verify signature matches the auth digest
    const isValid = verifyAuthDigest(userAddress, chainId, router, nonce, yParity, r, s);
    if (!isValid) {
      return { success: false, error: 'Invalid authorization signature' };
    }
    
    // 3. Check user's current nonce matches what they signed
    // (prevents replay if user already sent another tx)
    try {
      const currentNonce = await this.provider.getTransactionCount(userAddress, 'latest');
      if (currentNonce !== nonce) {
        return { 
          success: false, 
          error: `Nonce mismatch: signed ${nonce}, current is ${currentNonce}. Please refresh and retry.` 
        };
      }
    } catch (e) {
      return { success: false, error: 'Failed to verify nonce' };
    }
    
    // 4. Build auth tuple
    const authTuple = buildAuthTuple(chainId, router, nonce, yParity, r, s);
    
    // 5. Get fee data
    const feeData = await this.provider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('50', 'gwei');
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei');
    
    // 6. Build type-0x4 transaction
    const tx: ethers.TransactionRequest = {
      type: 4,
      chainId: chainId,
      to: userAddress,           // Self-call to trigger delegation
      value: 0,
      data: callData || '0x',
      gasLimit: 200000,
      maxFeePerGas,
      maxPriorityFeePerGas,
      accessList: [],
      authorizationList: [authTuple]
    };
    
    // 7. Sign with relayer key (pays gas)
    let signedTx: string;
    try {
      signedTx = await this.wallet.signTransaction(tx);
    } catch (e: any) {
      return { success: false, error: `Failed to sign tx: ${e.message}` };
    }
    
    // 8. Broadcast
    try {
      const txResponse = await this.provider.broadcastTransaction(signedTx);
      
      // Wait for confirmation (optional, can be async)
      // txResponse.wait().then(receipt => {
      //   console.log(`Confirmed: ${receipt?.hash}`);
      // }).catch(console.error);
      
      return {
        success: true,
        txHash: txResponse.hash
      };
    } catch (e: any) {
      // Try fallback RPC if available
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
  
  /**
   * Get relayer balance (for monitoring)
   */
  async getBalance(): Promise<string> {
    const balance = await this.provider.getBalance(this.wallet.address);
    return ethers.formatEther(balance);
  }
      }
      
