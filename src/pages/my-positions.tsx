import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Side } from '@polymarket/clob-client-v2';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPublicClient, erc20Abi, formatUnits, http } from 'viem';
import { polygon } from 'viem/chains';
import { useAccount, useWalletClient } from 'wagmi';

import { POLYMARKET_CONTRACTS, createL1Client, createL2Client, getOrderBook, getPrice } from '../lib/clob';
import homeStyles from '../styles/Home.module.css';
import styles from '../styles/MyPositions.module.css';

const POLYGON_RPC_URL = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';
const COLLATERAL_ADDRESS = POLYMARKET_CONTRACTS.collateral as `0x${string}`;

type PositionSnapshot = {
  title: string;
  outcome: string;
  size: number;
  currentValue: number;
  icon: string;
  tokenId: string;
};
type VenueBadge = 'v1' | 'v2' | 'unknown';

const POLL_INTERVAL_MS = 30_000;

const MyPositionsPage: NextPage = () => {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const balanceAddress = walletClient?.account?.address ?? address;
  const polygonReadClient = useMemo(
    () =>
      createPublicClient({
        chain: polygon,
        transport: http(POLYGON_RPC_URL),
      }),
    [],
  );

  const [isUsdcLoading, setIsUsdcLoading] = useState(false);
  const [isUsdcError, setIsUsdcError] = useState(false);
  const [usdcDisplayRaw, setUsdcDisplayRaw] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [positions, setPositions] = useState<PositionSnapshot[]>([]);
  const [venueByTokenId, setVenueByTokenId] = useState<Record<string, VenueBadge>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [creds, setCreds] = useState<{ key: string; secret: string; passphrase: string } | null>(null);
  const [sellingKey, setSellingKey] = useState('');
  const [sellMessageByKey, setSellMessageByKey] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!balanceAddress) {
      setIsUsdcLoading(false);
      setIsUsdcError(false);
      setUsdcDisplayRaw(null);
      return;
    }

    let active = true;
    setIsUsdcLoading(true);
    setIsUsdcError(false);
    void polygonReadClient
      .readContract({
        address: COLLATERAL_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [balanceAddress],
      })
      .then((raw) => {
        if (!active) return;
        setUsdcDisplayRaw(formatUnits(raw as bigint, 6));
      })
      .catch(() => {
        if (!active) return;
        setIsUsdcError(true);
        setUsdcDisplayRaw(null);
      })
      .finally(() => {
        if (!active) return;
        setIsUsdcLoading(false);
      });

    return () => {
      active = false;
    };
  }, [balanceAddress, polygonReadClient]);

  const fetchPositions = useCallback(async () => {
    if (!balanceAddress) {
      setIsLoading(false);
      setIsError(false);
      setPositions([]);
      setLastUpdated(null);
      return;
    }

    setIsLoading(true);
    setIsError(false);
    const pageSize = 25;
    const proxyBase = `/api/data/positions?user=${encodeURIComponent(balanceAddress)}&limit=${pageSize}`;
    const directBase = `https://data-api.polymarket.com/positions?user=${encodeURIComponent(balanceAddress.toLowerCase())}&limit=${pageSize}&sortBy=TOKENS&sortDirection=DESC&sizeThreshold=0`;
    const startedAt = Date.now();
    console.log('[My Positions] Starting fetch cycle.', {
      balanceAddress,
      proxyBase,
      directBase,
    });

    const fetchVia = async (url: string) => {
      const response = await fetch(url);
      console.log('[My Positions] Fetch response received.', {
        url,
        ok: response.ok,
        status: response.status,
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 120)}`);
      }
      const payload = (await response.json()) as Array<{
        title?: string;
        outcome?: string;
        size?: number;
        currentValue?: number;
        icon?: string;
        asset?: string | number;
        tokenId?: string | number;
        tokenID?: string | number;
        clobTokenId?: string | number;
        clob_token_id?: string | number;
      }>;
      console.log('[My Positions] Parsed payload sample.', {
        url,
        count: Array.isArray(payload) ? payload.length : -1,
        first: Array.isArray(payload) && payload.length > 0
          ? {
            title: payload[0].title,
            outcome: payload[0].outcome,
            size: payload[0].size,
            currentValue: payload[0].currentValue,
            tokenId: payload[0].tokenId ?? payload[0].tokenID ?? payload[0].asset,
          }
          : null,
      });
      return payload;
    };

    const fetchAllPages = async (baseUrl: string) => {
      const combined: Array<{
        title?: string;
        outcome?: string;
        size?: number;
        currentValue?: number;
        icon?: string;
        asset?: string | number;
        tokenId?: string | number;
        tokenID?: string | number;
        clobTokenId?: string | number;
        clob_token_id?: string | number;
      }> = [];
      let offset = 0;
      for (let page = 0; page < 200; page += 1) {
        const separator = baseUrl.includes('?') ? '&' : '?';
        const pageUrl = `${baseUrl}${separator}offset=${offset}`;
        const rows = await fetchVia(pageUrl);
        combined.push(...rows);
        if (rows.length < pageSize) break;
        offset += pageSize;
      }
      return combined;
    };

    try {
      let results: Array<{
        title?: string;
        outcome?: string;
        size?: number;
        currentValue?: number;
        icon?: string;
        asset?: string | number;
        tokenId?: string | number;
        tokenID?: string | number;
        clobTokenId?: string | number;
        clob_token_id?: string | number;
      }> = [];
      try {
        results = await fetchAllPages(proxyBase);
      } catch (proxyError) {
        console.error('[My Positions] Proxy fetch failed, trying direct Data API.', { proxyError, balanceAddress });
        results = await fetchAllPages(directBase);
      }
      console.log('[My Positions] Mapping position results.', {
        rawCount: results.length,
        elapsedMs: Date.now() - startedAt,
      });
      setPositions(
        results.map((position) => ({
          title: position.title ?? 'Untitled position',
          outcome: position.outcome ?? 'n/a',
          size: Number(position.size ?? 0),
          currentValue: Number(position.currentValue ?? 0),
          icon: position.icon ?? '',
          tokenId: String(
            position.asset ??
              position.tokenId ??
              position.tokenID ??
              position.clobTokenId ??
              position.clob_token_id ??
              '',
          ),
        })),
      );
      setLastUpdated(new Date());
      console.log('[My Positions] Position state updated.', {
        mappedCount: results.length,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      console.error('[My Positions] Position polling failed.', { error, balanceAddress });
      setPositions([]);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [balanceAddress]);

  useEffect(() => {
    let cancelled = false;
    void fetchPositions().catch(() => {
      if (!cancelled) setIsError(true);
    });
    const timer = setInterval(() => {
      void fetchPositions();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fetchPositions]);

  const sellAtMarketPrice = useCallback(
    async (position: PositionSnapshot, cardKey: string) => {
      if (!walletClient) {
        setSellMessageByKey((previous) => ({ ...previous, [cardKey]: 'Connect wallet to sell this position.' }));
        return;
      }
      if (!position.tokenId) {
        setSellMessageByKey((previous) => ({
          ...previous,
          [cardKey]: 'Sell unavailable: missing token id for this position.',
        }));
        return;
      }
      if (position.size <= 0) {
        setSellMessageByKey((previous) => ({ ...previous, [cardKey]: 'Nothing to sell: position size is zero.' }));
        return;
      }

      setSellingKey(cardKey);
      setSellMessageByKey((previous) => ({ ...previous, [cardKey]: '' }));
      try {
        const activeCreds = creds ?? (await createL1Client(walletClient).createOrDeriveApiKey());
        if (!creds) {
          setCreds(activeCreds);
        }
        const quote = await getPrice(position.tokenId, 'SELL');
        const sellPrice = Number(quote.price ?? 0);
        if (!Number.isFinite(sellPrice) || sellPrice <= 0) {
          throw new Error('No valid market sell price available right now.');
        }

        const l2Client = createL2Client(walletClient, activeCreds);
        const result = await l2Client.createAndPostOrder({
          tokenID: position.tokenId,
          side: Side.SELL,
          price: sellPrice,
          size: position.size,
        });

        const responseError = String((result as { error?: unknown }).error ?? '');
        const responseStatus = Number((result as { status?: unknown }).status ?? 0);
        const responseSuccess = (result as { success?: unknown }).success;
        const hasFailure = Boolean(responseError) || responseStatus >= 400 || responseSuccess === false;
        if (hasFailure) {
          throw new Error(responseError || 'Sell order was rejected by CLOB.');
        }

        setSellMessageByKey((previous) => ({
          ...previous,
          [cardKey]: 'Sell order submitted. Position list will refresh shortly.',
        }));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('polyteacher:trade-executed', { detail: { orderId: result.orderID ?? result.orderId } }));
        }
        void fetchPositions();
      } catch (error) {
        setSellMessageByKey((previous) => ({
          ...previous,
          [cardKey]: `Sell failed: ${String(error)}`,
        }));
      } finally {
        setSellingKey('');
      }
    },
    [walletClient, creds, fetchPositions],
  );

  useEffect(() => {
    const onTradeExecuted = () => {
      console.log('[My Positions] Received trade executed event. Triggering refresh.', {
        balanceAddress,
      });
      void fetchPositions();
    };
    window.addEventListener('polyteacher:trade-executed', onTradeExecuted);
    return () => {
      window.removeEventListener('polyteacher:trade-executed', onTradeExecuted);
    };
  }, [fetchPositions, balanceAddress]);

  useEffect(() => {
    const uniqueTokenIds = Array.from(new Set(positions.map((position) => position.tokenId).filter((tokenId) => tokenId.length > 0)));
    if (uniqueTokenIds.length === 0) {
      setVenueByTokenId({});
      return;
    }

    let active = true;
    void (async () => {
      const entries = await Promise.all(
        uniqueTokenIds.map(async (tokenId) => {
          try {
            const [v2Book, legacyBook] = await Promise.all([
              getOrderBook(tokenId, 'v2'),
              getOrderBook(tokenId, 'legacy'),
            ]);
            const v2HasLiquidity = (v2Book.bids?.length ?? 0) > 0 || (v2Book.asks?.length ?? 0) > 0;
            const legacyHasLiquidity = (legacyBook.bids?.length ?? 0) > 0 || (legacyBook.asks?.length ?? 0) > 0;
            const venue: VenueBadge = v2HasLiquidity ? 'v2' : legacyHasLiquidity ? 'v1' : 'unknown';
            return [tokenId, venue] as const;
          } catch (error) {
            console.warn('[My Positions] Venue probe failed.', { tokenId, error: String(error) });
            return [tokenId, 'unknown' as const] as const;
          }
        }),
      );
      if (!active) return;
      setVenueByTokenId(Object.fromEntries(entries));
    })();

    return () => {
      active = false;
    };
  }, [positions]);

  const usdcDisplay = (() => {
    if (!balanceAddress) return 'Connect wallet';
    if (isUsdcLoading) return 'Loading...';
    if (isUsdcError) return 'Read failed';
    if (!usdcDisplayRaw) return 'Unavailable';
    const value = Number(usdcDisplayRaw);
    if (!Number.isFinite(value)) return usdcDisplayRaw;
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  })();
  const myPositionsCount = balanceAddress ? positions.length : 0;

  return (
    <div className={homeStyles.container}>
      <Head>
        <title>PolyTeacher</title>
        <link
          href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>👨‍🏫</text></svg>"
          rel="icon"
        />
      </Head>

      <div className={homeStyles.appFrame}>
        <header className={homeStyles.topNav}>
          <div className={homeStyles.topNavInner}>
            <div className={homeStyles.topNavLeft}>
              <Link className={homeStyles.topNavBrandLink} href="/">
                <span className={homeStyles.topNavTitle}>PolyTeacher 👨‍🏫</span>
              </Link>
            </div>
            <div className={homeStyles.topNavRight}>
              <a className={homeStyles.topNavTab} href="https://www.polywrap.fun/" rel="noreferrer noopener" target="_blank">
                <span className={homeStyles.topNavTabText}>pUSD Wrapper ↗</span>
              </a>
              <div className={homeStyles.topNavBalanceWrap}>
                <div className={`${homeStyles.topNavTab} ${homeStyles.topNavCashTab}`}>
                  <span className={homeStyles.topNavTabText}>Balance</span>
                  <span className={homeStyles.topNavTabValue}>{usdcDisplay}</span>
                </div>
                <span className={homeStyles.topNavBalanceTooltip}>Your pUSD balance on Polygon</span>
              </div>
              <Link className={`${homeStyles.topNavTab} ${homeStyles.topNavTabActive}`} href="/my-positions">
                <span className={homeStyles.topNavTabText}>My Positions</span>
                {myPositionsCount > 0 ? (
                  <span className={homeStyles.topNavTabBadge}>{myPositionsCount > 99 ? '99+' : myPositionsCount}</span>
                ) : null}
              </Link>
              <ConnectButton />
            </div>
          </div>
        </header>

        <div className={styles.page}>
          <main className={styles.mainCard}>
            <div className={styles.headerRow}>
              <div>
                <h1>My Positions 📊</h1>
                <p className={styles.subtext}>
                  Polling every {POLL_INTERVAL_MS / 1000}s
                  {lastUpdated ? ` • last updated ${lastUpdated.toLocaleTimeString()}` : ''}
                </p>
              </div>
            </div>

            {!balanceAddress ? <p className={styles.emptyState}>Connect your wallet to view positions. 👛</p> : null}
            {balanceAddress && isLoading ? <p className={styles.emptyState}>Loading positions... ⏳</p> : null}
            {balanceAddress && !isLoading && isError ? <p className={styles.emptyState}>Could not read positions right now. ⚠️</p> : null}
            {balanceAddress && !isLoading && !isError && positions.length === 0 ? (
              <p className={styles.emptyState}>Follow the tutorial to make a trade! 🚀</p>
            ) : null}

            {balanceAddress && !isLoading && !isError && positions.length > 0 ? (
              <section className={styles.grid}>
                {positions.map((position, index) => (
                  <article className={styles.card} key={`${position.title}-${index}`}>
                    {position.icon ? (
                      <img alt={position.title} className={styles.cardImage} src={position.icon} />
                    ) : (
                      <div className={styles.cardImageFallback}>PM</div>
                    )}
                    <p className={styles.cardTitle}>{position.title}</p>
                    <p className={styles.cardMeta}>
                      <span
                        className={`${homeStyles.outcomeBadge} ${position.outcome.toLowerCase().includes('yes') ? homeStyles.outcomeBadgeYes : homeStyles.outcomeBadgeNo}`}
                      >
                        {position.outcome.toUpperCase()}
                      </span>{' '}
                      <span
                        className={`${styles.venueBadge} ${
                          venueByTokenId[position.tokenId] === 'v2'
                            ? styles.venueBadgeV2
                            : venueByTokenId[position.tokenId] === 'v1'
                              ? styles.venueBadgeV1
                              : styles.venueBadgeUnknown
                        }`}
                        data-help={
                          venueByTokenId[position.tokenId] === 'v2'
                            ? 'This token currently shows active orderbook liquidity on CLOB V2 (pUSD).'
                            : venueByTokenId[position.tokenId] === 'v1'
                              ? 'This token currently shows active orderbook liquidity on legacy CLOB (USDC.e), not V2.'
                              : 'No active orderbook liquidity was detected on either CLOB version at this check.'
                        }
                        tabIndex={0}
                        title={
                          venueByTokenId[position.tokenId] === 'v2'
                            ? 'This token currently shows active orderbook liquidity on CLOB V2 (pUSD).'
                            : venueByTokenId[position.tokenId] === 'v1'
                              ? 'This token currently shows active orderbook liquidity on legacy CLOB (USDC.e), not V2.'
                              : 'No active orderbook liquidity was detected on either CLOB version at this check.'
                        }
                      >
                        {(venueByTokenId[position.tokenId] ?? 'unknown').toUpperCase()}
                      </span>{' '}
                      | {position.size.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                    </p>
                    <p className={styles.cardMeta}>
                      Value ${position.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <button
                      className={styles.sellCta}
                      disabled={sellingKey === `${position.title}-${index}`}
                      onClick={() => void sellAtMarketPrice(position, `${position.title}-${index}`)}
                      type="button"
                    >
                      {sellingKey === `${position.title}-${index}` ? 'Selling...' : 'Sell at Market Price'}
                    </button>
                    {sellMessageByKey[`${position.title}-${index}`] ? (
                      <p className={styles.sellMeta}>{sellMessageByKey[`${position.title}-${index}`]}</p>
                    ) : null}
                  </article>
                ))}
              </section>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
};

export default MyPositionsPage;
