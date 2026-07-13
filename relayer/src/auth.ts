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
  try {
    const authPayloadRlp = ethers.encodeRlp([
      toEvenHex(chainId),
      ethers.getAddress(router),
      toEvenHex(nonce)
    ]);
    
    const authPayloadBytes = ethers.getBytes(authPayloadRlp);
    const magicByte = new Uint8Array([0x05]);
    const combined = new Uint8Array(1 + authPayloadBytes.length);
    combined.set(magicByte, 0);
    combined.set(authPayloadBytes, 1);
    const authHash = ethers.keccak256(combined);
    
    const signature = ethers.Signature.from({
      r: toEvenHex(r),
      s: toEvenHex(s),
      v: yParity + 27
    });
    
    const recoveredAddress = ethers.recoverAddress(authHash, signature);
    
    return recoveredAddress.toLowerCase() === userAddress.toLowerCase();
  } catch (e) {
    console.error('verifyAuthDigest error:', e);
    return false;
  }
    }
