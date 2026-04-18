import { Chain, ClobClient, SignatureTypeV2, getContractConfig } from '@polymarket/clob-client-v2';
import type { WalletClient } from 'viem';

import type { OrderBook } from '../types/polymarket';

const V2_CLOB_BASE = process.env.NEXT_PUBLIC_CLOB_BASE_URL || 'https://clob-v2.polymarket.com';
const LEGACY_CLOB_BASE = 'https://clob.polymarket.com';
const CHAIN_ID = Chain.POLYGON;
const CONTRACTS = getContractConfig(CHAIN_ID);
export type TradingFlowVersion = 'legacy' | 'v2';

function getClobHost(flowVersion: TradingFlowVersion): string {
  return flowVersion === 'legacy' ? LEGACY_CLOB_BASE : V2_CLOB_BASE;
}

export const POLYMARKET_CONTRACTS = {
  usdcE: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  collateralOnramp: '0x93070a847efEf7F70739046A929D47a521F5B8ee',
  collateral: CONTRACTS.collateral,
  conditionalTokens: CONTRACTS.conditionalTokens,
  exchange: CONTRACTS.exchangeV2,
  negRiskExchange: CONTRACTS.negRiskExchangeV2,
  negRiskAdapter: CONTRACTS.negRiskAdapter,
} as const;

type PriceSide = 'BUY' | 'SELL';

// CLOB API: Order book and pricing (public endpoints).
export async function getOrderBook(tokenId: string, flowVersion: TradingFlowVersion = 'v2'): Promise<OrderBook> {
  const host = getClobHost(flowVersion);
  console.log('[CLOB API - Public] Fetching order book.');
  const res = await fetch(`${host}/book?token_id=${tokenId}`);
  const data = (await res.json()) as OrderBook;
  return {
    bids: data.bids ?? [],
    asks: data.asks ?? [],
  };
}

export async function getPrice(tokenId: string, side: PriceSide, flowVersion: TradingFlowVersion = 'v2') {
  const host = getClobHost(flowVersion);
  console.log(`[CLOB API - Public] Fetching ${side} quote price.`);
  const res = await fetch(`${host}/price?token_id=${tokenId}&side=${side}`);
  return (await res.json()) as { price: string };
}

// CLOB API: Wallet-backed client for L1 auth operations.
export function createL1Client(walletClient: WalletClient, flowVersion: TradingFlowVersion = 'v2'): ClobClient {
  const host = getClobHost(flowVersion);
  console.log('[CLOB API - L1] Creating wallet-authenticated client.');
  return new ClobClient({
    host,
    chain: CHAIN_ID,
    signer: walletClient as any,
    signatureType: SignatureTypeV2.EOA,
    funderAddress: walletClient.account?.address,
  });
}

// CLOB API: API-key-backed client for L2 trading operations.
export function createL2Client(
  walletClient: WalletClient,
  creds: { key: string; secret: string; passphrase: string },
  flowVersion: TradingFlowVersion = 'v2',
): ClobClient {
  const host = getClobHost(flowVersion);
  const funderAddress = walletClient.account?.address;
  console.log('[CLOB API - L2] Creating API-credential client.');
  return new ClobClient({
    host,
    chain: CHAIN_ID,
    signer: walletClient as any,
    creds,
    signatureType: SignatureTypeV2.EOA,
    funderAddress,
  });
}
