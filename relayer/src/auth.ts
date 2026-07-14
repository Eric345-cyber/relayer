import { ethers } from 'ethers';

export type AuthTuple = [string, string, string, string, string, string];

export function toEvenHex(val: string | number | bigint): string {
  if (val === 0 || val === '0x' || val === '0x0') return '0x';
  let hex: string;
  if (typeof val === 'string' && val.startsWith('0x')) {
    hex = val;
  } else {
    hex = ethers.toBeHex(val);
  }
  if (hex.length > 2 && hex.length % 2 !== 0) {
    return '0x0' + hex.slice(2);
  }
  return hex;
}

export function buildAuthTuple(
  chainId: number,
  router: string,
  nonce: number,
  yParity: number,
  r: string,
  s: string
): AuthTuple {
  return [
    toEvenHex(chainId),
    ethers.getAddress(router),
    toEvenHex(nonce),
    toEvenHex(yParity),
    toEvenHex(r),
    toEvenHex(s)
  ];
}

export function verifyAuthDigest(
  userAddress: string,
  chainId: number,
  router: string,
  nonce: number,
  yParity: number,
  r: string,
  s: string
): boolean {
  console.log('[VERIFY] Starting auth verification');
  console.log('[VERIFY] userAddress:', userAddress);
  console.log('[VERIFY] chainId:', chainId);
  console.log('[VERIFY] router:', router);
  console.log('[VERIFY] nonce:', nonce);
  console.log('[VERIFY] yParity:', yParity);
  console.log('[VERIFY] r:', r.slice(0, 20) + '...');
  console.log('[VERIFY] s:', s.slice(0, 20) + '...');
  
  try {
    // Build auth payload RLP
    const authPayloadItems = [
      toEvenHex(chainId),
      ethers.getAddress(router),
      toEvenHex(nonce)
    ];
    console.log('[VERIFY] authPayloadItems:', authPayloadItems);
    
    const authPayloadRlp = ethers.encodeRlp(authPayloadItems);
    console.log('[VERIFY] authPayloadRlp:', authPayloadRlp);
    
    const authPayloadBytes = ethers.getBytes(authPayloadRlp);
    console.log('[VERIFY] authPayloadBytes length:', authPayloadBytes.length);
    
    const magicByte = new Uint8Array([0x05]);
    const combined = new Uint8Array(1 + authPayloadBytes.length);
    combined.set(magicByte, 0);
    combined.set(authPayloadBytes, 1);
    const authHash = ethers.keccak256(combined);
    console.log('[VERIFY] authHash:', authHash);
    
    // Build signature
    const signature = ethers.Signature.from({
      r: toEvenHex(r),
      s: toEvenHex(s),
      v: yParity + 27
    });
    console.log('[VERIFY] signature.r:', signature.r.slice(0, 20) + '...');
    console.log('[VERIFY] signature.s:', signature.s.slice(0, 20) + '...');
    console.log('[VERIFY] signature.v:', signature.v);
    
    const recoveredAddress = ethers.recoverAddress(authHash, signature);
    console.log('[VERIFY] recoveredAddress:', recoveredAddress);
    console.log('[VERIFY] expectedAddress:', userAddress);
    console.log('[VERIFY] match:', recoveredAddress.toLowerCase() === userAddress.toLowerCase());
    
    return recoveredAddress.toLowerCase() === userAddress.toLowerCase();
  } catch (e) {
    console.error('[VERIFY] ERROR:', e);
    return false;
  }
      }
      
