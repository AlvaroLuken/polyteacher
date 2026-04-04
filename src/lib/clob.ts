import { Chain, ClobClient, SignatureType } from '@polymarket/clob-client';
import type { ClobSigner } from '@polymarket/clob-client';
import type { WalletClient } from 'viem';

import type { OrderBook } from '../types/polymarket';

const CLOB_BASE = 'https://clob.polymarket.com';
const CHAIN_ID = Chain.POLYGON;

type PriceSide = 'BUY' | 'SELL';

// CLOB API: Order book and pricing (public endpoints).
export async function getOrderBook(tokenId: string): Promise<OrderBook> {
  console.log('[CLOB API - Public] Fetching order book.');
  const res = await fetch(`${CLOB_BASE}/book?token_id=${tokenId}`);
  const data = (await res.json()) as OrderBook;
  return {
    bids: data.bids ?? [],
    asks: data.asks ?? [],
  };
}

export async function getPrice(tokenId: string, side: PriceSide) {
  console.log(`[CLOB API - Public] Fetching ${side} quote price.`);
  const res = await fetch(`${CLOB_BASE}/price?token_id=${tokenId}&side=${side}`);
  return (await res.json()) as { price: string };
}

// CLOB API: Wallet-backed client for L1 auth operations.
export function createL1Client(walletClient: WalletClient): ClobClient {
  console.log('[CLOB API - L1] Creating wallet-authenticated client.');
  return new ClobClient(
    CLOB_BASE,
    CHAIN_ID,
    walletClient as unknown as ClobSigner,
    undefined,
    SignatureType.EOA,
    walletClient.account?.address,
  );
}

// CLOB API: API-key-backed client for L2 trading operations.
export function createL2Client(
  walletClient: WalletClient,
  creds: { key: string; secret: string; passphrase: string },
): ClobClient {
  const funderAddress = walletClient.account?.address;
  console.log('[CLOB API - L2] Creating API-credential client.');
  return new ClobClient(
    CLOB_BASE,
    CHAIN_ID,
    walletClient as unknown as ClobSigner,
    creds,
    SignatureType.EOA,
    funderAddress,
  );
}
