import { OrderType, Side } from '@polymarket/clob-client-v2';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createPublicClient, erc20Abi, formatUnits, http, maxUint256 } from 'viem';
import { polygon } from 'viem/chains';
import { useAccount, useWalletClient, useWriteContract } from 'wagmi';

import {
  POLYMARKET_CONTRACTS,
  createL1Client,
  createL2Client,
  getOrderBook,
  getPrice,
  type TradingFlowVersion,
} from '../lib/clob';
import { fetchEventMarketsBySlug, fetchSpecificTutorialMarkets, getMarket } from '../lib/gamma';
import type { Market, OrderBook } from '../types/polymarket';
import styles from '../styles/Home.module.css';

type Credentials = { key: string; secret: string; passphrase: string };
const POLYGON_CHAIN_ID = 137;
const POLYGON_RPC_URL = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';
const COLLATERAL_ADDRESS = POLYMARKET_CONTRACTS.collateral as `0x${string}`;
const USDC_E_ADDRESS = POLYMARKET_CONTRACTS.usdcE as `0x${string}`;
const CTF_ADDRESS = POLYMARKET_CONTRACTS.conditionalTokens as `0x${string}`;
const EXCHANGE_ADDRESS = POLYMARKET_CONTRACTS.exchange as `0x${string}`;
const NEG_RISK_EXCHANGE_ADDRESS = POLYMARKET_CONTRACTS.negRiskExchange as `0x${string}`;
const NEG_RISK_ADAPTER_ADDRESS = POLYMARKET_CONTRACTS.negRiskAdapter as `0x${string}`;
const ERC1155_ABI = [
  {
    name: 'setApprovalForAll',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
  {
    name: 'isApprovedForAll',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;
const mask = (value: string, reveal: boolean) => (reveal ? value : `${value.slice(0, 4)}••••••${value.slice(-4)}`);
const toCentLabel = (value: string | number | undefined) => {
  const cents = (Number(value ?? 0) || 0) * 100;
  if (!Number.isFinite(cents)) {
    return '0¢';
  }
  const rounded = Number(cents.toFixed(1));
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}¢`;
};
const toMarketOddsLabel = (market: Market) => {
  if (market.outcomes.length >= 2 && market.outcomes[0] === 'Yes' && market.outcomes[1] === 'No') {
    return `Yes ${toCentLabel(market.outcomePrices[0])} / No ${toCentLabel(market.outcomePrices[1])}`;
  }
  const pairs = market.outcomes
    .map((outcome, index) => `${outcome} ${toCentLabel(market.outcomePrices[index])}`)
    .slice(0, 3);
  return pairs.join(' | ');
};
const toProbabilityLabel = (market: Market) => {
  const yesIndex = market.outcomes.findIndex((outcome) => outcome.toLowerCase() === 'yes');
  const yesPriceRaw = yesIndex >= 0 ? market.outcomePrices[yesIndex] : market.outcomePrices[0];
  const yesPrice = Number(yesPriceRaw ?? 0);
  if (!Number.isFinite(yesPrice) || yesPrice <= 0) return '--';
  return `${Math.round(yesPrice * 100)}%`;
};
const toProbabilityValue = (market: Market) => {
  const yesIndex = market.outcomes.findIndex((outcome) => outcome.toLowerCase() === 'yes');
  const yesPriceRaw = yesIndex >= 0 ? market.outcomePrices[yesIndex] : market.outcomePrices[0];
  const yesPrice = Number(yesPriceRaw ?? 0);
  return Number.isFinite(yesPrice) ? yesPrice : 0;
};
const getExecutableAskNotional = (book: OrderBook) => (book.asks ?? []).reduce((total, level) => {
  const price = Number(level.price ?? 0);
  const size = Number(level.size ?? 0);
  if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) return total;
  return total + (price * size);
}, 0);
const LEGACY_CLOB_BASE = 'https://clob.polymarket.com';
async function getLegacyOrderBook(tokenId: string): Promise<OrderBook> {
  const response = await fetch(`${LEGACY_CLOB_BASE}/book?token_id=${tokenId}`);
  const data = (await response.json()) as OrderBook;
  return {
    bids: data.bids ?? [],
    asks: data.asks ?? [],
  };
}
const wait = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

function tokenIdForOutcome(market: Market | null, outcome: 'yes' | 'no' | null) {
  if (!market || !outcome) return '';
  return market.tokens.find((token) => token.outcome.toLowerCase() === outcome)?.tokenId ?? '';
}

function fallbackEventSlugFromTitle(title: string): string {
  const normalized = title.toLowerCase();
  if (normalized.includes('iran ceasefire')) return 'us-x-iran-ceasefire-by';
  if (normalized.includes('republican presidential nominee')) return 'republican-presidential-nominee-2028';
  if (normalized.includes('natural disaster in 2026')) return 'natural-disaster-in-2026';
  return '';
}

function renderInlineCode(text: string): ReactNode {
  const parts = text.split(/`([^`]+)`/g);
  return parts.map((part, index) => (index % 2 === 1
    ? <code className={styles.inlineCode} key={`code-${index}`}>{part}</code>
    : <span key={`text-${index}`}>{part}</span>));
}

function formatAllowanceError(error: unknown): string {
  const raw = String(error ?? '');
  const normalized = raw.toLowerCase();
  if (normalized.includes('user rejected') || normalized.includes('user denied')) {
    return 'Allowance cancelled: transaction was rejected in your wallet.';
  }
  if (normalized.includes('insufficient funds')) {
    return 'Allowance failed: insufficient MATIC for gas on Polygon.';
  }
  if (normalized.includes('chain') || normalized.includes('network')) {
    return 'Allowance failed: please switch to Polygon and try again.';
  }
  return 'Allowance failed: please try again.';
}

function toInputAmount(value: bigint): string {
  const raw = formatUnits(value, 6);
  if (!raw.includes('.')) return raw;
  const normalized = raw.replace(/\.?0+$/, '');
  return normalized.length > 0 ? normalized : '0';
}
function toSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}

function emitTelemetry(event: string, detail: Record<string, unknown> = {}) {
  const payload = { event, at: new Date().toISOString(), ...detail };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('polyteacher:telemetry', { detail: payload }));
  }
  console.log('[PolyTeacher][Telemetry]', payload);
}

const DOCS_LINKS = {
  gammaEvents: 'https://docs.polymarket.com/developers/gamma-markets-api/get-events',
  auth: 'https://docs.polymarket.com/api-reference/authentication',
  onchainOrderInfo: 'https://docs.polymarket.com/developers/CLOB/orders/onchain-order-info',
  createOrder: 'https://docs.polymarket.com/developers/CLOB/orders/create-order',
} as const;
const STEP_RECAPS = {
  1: {
    kicker: 'Step 1 Complete ✅',
    title: 'Nice! You fetched live events with Gamma API. 🔎',
    summary:
      'Gamma is Polymarket\'s public market-discovery API. It is designed for event and market exploration: listing active markets, filtering by tags, reading metadata (question, outcomes, images), and powering browse/search experiences without authentication.',
    poweredBy:
      'At this stage, the core API behavior is event discovery. Gamma\'s events endpoints support broad discovery (`active` / `closed` filtering, sorting, pagination) and targeted lookup by slug. In practice, this is where builders choose the event context before any order workflow begins.',
  },
  2: {
    kicker: 'Step 2 Complete ✅',
    title: 'Great! You selected a market and an outcome side. 🎯',
    summary:
      'Within a chosen event, Gamma exposes the tradable market objects: outcome labels, current prices/probabilities, token identifiers, and display metadata. This turns a high-level topic into a concrete, tradable instrument.',
    poweredBy:
      'The API concept here is market resolution: event -> market -> side (YES/NO). That mapping is essential because CLOB orders are submitted against a specific outcome token/asset, not just an event name.',
  },
  3: {
    kicker: 'Step 3 Complete ✅',
    title: 'Great progress! Your CLOB API credentials are ready. 🔐',
    summary:
      'CLOB trading uses a two-layer auth model. L1 authentication proves wallet ownership through an EIP-712 signature. L2 authentication then uses API credentials (`apiKey`, `secret`, `passphrase`) to sign authenticated CLOB requests.',
    poweredBy:
      'This API step establishes trading identity and request authorization. Public market-data reads can be unauthenticated, but authenticated trading operations (orders, cancellations, user order queries) require valid L2 credentials and signed headers.',
  },
  4: {
    kicker: 'Step 4 Complete ✅',
    title: 'Awesome! Allowances are now configured. ⛓️',
    summary:
      'CLOB intent is API-based, but settlement is contract-based. Before execution, exchange contracts must have token permissions on-chain: pUSD allowances for buys and conditional-token approvals for sells.',
    poweredBy:
      'The key protocol checks in this phase are allowance readiness and execution validity. If permissions are missing, orders fail with balance/allowance errors. This is why production trading flows treat approvals and post-approval verification as first-class prerequisites.',
  },
} as const;
const ReactConfetti = dynamic(() => import('react-confetti'), { ssr: false });

export function TutorialFlow({ flowVersion }: { flowVersion: TradingFlowVersion }) {
  const isV2Flow = flowVersion === 'v2';
  const { isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();
  const polygonReadClient = useMemo(
    () =>
      createPublicClient({
        chain: polygon,
        transport: http(POLYGON_RPC_URL),
      }),
    [],
  );

  const [markets, setMarkets] = useState<Market[]>([]);
  const [eventMarkets, setEventMarkets] = useState<Market[]>([]);
  const [v2LiquidityByMarketId, setV2LiquidityByMarketId] = useState<Record<string, boolean>>({});
  const [v2OutcomeAskLiquidityByMarketId, setV2OutcomeAskLiquidityByMarketId] = useState<Record<string, { yes: boolean; no: boolean }>>({});
  const [isCheckingV2Liquidity, setIsCheckingV2Liquidity] = useState(false);
  const [selectedEventSlug, setSelectedEventSlug] = useState('');
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no' | null>(null);
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [revealCreds, setRevealCreds] = useState({
    key: false,
    secret: false,
    passphrase: false,
  });
  const [allowanceNote, setAllowanceNote] = useState("Click 'Set Allowances' to approve Polymarket contracts.");
  const [allowanceReady, setAllowanceReady] = useState(false);
  const [isSettingAllowance, setIsSettingAllowance] = useState(false);
  const [allowanceProgress, setAllowanceProgress] = useState('');
  const [allowanceTxs, setAllowanceTxs] = useState<Array<{ label: string; hash: string; help: string }>>([]);
  const [usdcEBalance, setUsdcEBalance] = useState<bigint>(BigInt(0));
  const [pUsdBalance, setPUsdBalance] = useState<bigint>(BigInt(0));
  const [tradeAmountUsdc, setTradeAmountUsdc] = useState('10');
  const [lastOrderIntent, setLastOrderIntent] = useState<{
    requestedPusdAmount: number;
    submittedPusdAmount: number;
    estimatedShares: number;
    price: number;
  } | null>(null);
  const [orderResponse, setOrderResponse] = useState<any>(null);
  const [orderError, setOrderError] = useState('');
  const [orderErrorDetails, setOrderErrorDetails] = useState('');
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [step1Error, setStep1Error] = useState('');
  const [lastFocusedPollAt, setLastFocusedPollAt] = useState<Date | null>(null);
  const [activeStep, setActiveStep] = useState(1);
  const [step2SelectedMarketId, setStep2SelectedMarketId] = useState('');
  const [hasFetchedMarkets, setHasFetchedMarkets] = useState(false);
  const [isDerivingCreds, setIsDerivingCreds] = useState(false);
  const [stepRecapModal, setStepRecapModal] = useState<{ from: 1 | 2 | 3 | 4; to: number } | null>(null);
  const [lessonSectionsViewed, setLessonSectionsViewed] = useState({ insight: false, happened: false });

  const unlocked = {
    step1: true,
    step2: Boolean(selectedEventSlug),
    step3: Boolean(step2SelectedMarketId && selectedOutcome),
    step4: !!creds,
    step5: allowanceReady,
  };
  const completed = {
    step1: unlocked.step2,
    step2: unlocked.step3,
    step3: unlocked.step4,
    step4: unlocked.step5,
    step5: Boolean(orderResponse),
  };

  const activeTokenId = tokenIdForOutcome(selectedMarket, selectedOutcome);
  const numericUsdcAmount = Number(tradeAmountUsdc) || 0;

  const bestBid = Number(orderBook?.bids?.[0]?.price ?? 0);
  const bestAsk = Number(orderBook?.asks?.[0]?.price ?? 0);
  const spread = bestAsk > 0 ? bestAsk - bestBid : 0;
  const midpoint = bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;

  const orderId = (orderResponse?.orderID as string | undefined) ?? (orderResponse?.orderId as string | undefined) ?? '';
  const executedStatus = String(orderResponse?.status ?? 'pending');
  const executedShares = Number(orderResponse?.takingAmount ?? Number.NaN);
  const executedTxHash =
    Array.isArray(orderResponse?.transactionsHashes) && typeof orderResponse.transactionsHashes[0] === 'string'
      ? orderResponse.transactionsHashes[0]
      : '';
  const selectedMarketId = selectedMarket?.id ?? '';
  const yesCents = toCentLabel(selectedMarket?.outcomePrices?.[0]);
  const noCents = toCentLabel(selectedMarket?.outcomePrices?.[1]);
  const rankedEventMarkets = useMemo(
    () => [...eventMarkets].sort((a, b) => toProbabilityValue(b) - toProbabilityValue(a)),
    [eventMarkets],
  );
  const topEventMarkets = useMemo(
    () => rankedEventMarkets.slice(0, 5),
    [rankedEventMarkets],
  );
  const eventMarketOptions = useMemo(
    () => (isV2Flow
      ? topEventMarkets.filter((market) => v2LiquidityByMarketId[market.id] === true)
      : topEventMarkets),
    [isV2Flow, topEventMarkets, v2LiquidityByMarketId],
  );
  const lastFocusedPollLabel = lastFocusedPollAt
    ? lastFocusedPollAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Waiting for first refresh...';
  const selectedOutcomeIndex = selectedMarket
    ? selectedMarket.outcomes.findIndex((outcome) => outcome.toLowerCase() === selectedOutcome)
    : -1;
  const selectedOutcomeLabel = selectedOutcome ? selectedOutcome.toUpperCase() : 'Select Yes/No';
  const selectedMarketOutcomeV2AskLiquidity = selectedMarket ? v2OutcomeAskLiquidityByMarketId[selectedMarket.id] : undefined;
  const canSelectYesOutcome = !isV2Flow || (selectedMarketOutcomeV2AskLiquidity?.yes ?? false);
  const canSelectNoOutcome = !isV2Flow || (selectedMarketOutcomeV2AskLiquidity?.no ?? false);
  const referenceOutcomePrice =
    Number(selectedMarket?.outcomePrices?.[selectedOutcomeIndex] ?? 0) ||
    Number(orderBook?.asks?.[0]?.price ?? 0) ||
    0;
  const estimatedShares = referenceOutcomePrice > 0 ? numericUsdcAmount / referenceOutcomePrice : 0;
  const stepCompletion: Record<number, boolean> = {
    1: completed.step1,
    2: completed.step2,
    3: completed.step3,
    4: completed.step4,
    5: completed.step5,
  };
  const stepUnlock: Record<number, boolean> = {
    1: unlocked.step1,
    2: unlocked.step2,
    3: unlocked.step3,
    4: unlocked.step4,
    5: unlocked.step5,
  };
  const maxSteps = 5;
  const hasNextStep = activeStep < maxSteps;
  const nextStepNumber = hasNextStep ? activeStep + 1 : maxSteps;
  const canAdvanceStep = hasNextStep && stepCompletion[activeStep] && stepUnlock[nextStepNumber];
  const flowCollateralLabel = isV2Flow ? 'pUSD' : 'USDC.e';
  const nextStepHint = (() => {
    if (activeStep === 1) {
      return canAdvanceStep
        ? 'Event selected. Continue to Step 2 to choose a specific market.'
        : 'To complete Step 1, first click "Fetch Events" to load events, then select an event to continue.';
    }
    if (activeStep === 2) {
      return canAdvanceStep
        ? 'Specific market and outcome selected. Continue to Step 3.'
        : 'To complete Step 2, first select a sub-market from the list, then explicitly select either a YES or NO outcome.';
    }
    if (activeStep === 3) {
      return canAdvanceStep
        ? 'Outcome selected. Continue to Step 4.'
        : 'To complete Step 3, connect your wallet, derive API keys, and make sure a YES or NO outcome is selected.';
    }
    if (activeStep === 4) {
      return canAdvanceStep
        ? 'Allowances set. Continue to Step 5.'
        : isV2Flow
          ? 'To complete Step 4, set allowances and, if needed, use the navbar PUSD Wrapper before trading.'
          : 'To complete Step 4, set allowances for the legacy flow, then continue to Step 5.';
    }
    if (activeStep === 5) {
      return canAdvanceStep
        ? 'Order placed. Continue to Step 6.'
        : `To complete Step 5, enter the amount of ${flowCollateralLabel} you want to spend and click "Place Order".`;
    }
    return '';
  })();
  const selectedEvent = markets.find(
    (market) => (market.eventSlug ?? fallbackEventSlugFromTitle(market.question)) === selectedEventSlug,
  );
  const stepRecap = stepRecapModal ? STEP_RECAPS[stepRecapModal.from] : null;
  const canAdvanceFromLessonModal = lessonSectionsViewed.insight && lessonSectionsViewed.happened;
  const collateralTokenLabel = isV2Flow ? 'pUSD' : 'USDC.e';
  const hasCollateralBalance = (isV2Flow ? pUsdBalance : usdcEBalance) > BigInt(0);
  const usdcEBalanceLabel = Number(formatUnits(usdcEBalance, 6)).toFixed(4);
  const pUsdBalanceLabel = Number(formatUnits(pUsdBalance, 6)).toFixed(4);

  const applyTradePreset = (numerator: bigint, denominator: bigint) => {
    const activeBalance = isV2Flow ? pUsdBalance : usdcEBalance;
    const next = denominator === BigInt(0) ? BigInt(0) : (activeBalance * numerator) / denominator;
    setTradeAmountUsdc(toInputAmount(next));
  };

  const onNextStepClick = () => {
    if (!canAdvanceStep || activeStep > 4) return;
    setLessonSectionsViewed({ insight: false, happened: false });
    setStepRecapModal({ from: activeStep as 1 | 2 | 3 | 4, to: nextStepNumber });
  };

  const refreshSpecificMarkets = useCallback(async () => {
    const result = await fetchSpecificTutorialMarkets(flowVersion);
    if (result.length === 0) {
      setStep1Error('No markets returned. Check server logs for Gamma fetch details.');
      return false;
    }

    setStep1Error('');
    setMarkets(result);
    setSelectedMarket((previous) => {
      if (!previous) {
        return previous;
      }
      return result.find((market) => market.id === previous.id) ?? previous;
    });
    return true;
  }, [flowVersion]);

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    if (isConnected && address) {
      emitTelemetry('wallet_connected', { address });
    }
  }, [isConnected, address]);

  useEffect(() => {
    if (!selectedMarket || !activeTokenId) return;
    void getOrderBook(activeTokenId, flowVersion).then(setOrderBook);
  }, [selectedMarket, activeTokenId, flowVersion]);

  useEffect(() => {
    if (!selectedEventSlug) {
      setEventMarkets([]);
      setV2LiquidityByMarketId({});
      setV2OutcomeAskLiquidityByMarketId({});
      setIsCheckingV2Liquidity(false);
      setStep2SelectedMarketId('');
      setSelectedOutcome(null);
      return;
    }

    void fetchEventMarketsBySlug(selectedEventSlug)
      .then((group) => {
        console.log('[TutorialFlow] Loaded event sub-markets.', {
          eventSlug: selectedEventSlug,
          count: group.length,
          firstQuestion: group[0]?.question ?? null,
        });
        setEventMarkets(group);
        setV2LiquidityByMarketId({});
        setV2OutcomeAskLiquidityByMarketId({});
        setIsCheckingV2Liquidity(isV2Flow && group.length > 0);
        setStep2SelectedMarketId('');
        setSelectedOutcome(null);
        setSelectedMarket(null);
      })
      .catch((error) => {
        console.error('[TutorialFlow] Failed loading event sub-markets.', {
          eventSlug: selectedEventSlug,
          error,
        });
        setStep1Error(`Failed to load markets in event: ${String(error)}`);
      });
  }, [selectedEventSlug, isV2Flow]);

  useEffect(() => {
    if (!isV2Flow) {
      setIsCheckingV2Liquidity(false);
      setV2LiquidityByMarketId({});
      setV2OutcomeAskLiquidityByMarketId({});
      return;
    }
    if (topEventMarkets.length === 0) {
      setIsCheckingV2Liquidity(false);
      setV2LiquidityByMarketId({});
      setV2OutcomeAskLiquidityByMarketId({});
      return;
    }

    let active = true;
    setIsCheckingV2Liquidity(true);

    const probeV2Liquidity = async () => {
      const entries = await Promise.all(
        topEventMarkets.map(async (market) => {
          const yesTokenId = market.tokens.find((token) => token.outcome.toLowerCase() === 'yes')?.tokenId ?? '';
          const noTokenId = market.tokens.find((token) => token.outcome.toLowerCase() === 'no')?.tokenId ?? '';
          let yesHasAsk = false;
          let noHasAsk = false;
          try {
            if (yesTokenId) {
              const yesBook = await getOrderBook(yesTokenId, flowVersion);
              yesHasAsk = (yesBook.asks?.length ?? 0) > 0;
            }
            if (noTokenId) {
              const noBook = await getOrderBook(noTokenId, flowVersion);
              noHasAsk = (noBook.asks?.length ?? 0) > 0;
            }
          } catch (error) {
            console.warn('[TutorialFlow][Step2] V2 liquidity probe failed for market.', {
              marketId: market.id,
              yesTokenId,
              noTokenId,
              error: String(error),
            });
          }
          return [market.id, { tradable: yesHasAsk || noHasAsk, yesHasAsk, noHasAsk }] as const;
        }),
      );
      if (!active) return;
      const next = Object.fromEntries(entries.map(([marketId, value]) => [marketId, value.tradable])) as Record<string, boolean>;
      const nextOutcome = Object.fromEntries(
        entries.map(([marketId, value]) => [marketId, { yes: value.yesHasAsk, no: value.noHasAsk }]),
      ) as Record<string, { yes: boolean; no: boolean }>;
      setV2LiquidityByMarketId(next);
      setV2OutcomeAskLiquidityByMarketId(nextOutcome);
      setIsCheckingV2Liquidity(false);
      console.log('[TutorialFlow][Step2] V2 liquidity probe complete.', {
        checked: entries.length,
        tradableCount: entries.filter(([, value]) => value.tradable).length,
      });
    };

    void probeV2Liquidity();

    return () => {
      active = false;
    };
  }, [isV2Flow, topEventMarkets, flowVersion]);

  const refreshTradingReadiness = useCallback(async () => {
    if (!address) {
      setAllowanceReady(false);
      setUsdcEBalance(BigInt(0));
      setPUsdBalance(BigInt(0));
      return false;
    }
    const [
      usdcRawBalance,
      pUsdRawBalance,
      collateralToExchange,
      collateralToNegRisk,
      collateralToAdapter,
      ctfToExchange,
      ctfToNegRisk,
      ctfToAdapter,
    ] = await Promise.all([
      polygonReadClient.readContract({
        address: USDC_E_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      }) as Promise<bigint>,
      polygonReadClient.readContract({
        address: COLLATERAL_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      }) as Promise<bigint>,
      polygonReadClient.readContract({
        address: COLLATERAL_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, EXCHANGE_ADDRESS],
      }) as Promise<bigint>,
      polygonReadClient.readContract({
        address: COLLATERAL_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, NEG_RISK_EXCHANGE_ADDRESS],
      }) as Promise<bigint>,
      polygonReadClient.readContract({
        address: COLLATERAL_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, NEG_RISK_ADAPTER_ADDRESS],
      }) as Promise<bigint>,
      polygonReadClient.readContract({
        address: CTF_ADDRESS,
        abi: ERC1155_ABI,
        functionName: 'isApprovedForAll',
        args: [address, EXCHANGE_ADDRESS],
      }) as Promise<boolean>,
      polygonReadClient.readContract({
        address: CTF_ADDRESS,
        abi: ERC1155_ABI,
        functionName: 'isApprovedForAll',
        args: [address, NEG_RISK_EXCHANGE_ADDRESS],
      }) as Promise<boolean>,
      polygonReadClient.readContract({
        address: CTF_ADDRESS,
        abi: ERC1155_ABI,
        functionName: 'isApprovedForAll',
        args: [address, NEG_RISK_ADAPTER_ADDRESS],
      }) as Promise<boolean>,
    ]);

    setUsdcEBalance(usdcRawBalance);
    setPUsdBalance(pUsdRawBalance);

    const allReady =
      collateralToExchange > BigInt(0) &&
      collateralToNegRisk > BigInt(0) &&
      collateralToAdapter > BigInt(0) &&
      ctfToExchange &&
      ctfToNegRisk &&
      ctfToAdapter;
    setAllowanceReady(allReady);
    console.log('[TutorialFlow][Step5] Trading readiness refreshed.', {
      allReady,
      usdcRawBalance: usdcRawBalance.toString(),
      pUsdRawBalance: pUsdRawBalance.toString(),
    });
    return allReady;
  }, [polygonReadClient, address]);

  useEffect(() => {
    if (!walletClient || !creds || !unlocked.step4) return;
    void (async () => {
      try {
        const ready = await refreshTradingReadiness();
        setAllowanceNote(ready ? '✓ All allowances set' : "Click 'Set Allowances' to approve Polymarket contracts.");
      } catch (error) {
        console.error('[TutorialFlow][Step5] Allowance check failed.', { error });
        setAllowanceReady(false);
        setAllowanceNote('Allowance check failed: refresh wallet and try again.');
      }
    })();
  }, [walletClient, creds, unlocked.step4, refreshTradingReadiness]);

  useEffect(() => {
    if (!selectedMarketId) {
      setLastFocusedPollAt(null);
      return;
    }

    const refreshFocusedMarket = async () => {
      try {
        const latest = await getMarket(selectedMarketId);
        setSelectedMarket((previous) => {
          if (!previous || previous.id !== selectedMarketId) {
            return previous;
          }
          // Preserve event metadata while updating live odds and details.
          return {
            ...latest,
            eventSlug: previous.eventSlug,
            eventTitle: previous.eventTitle,
            image: previous.image ?? latest.image,
            icon: previous.icon ?? latest.icon,
          };
        });
        setLastFocusedPollAt(new Date());
      } catch (error) {
        console.error('[TutorialFlow] Focused market polling failed.', {
          marketId: selectedMarketId,
          error,
        });
        setStep1Error(`Focused market polling failed: ${String(error)}`);
      }
    };

    void refreshFocusedMarket();
    const timer = setInterval(() => {
      void refreshFocusedMarket();
    }, 5000);

    return () => clearInterval(timer);
  }, [selectedMarketId]);

  const placeOrder = async () => {
    if (!walletClient || !creds || !activeTokenId || referenceOutcomePrice <= 0 || numericUsdcAmount <= 0) return;
    if (!hasCollateralBalance) {
      setOrderError(
        isV2Flow
          ? 'pUSD balance required before trading. Open the navbar PUSD Wrapper to wrap USDC.e first.'
          : 'USDC.e balance required before trading in legacy mode. Add USDC.e on Polygon and retry.',
      );
      setOrderErrorDetails('');
      return;
    }
    const requestedPusdAmount = numericUsdcAmount;
    let submittedPusdAmount = requestedPusdAmount;
    let liveAskNotional = 0;
    let liveBook: OrderBook = { asks: [], bids: [] };
    let preflightReason = 'liquidity-ok';
    let executionSnapshot:
      | {
        submittedPusdAmount: number;
        pUsdBalance: string;
        pUsdToExchangeAllowance: string;
        pUsdToNegRiskAllowance: string;
        pUsdToAdapterAllowance: string;
      }
      | null = null;
    const submissionDebugContext = {
      selectedMarketId,
      selectedOutcome,
      tokenId: activeTokenId,
      requestedPusdAmount,
      submittedPusdAmount: requestedPusdAmount,
      referenceOutcomePrice,
      bestBid,
      bestAsk,
      spread,
      midpoint,
      estimatedShares,
      liveAskNotional: 0,
      pUsdBalanceRaw: pUsdBalance.toString(),
      hasCollateralBalance,
      allowanceReady,
      preflightReason,
      liveTopAsks: [] as Array<{ price: string; size: string }>,
      liveTopBids: [] as Array<{ price: string; size: string }>,
      topAsks: (orderBook?.asks ?? []).slice(0, 3),
      topBids: (orderBook?.bids ?? []).slice(0, 3),
    };
    console.log('[TutorialFlow][Step5] Preparing BUY order input.', {
      tradeAmountUsdc,
      requestedPusdAmount,
      referenceOutcomePrice,
      estimatedShares,
      activeTokenId,
      selectedOutcome,
      selectedMarketId,
      pUsdBalanceRaw: pUsdBalance.toString(),
      allowanceReady,
    });
    try {
      if (isV2Flow) {
        const preflightSamples: Array<{ attempt: number; askNotional: number; topAsks: Array<{ price: string; size: string }> }> = [];
        const preflightAttempts = 3;
        for (let attempt = 1; attempt <= preflightAttempts; attempt += 1) {
          const sampleBook = await getOrderBook(activeTokenId, flowVersion);
          const sampleAskNotional = getExecutableAskNotional(sampleBook);
          preflightSamples.push({
            attempt,
            askNotional: sampleAskNotional,
            topAsks: (sampleBook.asks ?? []).slice(0, 5),
          });
          liveBook = sampleBook;
          liveAskNotional = sampleAskNotional;
          if (Number.isFinite(sampleAskNotional) && sampleAskNotional > 0) {
            break;
          }
          if (attempt < preflightAttempts) {
            await wait(700);
          }
        }
        if (!Number.isFinite(liveAskNotional) || liveAskNotional <= 0) {
          let legacyBook: OrderBook = { asks: [], bids: [] };
          let legacyCheckFailed = false;
          try {
            legacyBook = await getLegacyOrderBook(activeTokenId);
          } catch (error) {
            legacyCheckFailed = true;
            console.warn('[TutorialFlow][Step5] Legacy CLOB liquidity probe failed.', {
              tokenId: activeTokenId,
              error: String(error),
            });
          }
          const legacyHasBook = (legacyBook.asks?.length ?? 0) > 0 || (legacyBook.bids?.length ?? 0) > 0;
          setOrderResponse(null);
          setIsTradeModalOpen(false);
          setOrderError(
            legacyHasBook
              ? 'This market currently has liquidity on legacy CLOB (USDC.e), not CLOB V2 (pUSD). Choose a different market/outcome for this tutorial flow.'
              : 'No live sell orders are visible for this outcome right now, so a market buy cannot match. Try another market/outcome and retry.',
          );
          setOrderErrorDetails(JSON.stringify({
            reason: legacyHasBook ? 'legacy-liquidity-detected' : 'no-ask-liquidity-preflight',
            tokenId: activeTokenId,
            selectedMarketId,
            selectedOutcome,
            preflightSamples,
            legacyBookSummary: {
              checkFailed: legacyCheckFailed,
              bids: legacyBook.bids?.length ?? 0,
              asks: legacyBook.asks?.length ?? 0,
              topBid: legacyBook.bids?.[0] ?? null,
              topAsk: legacyBook.asks?.[0] ?? null,
            },
          }, null, 2));
          console.error('[TutorialFlow][Step5] Order blocked after liquidity preflight retries.', {
            tokenId: activeTokenId,
            selectedMarketId,
            selectedOutcome,
            requestedPusdAmount,
            preflightSamples,
            legacyBookSummary: {
              checkFailed: legacyCheckFailed,
              bids: legacyBook.bids?.length ?? 0,
              asks: legacyBook.asks?.length ?? 0,
            },
          });
          return;
        }
        submittedPusdAmount = Math.min(requestedPusdAmount, liveAskNotional);
      } else {
        const legacyBook = await getOrderBook(activeTokenId, flowVersion);
        liveBook = legacyBook;
        liveAskNotional = getExecutableAskNotional(legacyBook);
        submittedPusdAmount = requestedPusdAmount;
      }
      Object.assign(submissionDebugContext, {
        submittedPusdAmount,
        liveAskNotional,
        preflightReason,
        liveTopAsks: (liveBook.asks ?? []).slice(0, 3),
        liveTopBids: (liveBook.bids ?? []).slice(0, 3),
      });
      const [pUsdBalanceRaw, usdcBalanceRaw, pUsdToExchangeAllowanceRaw, pUsdToNegRiskAllowanceRaw, pUsdToAdapterAllowanceRaw] = await Promise.all([
        polygonReadClient.readContract({
          address: COLLATERAL_ADDRESS,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        }) as Promise<bigint>,
        polygonReadClient.readContract({
          address: USDC_E_ADDRESS,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        }) as Promise<bigint>,
        polygonReadClient.readContract({
          address: COLLATERAL_ADDRESS,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address as `0x${string}`, EXCHANGE_ADDRESS],
        }) as Promise<bigint>,
        polygonReadClient.readContract({
          address: COLLATERAL_ADDRESS,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address as `0x${string}`, NEG_RISK_EXCHANGE_ADDRESS],
        }) as Promise<bigint>,
        polygonReadClient.readContract({
          address: COLLATERAL_ADDRESS,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address as `0x${string}`, NEG_RISK_ADAPTER_ADDRESS],
        }) as Promise<bigint>,
      ]);
      executionSnapshot = {
        submittedPusdAmount,
        pUsdBalance: pUsdBalanceRaw.toString(),
        pUsdToExchangeAllowance: pUsdToExchangeAllowanceRaw.toString(),
        pUsdToNegRiskAllowance: pUsdToNegRiskAllowanceRaw.toString(),
        pUsdToAdapterAllowance: pUsdToAdapterAllowanceRaw.toString(),
      };
      const walletCollateralAmount = Number(formatUnits(isV2Flow ? pUsdBalanceRaw : usdcBalanceRaw, 6));
      const v2FeeHeadroomFactor = 0.995;
      const balanceConstrainedAmount = isV2Flow
        ? Math.min(submittedPusdAmount, toSixDecimals(walletCollateralAmount * v2FeeHeadroomFactor))
        : Math.min(submittedPusdAmount, walletCollateralAmount);
      if (!Number.isFinite(balanceConstrainedAmount) || balanceConstrainedAmount <= 0) {
        setOrderError(`Your ${collateralTokenLabel} balance is too low after sizing checks. Add funds or reduce amount.`);
        setOrderErrorDetails(JSON.stringify({
          reason: 'balance-headroom-check-failed',
          submittedPusdAmount,
          walletCollateralAmount,
          flowVersion,
        }, null, 2));
        return;
      }
      submittedPusdAmount = balanceConstrainedAmount;
      Object.assign(submissionDebugContext, {
        submittedPusdAmount,
        walletCollateralAmount,
        v2FeeHeadroomFactor: isV2Flow ? v2FeeHeadroomFactor : 1,
      });
      console.log('[TutorialFlow][Step5] Pre-submit collateral snapshot.', {
        flowVersion,
        walletCollateralAmount,
        ...executionSnapshot,
      });
      const liveQuote = await getPrice(activeTokenId, 'BUY', flowVersion);
      const quotedBuyPrice = Number(liveQuote.price ?? 0);
      const executionPrice = Number.isFinite(quotedBuyPrice) && quotedBuyPrice > 0 ? quotedBuyPrice : referenceOutcomePrice;
      const executionShares = executionPrice > 0 ? submittedPusdAmount / executionPrice : 0;
      console.log('[TutorialFlow][Step5] Live BUY quote resolved.', {
        liveQuotePrice: quotedBuyPrice,
        executionPrice,
        executionShares,
        submittedPusdAmount,
        liveAskNotional,
        preflightReason,
      });
      if (!Number.isFinite(executionPrice) || executionPrice <= 0 || !Number.isFinite(executionShares) || executionShares <= 0) {
        throw new Error('Could not derive a valid executable quote for this market right now.');
      }
      setLastOrderIntent({
        requestedPusdAmount,
        submittedPusdAmount,
        estimatedShares: executionShares,
        price: executionPrice,
      });
      setOrderError('');
      setOrderErrorDetails('');
      const l2Client = createL2Client(walletClient, creds, flowVersion);
      const result = await l2Client.createAndPostMarketOrder({
        tokenID: activeTokenId,
        side: Side.BUY,
        amount: submittedPusdAmount,
        userUSDCBalance: walletCollateralAmount,
      }, undefined, OrderType.FAK);
      console.log('[TutorialFlow][Step5] Raw order response.', {
        orderID: (result as any).orderID ?? (result as any).orderId,
        status: (result as any).status,
        success: (result as any).success,
        makingAmount: (result as any).makingAmount,
        takingAmount: (result as any).takingAmount,
        transactionsHashes: (result as any).transactionsHashes,
      });

      const responseError = String((result as { error?: unknown }).error ?? '');
      const responseStatus = Number((result as { status?: unknown }).status ?? 0);
      const responseSuccess = (result as { success?: unknown }).success;
      const hasFailure = Boolean(responseError) || responseStatus >= 400 || responseSuccess === false;

      if (hasFailure) {
        const normalized = responseError.toLowerCase();
        const pretty =
          normalized.includes('not enough balance') || normalized.includes('allowance')
            ? `Not enough ${collateralTokenLabel} balance or allowance for this trade amount. Try a smaller amount or add funds.`
            : normalized.includes('no match')
              ? 'No shares were available to match this market order at submission time. Try a smaller amount or retry.'
            : 'Trade could not be executed. Please try again with a smaller amount.';
        console.error('[TutorialFlow][Step5] Order response indicates failure.', {
          responseError,
          responseStatus,
          responseSuccess,
          result,
          executionSnapshot,
          submissionDebugContext,
        });
        setOrderResponse(null);
        setIsTradeModalOpen(false);
        setOrderError(pretty);
        setOrderErrorDetails(JSON.stringify({
          result,
          executionSnapshot,
          submissionDebugContext,
        }, null, 2));
        emitTelemetry('trade_submit_failed', {
          reason: responseError || 'unknown-response-failure',
          tokenId: activeTokenId,
          amount: submittedPusdAmount,
        });
        return;
      }

      setOrderResponse(result);
      setIsTradeModalOpen(true);
      emitTelemetry('trade_submitted', {
        orderId: (result as any).orderID ?? (result as any).orderId,
        tokenId: activeTokenId,
        amount: submittedPusdAmount,
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('polyteacher:trade-executed', { detail: { orderId: result.orderID ?? result.orderId } }));
      }
    } catch (error) {
      const raw = String(error);
      const normalized = raw.toLowerCase();
      const pretty =
        normalized.includes('not enough balance') || normalized.includes('allowance')
          ? `Not enough ${collateralTokenLabel} balance or allowance for this trade amount. Try a smaller amount or add funds.`
          : normalized.includes('no match')
            ? 'No shares were available at submission time to match this market buy. Try another market/outcome and retry.'
          : 'Trade failed before submission. Please retry.';
      console.error('[TutorialFlow][Step5] Order submission threw before successful response.', {
        error,
        raw,
        executionSnapshot,
        submissionDebugContext,
      });
      setOrderResponse(null);
      setIsTradeModalOpen(false);
      setOrderError(pretty);
      setOrderErrorDetails(raw);
      emitTelemetry('trade_submit_failed', {
        reason: raw,
        tokenId: activeTokenId,
        amount: submittedPusdAmount,
      });
    }
  };

  return (
    <div className={styles.tutorialFlow}>
      <div className={`${styles.tutorialSplit} ${selectedEventSlug ? styles.tutorialSplitWithFocus : styles.tutorialSplitSingle}`}>
        <div className={styles.stepRail}>
          <p className={styles.moduleLead}>
            <b>Module 1.1: Place Your First Polymarket Trade 🚀</b>. <br /> Go through an interactive flow to learn what Polymarket APIs are needed to execute trades in an application, step by step. <br /> Current mode: <strong>{isV2Flow ? 'CLOB V2 (pUSD)' : 'Legacy CLOB (USDC.e era)'}</strong>.
          </p>
          <StepCard
            step={1}
            title="Fetch Events"
            api="Gamma API — GET /events?slug={slug}"
            apiHref={DOCS_LINKS.gammaEvents}
            unlocked={unlocked.step1}
            isOpen={activeStep === 1}
            onToggle={() => setActiveStep(1)}
            showNextStep={activeStep === 1 && hasNextStep}
            canAdvanceStep={canAdvanceStep}
            nextStepHint={nextStepHint}
            onNextStep={onNextStepClick}
          >
            <p>
              Before you can trade, you need to pick an{' '}
              <span
                className={styles.inlineHelpTerm}
                data-help="An event is the umbrella question (for example, 'Will X happen?'). It usually contains multiple tradable markets/outcomes."
                tabIndex={0}
                title="An event is the umbrella question (for example, 'Will X happen?'). It usually contains multiple tradable markets/outcomes."
              >
                event
              </span>
              . This step fetches tutorial events for the selected mode and shows only their titles.
            </p>
            <button
              className={styles.primaryButton}
              disabled={hasFetchedMarkets}
              onClick={() =>
                void (async () => {
                  try {
                    const ok = await refreshSpecificMarkets();
                    if (ok) {
                      setHasFetchedMarkets(true);
                    }
                  } catch (error) {
                    setStep1Error(`Market fetch failed: ${String(error)}`);
                  }
                })()
              }
              type="button"
            >
              {hasFetchedMarkets ? 'Fetched ✓' : 'Fetch Events'}
            </button>
            {step1Error ? <p className={styles.errorText}>{step1Error}</p> : null}
            <div className={styles.stepResult}>
              {markets.map((market) => (
                <button
                  className={`${styles.eventTitleCard} ${selectedEventSlug === (market.eventSlug ?? fallbackEventSlugFromTitle(market.question)) ? styles.eventTitleCardSelected : ''}`}
                  key={market.id}
                  onClick={() => {
                    const nextSlug = market.eventSlug ?? fallbackEventSlugFromTitle(market.question);
                    setSelectedEventSlug(nextSlug);
                    setSelectedMarket(null);
                  }}
                  type="button"
                >
                  <div className={styles.eventTitleMedia}>
                    {market.image ? (
                      <div
                        aria-hidden="true"
                        className={styles.eventTitleImage}
                        style={{ backgroundImage: `url(${market.image})` }}
                      />
                    ) : (
                      <div className={styles.eventTitleImageFallback}>PM</div>
                    )}
                  </div>
                  <span>{market.question}</span>
                </button>
              ))}
            </div>
          </StepCard>
          <StepCard
            step={2}
            title="Choose a Market in This Event"
            api="Gamma API — event.markets[]"
            apiHref={DOCS_LINKS.gammaEvents}
            unlocked={unlocked.step2}
            isOpen={activeStep === 2}
            onToggle={() => setActiveStep(2)}
            showNextStep={activeStep === 2 && hasNextStep}
            canAdvanceStep={canAdvanceStep}
            nextStepHint={nextStepHint}
            onNextStep={onNextStepClick}
          >
            <p>
              {isV2Flow
                ? 'Events contain grouped sub-markets. We only show top sub-markets with visible CLOB V2 liquidity so this tutorial can execute pUSD trades.'
                : 'Events contain grouped sub-markets. Pick any top sub-market in this event to continue through the legacy flow.'}
            </p>
            <div className={styles.stepResult}>
              {isV2Flow && isCheckingV2Liquidity ? (
                <p className={styles.lockedText}>Checking CLOB V2 liquidity for this event...</p>
              ) : null}
              {eventMarketOptions.map((market) => (
                <button
                  className={`${styles.marketListItem} ${step2SelectedMarketId === market.id ? styles.marketListItemSelected : ''}`}
                  key={market.id}
                  onClick={() => {
                    setSelectedMarket(market);
                    setStep2SelectedMarketId(market.id);
                    setSelectedOutcome(null);
                  }}
                  type="button"
                >
                  <div className={styles.marketListRow}>
                    <div className={styles.marketListMedia}>
                      {market.icon || market.image ? (
                        <img
                          alt={market.question}
                          className={styles.marketListImage}
                          src={market.icon || market.image}
                        />
                      ) : (
                        <div className={styles.marketListImageFallback}>PM</div>
                      )}
                    </div>
                    <div className={styles.marketListText}>
                      <strong>{market.question}</strong>
                      <span>{toMarketOddsLabel(market)}</span>
                    </div>
                    <div className={styles.marketListProbability}>{toProbabilityLabel(market)}</div>
                  </div>
                </button>
              ))}
              {!isCheckingV2Liquidity && eventMarketOptions.length === 0 ? (
                <p className={styles.lockedText}>
                  {isV2Flow
                    ? 'No visible CLOB V2 liquidity found in the top sub-markets for this event right now. Choose another event.'
                    : 'No active sub-markets available for this event right now.'}
                </p>
              ) : null}
            </div>
          </StepCard>

          <StepCard
            step={3}
            title="Connect Your Wallet"
            api="CLOB API — createOrDeriveApiKey()"
            apiHref={DOCS_LINKS.auth}
            unlocked={unlocked.step3}
            isOpen={activeStep === 3}
            onToggle={() => setActiveStep(3)}
            showNextStep={activeStep === 3 && hasNextStep}
            canAdvanceStep={canAdvanceStep}
            nextStepHint={nextStepHint}
            onNextStep={onNextStepClick}
          >
            <p>Polymarket uses your EOA wallet signature to derive L2 API credentials used for authenticated trading requests.</p>
            <p><strong>Wallet status:</strong> {isConnected ? `Connected (${address})` : 'Not connected'}</p>
            {isConnected && walletClient ? (
              <button
                className={styles.primaryButton}
                disabled={isDerivingCreds || Boolean(creds)}
                onClick={() =>
                  void (async () => {
                    try {
                      setIsDerivingCreds(true);
                      const c = await createL1Client(walletClient, flowVersion).createOrDeriveApiKey();
                      setCreds(c);
                    } catch (error) {
                      console.error('[TutorialFlow][Step3] Failed to derive API keys.', { error });
                    } finally {
                      setIsDerivingCreds(false);
                    }
                  })()
                }
                type="button"
              >
                {creds ? 'Derived ✓' : isDerivingCreds ? 'Deriving...' : 'Derive API Keys'}
              </button>
            ) : null}
            {creds ? (
              <div className={styles.stepResult}>
                <ul className={styles.credentialList}>
                  <li className={styles.credentialItem}>
                    <span className={styles.credentialLabel}>Key</span>
                    <code className={styles.credentialValue}>{mask(creds.key, revealCreds.key)}</code>
                    <button
                      aria-label={revealCreds.key ? 'Hide key' : 'Reveal key'}
                      className={styles.credentialToggle}
                      onClick={() => setRevealCreds((value) => ({ ...value, key: !value.key }))}
                      type="button"
                    >
                      {revealCreds.key ? '🙈' : '👁'}
                    </button>
                  </li>
                  <li className={styles.credentialItem}>
                    <span className={styles.credentialLabel}>Secret</span>
                    <code className={styles.credentialValue}>{mask(creds.secret, revealCreds.secret)}</code>
                    <button
                      aria-label={revealCreds.secret ? 'Hide secret' : 'Reveal secret'}
                      className={styles.credentialToggle}
                      onClick={() => setRevealCreds((value) => ({ ...value, secret: !value.secret }))}
                      type="button"
                    >
                      {revealCreds.secret ? '🙈' : '👁'}
                    </button>
                  </li>
                  <li className={styles.credentialItem}>
                    <span className={styles.credentialLabel}>Passphrase</span>
                    <code className={styles.credentialValue}>{mask(creds.passphrase, revealCreds.passphrase)}</code>
                    <button
                      aria-label={revealCreds.passphrase ? 'Hide passphrase' : 'Reveal passphrase'}
                      className={styles.credentialToggle}
                      onClick={() => setRevealCreds((value) => ({ ...value, passphrase: !value.passphrase }))}
                      type="button"
                    >
                      {revealCreds.passphrase ? '🙈' : '👁'}
                    </button>
                  </li>
                </ul>
              </div>
            ) : null}
          </StepCard>

          <StepCard
            step={4}
            title="Set Allowances"
            api="On-chain approval transactions"
            apiHref={DOCS_LINKS.onchainOrderInfo}
            unlocked={unlocked.step4}
            isOpen={activeStep === 4}
            onToggle={() => setActiveStep(4)}
            showNextStep={activeStep === 4 && hasNextStep}
            canAdvanceStep={canAdvanceStep}
            nextStepHint={nextStepHint}
            onNextStep={onNextStepClick}
          >
            <p>Before trading, you must complete multiple collateral-token and CTF approvals across required Polymarket contracts. For a typical user, this is a one-time setup per wallet on Polygon (unless approvals are revoked), and all approvals must finish before moving to the next step.</p>
            <p>
              <strong>Step 4 preflight:</strong>{' '}
              {isV2Flow
                ? 'Allowances do not require funded balance. Trading requires pUSD; if you only have USDC.e, use the navbar PUSD Wrapper before Step 5.'
                : 'Allowances do not require funded balance. Legacy trading in Step 5 uses USDC.e.'}
            </p>
            <p><strong>Balance check:</strong> pUSD {pUsdBalanceLabel} | USDC.e {usdcEBalanceLabel}</p>
            <button
              className={styles.primaryButton}
              onClick={() =>
                void (async () => {
                  if (!walletClient || !creds) return;
                  try {
                    console.log('[TutorialFlow][Step5] Setting allowances...');
                    const signerAddress = walletClient.account?.address;
                    if (!signerAddress) {
                      throw new Error('No wallet account available from wagmi wallet client.');
                    }

                    const currentChainId = await walletClient.getChainId();
                    if (currentChainId !== POLYGON_CHAIN_ID) {
                      setAllowanceReady(false);
                      await walletClient.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x89' }],
                      });
                    }
                    setIsSettingAllowance(true);
                    setAllowanceProgress('');
                    setAllowanceTxs([]);

                    const alreadyReady = await refreshTradingReadiness();
                    if (alreadyReady) {
                      setAllowanceReady(true);
                      setAllowanceNote('✓ All allowances set');
                      return;
                    }
                    const approvals = [
                      {
                        label: 'pUSD → Exchange V2',
                        help: 'Allows the primary CLOB V2 exchange contract to spend your pUSD for BUY orders.',
                        run: async () =>
                          writeContractAsync({
                            address: COLLATERAL_ADDRESS,
                            abi: erc20Abi,
                            functionName: 'approve',
                            args: [EXCHANGE_ADDRESS, maxUint256],
                            chain: polygon,
                          }),
                      },
                      {
                        label: 'CTF → Exchange V2',
                        help: 'Allows the primary CLOB V2 exchange contract to transfer your CTF outcome tokens when required.',
                        run: async () =>
                          writeContractAsync({
                            address: CTF_ADDRESS,
                            abi: ERC1155_ABI,
                            functionName: 'setApprovalForAll',
                            args: [EXCHANGE_ADDRESS, true],
                            chain: polygon,
                          }),
                      },
                      {
                        label: 'pUSD → Neg-Risk Exchange V2',
                        help: 'Allows the neg-risk V2 exchange path to spend pUSD for markets routed through that contract.',
                        run: async () =>
                          writeContractAsync({
                            address: COLLATERAL_ADDRESS,
                            abi: erc20Abi,
                            functionName: 'approve',
                            args: [NEG_RISK_EXCHANGE_ADDRESS, maxUint256],
                            chain: polygon,
                          }),
                      },
                      {
                        label: 'CTF → Neg-Risk Exchange V2',
                        help: 'Allows the neg-risk V2 exchange path to transfer your CTF tokens when that route is used.',
                        run: async () =>
                          writeContractAsync({
                            address: CTF_ADDRESS,
                            abi: ERC1155_ABI,
                            functionName: 'setApprovalForAll',
                            args: [NEG_RISK_EXCHANGE_ADDRESS, true],
                            chain: polygon,
                          }),
                      },
                      {
                        label: 'pUSD → Neg-Risk Adapter',
                        help: 'Allows the neg-risk adapter contract to spend pUSD for adapter-based settlement routes.',
                        run: async () =>
                          writeContractAsync({
                            address: COLLATERAL_ADDRESS,
                            abi: erc20Abi,
                            functionName: 'approve',
                            args: [NEG_RISK_ADAPTER_ADDRESS, maxUint256],
                            chain: polygon,
                          }),
                      },
                      {
                        label: 'CTF → Neg-Risk Adapter',
                        help: 'Allows the neg-risk adapter contract to transfer CTF tokens when adapter settlement is used.',
                        run: async () =>
                          writeContractAsync({
                            address: CTF_ADDRESS,
                            abi: ERC1155_ABI,
                            functionName: 'setApprovalForAll',
                            args: [NEG_RISK_ADAPTER_ADDRESS, true],
                            chain: polygon,
                          }),
                      },
                    ] as const;

                    for (let i = 0; i < approvals.length; i += 1) {
                      const current = approvals[i];
                      setAllowanceProgress(`Approval ${i + 1}/${approvals.length}: ${current.label}`);
                      const hash = await current.run();
                      setAllowanceTxs((previous) => [...previous, { label: current.label, hash, help: current.help }]);
                      await polygonReadClient.waitForTransactionReceipt({
                        hash,
                        pollingInterval: 2000,
                        timeout: 180_000,
                      });
                    }

                    const confirmed = await refreshTradingReadiness();
                    setAllowanceReady(confirmed);
                    setAllowanceProgress(confirmed ? `All approvals completed (${approvals.length}/${approvals.length}).` : '');
                    setAllowanceNote(confirmed ? '✓ All allowances set' : 'Allowance failed: verification check did not pass.');
                    if (confirmed) {
                      emitTelemetry('allowances_completed', {
                        approvals: approvals.length,
                        wallet: signerAddress,
                      });
                    }
                  } catch (error) {
                    console.error('[TutorialFlow][Step5] Allowance update failed.', { error });
                    setAllowanceReady(false);
                    setAllowanceProgress('');
                    setAllowanceNote(formatAllowanceError(error));
                  } finally {
                    setIsSettingAllowance(false);
                  }
                })()
              }
              type="button"
              disabled={isSettingAllowance || allowanceReady}
            >
              {allowanceReady ? 'Allowances ✓' : isSettingAllowance ? 'Setting Allowances...' : 'Set Allowances'}
            </button>
            <p className={styles.allowanceNote}>{allowanceNote}</p>
            {allowanceProgress ? <p className={styles.pollingText}>{allowanceProgress}</p> : null}
            {allowanceTxs.map((tx) => (
              <p className={styles.approvalTxRow} key={tx.hash}>
                <strong>{tx.label}:</strong>
                {' '}
                <a className={styles.approvalTxLink} href={`https://polygonscan.com/tx/${tx.hash}`} rel="noreferrer" target="_blank">
                  Tx {`${tx.hash.slice(0, 8)}...${tx.hash.slice(-6)}`} ↗
                </a>
                {' '}
                <span className={styles.inlineHelpTerm} data-help={tx.help} tabIndex={0} title={tx.help}>
                  i
                </span>
              </p>
            ))}
          </StepCard>

          <StepCard
            step={5}
            title="Place Your First Order"
            api="CLOB API — createAndPostMarketOrder()"
            apiHref={DOCS_LINKS.createOrder}
            unlocked={unlocked.step5}
            isOpen={activeStep === 5}
            onToggle={() => setActiveStep(5)}
            showNextStep={activeStep === 5 && hasNextStep}
            canAdvanceStep={canAdvanceStep}
            nextStepHint={nextStepHint}
            onNextStep={onNextStepClick}
          >
            <p>Enter how much {collateralTokenLabel} you want to spend. We convert that amount into shares automatically at the live market price.</p>
            <p><strong>Preflight:</strong> {hasCollateralBalance ? `${collateralTokenLabel} balance ready` : `${collateralTokenLabel} required`} | {allowanceReady ? 'allowances ready' : 'allowances missing'}</p>
            {isV2Flow && !hasCollateralBalance ? (
              <Link className={styles.primaryButton} href="/wrap">
                Open PUSD Wrapper
              </Link>
            ) : null}
            <p><strong>Market:</strong> {selectedMarket?.question}</p>
            <p>
              <strong>Direction:</strong>{' '}
              <span
                className={`${styles.outcomeBadge} ${
                  selectedOutcome === 'yes' ? styles.outcomeBadgeYes : selectedOutcome === 'no' ? styles.outcomeBadgeNo : ''
                }`}
              >
                {selectedOutcomeLabel}
              </span>
            </p>
            <div className={styles.amountCard}>
              <div className={styles.amountHeaderRow}>
                <span className={styles.amountTitle}>Amount</span>
                <span className={styles.amountCurrency}>{collateralTokenLabel}</span>
              </div>
              <div className={styles.amountInputWrap}>
                <span className={styles.amountPrefix}>$</span>
                <input
                  className={styles.amountInput}
                  id="usdc-amount"
                  min="0"
                  onChange={(e) => setTradeAmountUsdc(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={tradeAmountUsdc}
                />
              </div>
              <div className={styles.amountPresetRow}>
                <button className={styles.amountPresetButton} onClick={() => applyTradePreset(BigInt(1), BigInt(4))} type="button">
                  25%
                </button>
                <button className={styles.amountPresetButton} onClick={() => applyTradePreset(BigInt(1), BigInt(2))} type="button">
                  50%
                </button>
                <button className={styles.amountPresetButton} onClick={() => applyTradePreset(BigInt(3), BigInt(4))} type="button">
                  75%
                </button>
                <button className={styles.amountPresetButton} onClick={() => applyTradePreset(BigInt(1), BigInt(1))} type="button">
                  Max
                </button>
              </div>
            </div>
            <p><strong>Estimated shares:</strong> {estimatedShares > 0 ? estimatedShares.toFixed(4) : 'n/a'} (based on selected outcome price)</p>
            <button
              className={styles.primaryButton}
              disabled={referenceOutcomePrice <= 0 || numericUsdcAmount <= 0 || !allowanceReady || !hasCollateralBalance}
              onClick={() => void placeOrder()}
              type="button"
            >
              Execute Trade
            </button>
            {orderError ? (
              <div className={styles.tradeErrorCard}>
                <p className={styles.tradeErrorText}>{orderError}</p>
                {orderErrorDetails ? (
                  <details className={styles.tradeErrorDetails}>
                    <summary>Technical details</summary>
                    <pre className={styles.jsonBlock}>{orderErrorDetails}</pre>
                  </details>
                ) : null}
              </div>
            ) : null}
            {orderResponse ? (
              <p className={styles.pollingText}>
                Trade submitted. Review confirmation details in the completion modal.
              </p>
            ) : null}
          </StepCard>
        </div>

        {selectedEventSlug ? (
          <div className={`${styles.rightRail} ${styles.rightRailAppear}`}>
            {step2SelectedMarketId && selectedMarket ? (
              <section className={styles.marketPreview}>
                {selectedMarket.image ? (
                  <img
                    alt={selectedMarket.question}
                    className={styles.featuredMarketImage}
                    src={selectedMarket.image}
                  />
                ) : (
                  <div className={styles.featuredMarketImageFallback}>Polymarket</div>
                )}
                <h3>{selectedMarket.question}</h3>
                {step2SelectedMarketId ? (
                  <>
                    <p className={styles.apiTag}>Choose your outcome.</p>
                    <div className={styles.outcomeChooser}>
                      <div
                        className={styles.outcomeChoiceWrap}
                        data-help={isV2Flow && !canSelectYesOutcome ? 'Disabled because no visible V2 ask liquidity is currently available for YES on this market.' : undefined}
                      >
                        <button
                          className={`${ 
                            selectedOutcome === null
                              ? styles.outcomeButton
                              : selectedOutcome === 'yes'
                                ? styles.outcomeYesActive
                                : styles.outcomeYesPassive
                          } ${!canSelectYesOutcome ? styles.outcomeDisabled : ''}`}
                          disabled={!canSelectYesOutcome}
                          onClick={() => {
                            if (!canSelectYesOutcome) return;
                            setSelectedOutcome('yes');
                          }}
                          type="button"
                        >
                          Yes {yesCents}
                        </button>
                      </div>
                      <div
                        className={styles.outcomeChoiceWrap}
                        data-help={isV2Flow && !canSelectNoOutcome ? 'Disabled because no visible V2 ask liquidity is currently available for NO on this market.' : undefined}
                      >
                        <button
                          className={`${
                            selectedOutcome === null
                              ? styles.outcomeButton
                              : selectedOutcome === 'no'
                                ? styles.outcomeNoActive
                                : styles.outcomeNoPassive
                          } ${!canSelectNoOutcome ? styles.outcomeDisabled : ''}`}
                          disabled={!canSelectNoOutcome}
                          onClick={() => {
                            if (!canSelectNoOutcome) return;
                            setSelectedOutcome('no');
                          }}
                          type="button"
                        >
                          No {noCents}
                        </button>
                      </div>
                    </div>
                    {isV2Flow && (!canSelectYesOutcome || !canSelectNoOutcome) ? (
                      <p className={styles.pollingText}>
                        Outcome availability (V2 asks): YES {canSelectYesOutcome ? 'ready' : 'unavailable'} | NO {canSelectNoOutcome ? 'ready' : 'unavailable'}
                      </p>
                    ) : null}
                    {!selectedOutcome ? (
                      <p className={styles.pollingText}>Select YES or NO to unlock Step 3.</p>
                    ) : null}
                  </>
                ) : (
                  <p className={styles.apiTag}>Waiting for specific market selection.</p>
                )}
                <p className={styles.pollingText}>Latest poll: {lastFocusedPollLabel}</p>
              </section>
            ) : selectedEvent ? (
              <section className={styles.marketPreview}>
                {selectedEvent.image ? (
                  <img
                    alt={selectedEvent.question}
                    className={styles.featuredMarketImage}
                    src={selectedEvent.image}
                  />
                ) : (
                  <div className={styles.featuredMarketImageFallback}>Polymarket</div>
                )}
                <h3>{selectedEvent.question}</h3>
                <p className={styles.apiTag}>Event selected. Continue to Step 2 to choose a specific sub-market.</p>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
      {stepRecapModal && stepRecap ? (
        <div className={styles.lessonModalOverlay} role="presentation">
          <section
            aria-labelledby="lesson-recap-title"
            aria-modal="true"
            className={styles.lessonModal}
            role="dialog"
          >
            <button
              aria-label="Close step recap dialog"
              className={styles.lessonModalClose}
              onClick={() => setStepRecapModal(null)}
              type="button"
            >
              X
            </button>
            <p className={styles.lessonModalKicker}>{stepRecap.kicker}</p>
            <h3 id="lesson-recap-title">{stepRecap.title}</h3>
            <details
              className={styles.lessonDisclosure}
              onToggle={(event) => {
                if (event.currentTarget.open) {
                  setLessonSectionsViewed((value) => ({ ...value, insight: true }));
                }
              }}
            >
              <summary className={styles.lessonDisclosureSummary}>API Insight</summary>
              <p className={styles.lessonModalSummary}>{renderInlineCode(stepRecap.summary)}</p>
            </details>
            <details
              className={styles.lessonPoweredBy}
              onToggle={(event) => {
                if (event.currentTarget.open) {
                  setLessonSectionsViewed((value) => ({ ...value, happened: true }));
                }
              }}
            >
              <summary className={styles.lessonDisclosureSummary}>What Happened in This Step</summary>
              <p className={styles.lessonModalPoweredByText}>{renderInlineCode(stepRecap.poweredBy)}</p>
            </details>
            {!canAdvanceFromLessonModal ? <p className={styles.lessonModalUnlockHint}>Open both sections to unlock Next Step.</p> : null}
            <div className={styles.lessonModalActions}>
              <button
                className={styles.lessonModalSecondary}
                onClick={() => setStepRecapModal(null)}
                type="button"
              >
                Review this step
              </button>
              <button
                className={styles.lessonModalPrimary}
                disabled={!canAdvanceFromLessonModal}
                onClick={() => {
                  setActiveStep(stepRecapModal.to);
                  setStepRecapModal(null);
                }}
                type="button"
              >
                Next Step
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isTradeModalOpen && orderResponse ? (
        <div className={styles.tradeModalOverlay} role="presentation">
          <ReactConfetti
            gravity={0.28}
            height={viewport.height}
            numberOfPieces={220}
            recycle={false}
            tweenDuration={12000}
            width={viewport.width}
          />
          <section
            aria-labelledby="trade-complete-title"
            aria-modal="true"
            className={styles.tradeModal}
            role="dialog"
          >
            <button
              aria-label="Close trade completion dialog"
              className={styles.tradeModalClose}
              onClick={() => setIsTradeModalOpen(false)}
              type="button"
            >
              X
            </button>
            <p className={styles.tradeModalKicker}>Tutorial Complete 🎉</p>
            <h3 id="trade-complete-title">Your first trade was submitted successfully! ✅</h3>
            <p className={styles.tradeModalLead}>
              You completed the full EOA flow from discovery to execution.
            </p>
            <div className={styles.tradeModalGrid}>
              <p><strong>Market:</strong> {selectedMarket?.question ?? 'n/a'}</p>
              <p><strong>Outcome:</strong> {selectedOutcomeLabel}</p>
              <p><strong>Status:</strong> {executedStatus}</p>
              <p>
                <strong>Requested Spend:</strong>{' '}
                {lastOrderIntent && Number.isFinite(lastOrderIntent.requestedPusdAmount)
                  ? `${lastOrderIntent.requestedPusdAmount.toFixed(4)} pUSD`
                  : 'n/a'}
              </p>
              <p>
                <strong>Submitted Spend:</strong>{' '}
                {lastOrderIntent && Number.isFinite(lastOrderIntent.submittedPusdAmount)
                  ? `${lastOrderIntent.submittedPusdAmount.toFixed(4)} pUSD`
                  : 'n/a'}
              </p>
              <p>
                <strong>Estimated Shares (at submit):</strong>{' '}
                {lastOrderIntent && Number.isFinite(lastOrderIntent.estimatedShares)
                  ? `${lastOrderIntent.estimatedShares.toFixed(4)} shares @ ${(lastOrderIntent.price * 100).toFixed(2)}c`
                  : 'n/a'}
              </p>
              <p><strong>Matched Shares:</strong> {Number.isFinite(executedShares) ? `${executedShares.toFixed(4)} shares` : 'n/a'}</p>
              <p><strong>Order ID:</strong> {orderId || 'n/a'}</p>
            </div>
            {executedTxHash ? (
              <p className={styles.tradeModalTx}>
                <a href={`https://polygonscan.com/tx/${executedTxHash}`} rel="noreferrer" target="_blank">
                  View transaction on Polygonscan ↗
                </a>
              </p>
            ) : null}
            <div className={styles.tradeModalCta}>
              <div className={styles.tradeModalCtaGrid}>
                <Link className={styles.tradeModalCtaLink} href="/how-i-built-this-app" onClick={() => setIsTradeModalOpen(false)}>
                  <span className={`${styles.tradeModalCtaButton} ${styles.tradeModalPrimaryButton}`}>Start Module 2</span>
                </Link>
                <Link className={styles.tradeModalCtaLink} href="/my-positions" onClick={() => setIsTradeModalOpen(false)}>
                  <span className={`${styles.tradeModalCtaButton} ${styles.tradeModalSecondaryButton}`}>Go To My Positions</span>
                </Link>
              </div>
            </div>
            <details className={styles.tradeModalDetails}>
              <summary>Technical response</summary>
              <pre className={styles.jsonBlock}>{JSON.stringify(orderResponse, null, 2)}</pre>
            </details>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function StepCard({
  step,
  title,
  api,
  apiHref,
  unlocked,
  isOpen,
  onToggle,
  showNextStep,
  canAdvanceStep,
  nextStepHint,
  onNextStep,
  children,
}: {
  step: number;
  title: string;
  api: string;
  apiHref?: string;
  unlocked: boolean;
  isOpen: boolean;
  onToggle: () => void;
  showNextStep?: boolean;
  canAdvanceStep?: boolean;
  nextStepHint?: string;
  onNextStep?: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`${styles.stepCard} ${unlocked ? '' : styles.stepLocked} ${isOpen ? styles.stepOpen : styles.stepCollapsed}`}>
      <div className={styles.stepHeader}>
        <button className={styles.stepHeaderButton} onClick={onToggle} type="button">
          <h3 className={styles.stepTitle}>Step {step}: {title}</h3>
        </button>
        {apiHref ? (
          <a className={styles.apiBadgeLink} href={apiHref} rel="noreferrer" target="_blank">
            <span className={styles.apiBadge}>{api}</span>
            <span aria-hidden="true" className={styles.apiBadgeExternalIcon}>↗</span>
          </a>
        ) : (
          <span className={styles.apiBadge}>{api}</span>
        )}
      </div>
      {!isOpen ? null : unlocked ? (
        <>
          {children}
          {showNextStep ? (
            <section className={styles.rightRailCtaBox}>
              <div>
                <h4 className={styles.rightRailCtaTitle}>Next Step ➡️</h4>
                <p className={styles.rightRailCtaHint}>{nextStepHint}</p>
              </div>
              <button
                className={`${styles.primaryButton} ${styles.nextStepButton}`}
                disabled={!canAdvanceStep}
                onClick={onNextStep}
                type="button"
              >
                Next Step
              </button>
            </section>
          ) : null}
        </>
      ) : (
        <p className={styles.lockedText}>Complete the previous step to unlock this one.</p>
      )}
    </section>
  );
}
