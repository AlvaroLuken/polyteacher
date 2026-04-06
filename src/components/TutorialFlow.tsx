import { AssetType, Side } from '@polymarket/clob-client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createPublicClient, erc20Abi, http, maxUint256 } from 'viem';
import { polygon } from 'viem/chains';
import { useAccount, useWalletClient, useWriteContract } from 'wagmi';

import { createL1Client, createL2Client, getOrderBook } from '../lib/clob';
import { fetchEventMarketsBySlug, fetchSpecificTutorialMarkets, getMarket } from '../lib/gamma';
import type { Market, OrderBook } from '../types/polymarket';
import styles from '../styles/Home.module.css';

type Credentials = { key: string; secret: string; passphrase: string };
const POLYGON_CHAIN_ID = 137;
const POLYGON_RPC_URL = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const CLOB_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_EXCHANGE_ADDRESS = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const NEG_RISK_ADAPTER_ADDRESS = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';
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
      'CLOB intent is API-based, but settlement is contract-based. Before execution, exchange contracts must have token permissions on-chain: USDC.e allowances for buys and conditional-token approvals for sells.',
    poweredBy:
      'The key protocol checks in this phase are allowance readiness and execution validity. If permissions are missing, orders fail with balance/allowance errors. This is why production trading flows treat approvals and post-approval verification as first-class prerequisites.',
  },
} as const;
const ReactConfetti = dynamic(() => import('react-confetti'), { ssr: false });

export function TutorialFlow() {
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
  const [allowanceHash, setAllowanceHash] = useState<string>('');
  const [allowanceReady, setAllowanceReady] = useState(false);
  const [isSettingAllowance, setIsSettingAllowance] = useState(false);
  const [allowanceProgress, setAllowanceProgress] = useState('');
  const [allowanceTxs, setAllowanceTxs] = useState<Array<{ label: string; hash: string }>>([]);
  const [tradeAmountUsdc, setTradeAmountUsdc] = useState('10');
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
  const executedUsdc = Number(orderResponse?.makingAmount ?? Number.NaN);
  const executedShares = Number(orderResponse?.takingAmount ?? Number.NaN);
  const executedTxHash =
    Array.isArray(orderResponse?.transactionsHashes) && typeof orderResponse.transactionsHashes[0] === 'string'
      ? orderResponse.transactionsHashes[0]
      : '';
  const selectedMarketId = selectedMarket?.id ?? '';
  const yesCents = toCentLabel(selectedMarket?.outcomePrices?.[0]);
  const noCents = toCentLabel(selectedMarket?.outcomePrices?.[1]);
  const eventMarketOptions = useMemo(
    () =>
      [...eventMarkets]
        .sort((a, b) => toProbabilityValue(b) - toProbabilityValue(a))
        .slice(0, 5),
    [eventMarkets],
  );
  const lastFocusedPollLabel = lastFocusedPollAt
    ? lastFocusedPollAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Waiting for first refresh...';
  const selectedOutcomeIndex = selectedMarket
    ? selectedMarket.outcomes.findIndex((outcome) => outcome.toLowerCase() === selectedOutcome)
    : -1;
  const selectedOutcomeLabel = selectedOutcome ? selectedOutcome.toUpperCase() : 'Select Yes/No';
  const marketOrderPrice =
    Number(orderBook?.asks?.[0]?.price ?? 0) ||
    Number(selectedMarket?.outcomePrices?.[selectedOutcomeIndex] ?? 0) ||
    0;
  const estimatedShares = marketOrderPrice > 0 ? numericUsdcAmount / marketOrderPrice : 0;
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
        : 'To complete Step 3, explicitly select either a YES or NO outcome.';
    }
    if (activeStep === 4) {
      return canAdvanceStep
        ? 'Allowances set. Continue to Step 5.'
        : 'To complete Step 4, set allowances for the Polymarket contracts.';
    }
    if (activeStep === 5) {
      return canAdvanceStep
        ? 'Order placed. Continue to Step 6.'
        : 'To complete Step 5, enter the amount of USDC.e you want to spend and click "Place Order".';
    }
    return '';
  })();
  const selectedEvent = markets.find(
    (market) => (market.eventSlug ?? fallbackEventSlugFromTitle(market.question)) === selectedEventSlug,
  );
  const stepRecap = stepRecapModal ? STEP_RECAPS[stepRecapModal.from] : null;
  const canAdvanceFromLessonModal = lessonSectionsViewed.insight && lessonSectionsViewed.happened;

  const onNextStepClick = () => {
    if (!canAdvanceStep || activeStep > 4) return;
    setLessonSectionsViewed({ insight: false, happened: false });
    setStepRecapModal({ from: activeStep as 1 | 2 | 3 | 4, to: nextStepNumber });
  };

  const refreshSpecificMarkets = useCallback(async () => {
    const result = await fetchSpecificTutorialMarkets();
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
  }, []);

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
    if (!selectedMarket || !activeTokenId) return;
    void getOrderBook(activeTokenId).then(setOrderBook);
  }, [selectedMarket, activeTokenId]);

  useEffect(() => {
    if (!selectedEventSlug) {
      setEventMarkets([]);
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
  }, [selectedEventSlug]);

  const checkAllowances = useCallback(async () => {
    if (!address) {
      return false;
    }
    const [usdcToExchange, usdcToNegRisk, usdcToAdapter, ctfToExchange, ctfToNegRisk, ctfToAdapter] = await Promise.all([
      polygonReadClient.readContract({
        address: USDC_E_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, CLOB_EXCHANGE_ADDRESS],
      }) as Promise<bigint>,
      polygonReadClient.readContract({
        address: USDC_E_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, NEG_RISK_EXCHANGE_ADDRESS],
      }) as Promise<bigint>,
      polygonReadClient.readContract({
        address: USDC_E_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, NEG_RISK_ADAPTER_ADDRESS],
      }) as Promise<bigint>,
      polygonReadClient.readContract({
        address: CTF_ADDRESS,
        abi: ERC1155_ABI,
        functionName: 'isApprovedForAll',
        args: [address, CLOB_EXCHANGE_ADDRESS],
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

    const allReady =
      usdcToExchange > BigInt(0) &&
      usdcToNegRisk > BigInt(0) &&
      usdcToAdapter > BigInt(0) &&
      ctfToExchange &&
      ctfToNegRisk &&
      ctfToAdapter;
    console.log('[TutorialFlow][Step5] Allowance check complete.', { allReady });
    return allReady;
  }, [polygonReadClient, address]);

  useEffect(() => {
    if (!walletClient || !creds || !unlocked.step4) return;
    void (async () => {
      try {
        const ready = await checkAllowances();
        setAllowanceReady(ready);
        setAllowanceNote(ready ? '✓ All allowances set' : "Click 'Set Allowances' to approve Polymarket contracts.");
      } catch (error) {
        console.error('[TutorialFlow][Step5] Allowance check failed.', { error });
        setAllowanceReady(false);
        setAllowanceNote(`Allowance failed: ${String(error)}`);
      }
    })();
  }, [walletClient, creds, unlocked.step4, checkAllowances]);

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
    if (!walletClient || !creds || !activeTokenId || marketOrderPrice <= 0 || estimatedShares <= 0) return;
    try {
      setOrderError('');
      setOrderErrorDetails('');
      const l2Client = createL2Client(walletClient, creds);
      const result = await l2Client.createAndPostOrder({
        tokenID: activeTokenId,
        side: Side.BUY,
        price: marketOrderPrice,
        size: estimatedShares,
      });

      const responseError = String((result as { error?: unknown }).error ?? '');
      const responseStatus = Number((result as { status?: unknown }).status ?? 0);
      const responseSuccess = (result as { success?: unknown }).success;
      const hasFailure = Boolean(responseError) || responseStatus >= 400 || responseSuccess === false;

      if (hasFailure) {
        const normalized = responseError.toLowerCase();
        const pretty =
          normalized.includes('not enough balance') || normalized.includes('allowance')
            ? 'Not enough USDC.e balance or allowance for this trade amount. Try a smaller amount or add funds.'
            : 'Trade could not be executed. Please try again with a smaller amount.';
        setOrderResponse(null);
        setIsTradeModalOpen(false);
        setOrderError(pretty);
        setOrderErrorDetails(JSON.stringify(result, null, 2));
        return;
      }

      setOrderResponse(result);
      setIsTradeModalOpen(true);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('polyteacher:trade-executed', { detail: { orderId: result.orderID ?? result.orderId } }));
      }
    } catch (error) {
      const raw = String(error);
      const normalized = raw.toLowerCase();
      const pretty =
        normalized.includes('not enough balance') || normalized.includes('allowance')
          ? 'Not enough USDC.e balance or allowance for this trade amount. Try a smaller amount or add funds.'
          : 'Trade failed before submission. Please retry.';
      setOrderResponse(null);
      setIsTradeModalOpen(false);
      setOrderError(pretty);
      setOrderErrorDetails(raw);
    }
  };

  return (
    <div className={styles.tutorialFlow}>
      <div className={`${styles.tutorialSplit} ${selectedEventSlug ? styles.tutorialSplitWithFocus : styles.tutorialSplitSingle}`}>
        <div className={styles.stepRail}>
          <p className={styles.moduleLead}>
            <b>Module 1.1: Place Your First Polymarket Trade 🚀</b>. <br /> Go through an interactive flow to learn what Polymarket APIs are needed to execute trades in an application, step by step.
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
              . This step fetches three specific tutorial events by slug and shows only their titles.
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
            <p>Events contain grouped sub-markets. Pick any market in this event to continue.</p>
            <div className={styles.stepResult}>
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
              {eventMarketOptions.length === 0 ? (
                <p className={styles.lockedText}>No active sub-markets available for this event right now.</p>
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
                      const c = await createL1Client(walletClient).createOrDeriveApiKey();
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
            title="Set Token Allowances"
            api="On-chain approval transaction"
            apiHref={DOCS_LINKS.onchainOrderInfo}
            unlocked={unlocked.step4}
            isOpen={activeStep === 4}
            onToggle={() => setActiveStep(4)}
            showNextStep={activeStep === 4 && hasNextStep}
            canAdvanceStep={canAdvanceStep}
            nextStepHint={nextStepHint}
            onNextStep={onNextStepClick}
          >
            <p>Before trading, approve the exchange to spend USDC.e. This is a one-time DEX approval on Polygon.</p>
            <p><strong>Note:</strong> You need USDC.e on Polygon to complete this step onchain.</p>
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

                    const alreadyReady = await checkAllowances();
                    if (alreadyReady) {
                      setAllowanceReady(true);
                      setAllowanceNote('✓ All allowances set');
                      return;
                    }

                    const approvals = [
                      {
                        label: 'USDC.e → Exchange',
                        run: async () =>
                          writeContractAsync({
                            address: USDC_E_ADDRESS,
                            abi: erc20Abi,
                            functionName: 'approve',
                            args: [CLOB_EXCHANGE_ADDRESS, maxUint256],
                            chain: polygon,
                          }),
                      },
                      {
                        label: 'CTF → Exchange',
                        run: async () =>
                          writeContractAsync({
                            address: CTF_ADDRESS,
                            abi: ERC1155_ABI,
                            functionName: 'setApprovalForAll',
                            args: [CLOB_EXCHANGE_ADDRESS, true],
                            chain: polygon,
                          }),
                      },
                      {
                        label: 'USDC.e → Neg-Risk Exchange',
                        run: async () =>
                          writeContractAsync({
                            address: USDC_E_ADDRESS,
                            abi: erc20Abi,
                            functionName: 'approve',
                            args: [NEG_RISK_EXCHANGE_ADDRESS, maxUint256],
                            chain: polygon,
                          }),
                      },
                      {
                        label: 'CTF → Neg-Risk Exchange',
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
                        label: 'USDC.e → Neg-Risk Adapter',
                        run: async () =>
                          writeContractAsync({
                            address: USDC_E_ADDRESS,
                            abi: erc20Abi,
                            functionName: 'approve',
                            args: [NEG_RISK_ADAPTER_ADDRESS, maxUint256],
                            chain: polygon,
                          }),
                      },
                      {
                        label: 'CTF → Neg-Risk Adapter',
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
                      setAllowanceProgress(`Approval ${i + 1}/6: ${current.label}`);
                      const hash = await current.run();
                      setAllowanceHash(hash);
                      setAllowanceTxs((previous) => [...previous, { label: current.label, hash }]);
                      await polygonReadClient.waitForTransactionReceipt({
                        hash,
                        pollingInterval: 2000,
                        timeout: 180_000,
                      });
                    }

                    const confirmed = await checkAllowances();
                    setAllowanceReady(confirmed);
                    setAllowanceProgress(confirmed ? 'All approvals completed (6/6).' : '');
                    setAllowanceNote(confirmed ? '✓ All allowances set' : 'Allowance failed: verification check did not pass.');
                  } catch (error) {
                    console.error('[TutorialFlow][Step5] Allowance update failed.', { error });
                    setAllowanceReady(false);
                    setAllowanceProgress('');
                    setAllowanceNote(`Allowance failed: ${String(error)}`);
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
            <p>{allowanceNote}</p>
            {allowanceProgress ? <p className={styles.pollingText}>{allowanceProgress}</p> : null}
            {allowanceTxs.map((tx) => (
              <p key={tx.hash}>
                <strong>{tx.label}:</strong>{' '}
                <a href={`https://polygonscan.com/tx/${tx.hash}`} rel="noreferrer" target="_blank">
                  {tx.hash}
                </a>
              </p>
            ))}
            {allowanceHash ? <a href={`https://polygonscan.com/tx/${allowanceHash}`} rel="noreferrer" target="_blank">View transaction on Polygonscan</a> : null}
          </StepCard>

          <StepCard
            step={5}
            title="Place Your First Order"
            api="CLOB API — createAndPostOrder()"
            apiHref={DOCS_LINKS.createOrder}
            unlocked={unlocked.step5}
            isOpen={activeStep === 5}
            onToggle={() => setActiveStep(5)}
            showNextStep={activeStep === 5 && hasNextStep}
            canAdvanceStep={canAdvanceStep}
            nextStepHint={nextStepHint}
            onNextStep={onNextStepClick}
          >
            <p>Enter how much USDC.e you want to spend. We convert that amount into shares automatically at the live market price.</p>
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
                <span className={styles.amountCurrency}>USDC.e</span>
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
            </div>
            <p><strong>Estimated shares:</strong> {estimatedShares > 0 ? estimatedShares.toFixed(4) : 'n/a'} (based on current price)</p>
            <button
              className={styles.primaryButton}
              disabled={marketOrderPrice <= 0 || numericUsdcAmount <= 0}
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
                      <button
                        className={
                          selectedOutcome === null
                            ? styles.outcomeButton
                            : selectedOutcome === 'yes'
                              ? styles.outcomeYesActive
                              : styles.outcomeYesPassive
                        }
                        onClick={() => setSelectedOutcome('yes')}
                        type="button"
                      >
                        Yes {yesCents}
                      </button>
                      <button
                        className={
                          selectedOutcome === null
                            ? styles.outcomeButton
                            : selectedOutcome === 'no'
                              ? styles.outcomeNoActive
                              : styles.outcomeNoPassive
                        }
                        onClick={() => setSelectedOutcome('no')}
                        type="button"
                      >
                        No {noCents}
                      </button>
                    </div>
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
              <p><strong>Filled:</strong> {Number.isFinite(executedShares) ? `${executedShares.toFixed(4)} shares` : 'n/a'}</p>
              <p><strong>Spent:</strong> {Number.isFinite(executedUsdc) ? `${executedUsdc.toFixed(4)} USDC.e` : 'n/a'}</p>
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
