import { ConnectButton } from '@rainbow-me/rainbowkit';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPublicClient, erc20Abi, formatUnits, http } from 'viem';
import { polygon } from 'viem/chains';
import { useAccount, useWalletClient } from 'wagmi';

import { TutorialFlow } from '../components/TutorialFlow';
import styles from '../styles/Home.module.css';

const POLYGON_RPC_URL = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as const;

type PositionSnapshot = {
  title?: string;
  outcome?: string;
  size?: number;
  currentValue?: number;
  icon?: string;
};

const Home: NextPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const balanceAddress = walletClient?.account?.address ?? address;
  const polygonReadClient = useMemo(() => createPublicClient({
    chain: polygon,
    transport: http(POLYGON_RPC_URL),
  }), []);
  const [isUsdcLoading, setIsUsdcLoading] = useState(false);
  const [isUsdcError, setIsUsdcError] = useState(false);
  const [usdcDisplayRaw, setUsdcDisplayRaw] = useState<string | null>(null);
  const [isPositionLoading, setIsPositionLoading] = useState(false);
  const [positionError, setPositionError] = useState(false);
  const [positionCount, setPositionCount] = useState(0);
  const [positionRefreshTick, setPositionRefreshTick] = useState(0);

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
        address: USDC_E_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [balanceAddress],
      })
      .then((raw) => {
        if (!active) return;
        const formatted = formatUnits(raw as bigint, 6);
        setUsdcDisplayRaw(formatted);
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

  useEffect(() => {
    const onTradeExecuted = () => {
      setPositionRefreshTick((value) => value + 1);
    };
    window.addEventListener('polyteacher:trade-executed', onTradeExecuted);
    return () => {
      window.removeEventListener('polyteacher:trade-executed', onTradeExecuted);
    };
  }, []);

  useEffect(() => {
    if (!balanceAddress) {
      setIsPositionLoading(false);
      setPositionError(false);
      setPositionCount(0);
      return;
    }

    let active = true;
    setIsPositionLoading(true);
    setPositionError(false);

    const mapPositions = (positions: PositionSnapshot[]) => {
      setPositionCount(positions.length);
    };

    const fetchVia = async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 120)}`);
      }
      return (await response.json()) as Array<{
        title?: string;
        outcome?: string;
        size?: number;
        currentValue?: number;
        icon?: string;
      }>;
    };

    const proxyUrl = `/api/data/positions?user=${encodeURIComponent(balanceAddress)}&limit=5`;
    const directUrl = `https://data-api.polymarket.com/positions?user=${encodeURIComponent(balanceAddress.toLowerCase())}&limit=5&sortBy=TOKENS&sortDirection=DESC&sizeThreshold=0`;

    void fetchVia(proxyUrl)
      .then((positions) => {
        if (!active) return;
        mapPositions(positions);
      })
      .catch((proxyError) => {
        if (!active) return Promise.resolve();
        console.error('[Sidebar Positions] Proxy fetch failed, trying direct Data API.', { proxyError, balanceAddress });
        return fetchVia(directUrl)
          .then((positions) => {
            if (!active) return;
            mapPositions(positions);
          })
          .catch((directError) => {
            if (!active) return;
            console.error('[Sidebar Positions] Direct fetch failed.', { directError, balanceAddress });
            setPositionError(true);
            setPositionCount(0);
          });
      })
      .finally(() => {
        if (!active) return;
        setIsPositionLoading(false);
      });

    return () => {
      active = false;
    };
  }, [balanceAddress, positionRefreshTick]);

  const usdcDisplay = (() => {
    if (!balanceAddress) return 'Connect wallet';
    if (isUsdcLoading) return 'Loading...';
    if (isUsdcError) return 'Read failed';
    if (!usdcDisplayRaw) return 'Unavailable';
    const value = Number(usdcDisplayRaw);
    if (!Number.isFinite(value)) return usdcDisplayRaw;
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  })();
  const myPositionsCount = balanceAddress && !isPositionLoading && !positionError ? positionCount : 0;

  return (
    <div className={styles.container}>
      <Head>
        <title>PolyTeacher</title>
        <meta
          content="Learn what Polymarket APIs are needed to execute trades in an application, step by step."
          name="description"
        />
        <link
          href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>👨‍🏫</text></svg>"
          rel="icon"
        />
      </Head>

      <div className={styles.appFrame}>
        <header className={styles.topNav}>
          <div className={styles.topNavInner}>
            <div className={styles.topNavLeft}>
              <Link className={styles.topNavBrandLink} href="/">
                <span className={styles.topNavTitle}>PolyTeacher 👨‍🏫</span>
              </Link>
            </div>
            <div className={styles.topNavRight}>
              <div className={styles.topNavBalanceWrap}>
                <div className={`${styles.topNavTab} ${styles.topNavCashTab}`}>
                  <span className={styles.topNavTabText}>Balance</span>
                  <span className={styles.topNavTabValue}>{usdcDisplay}</span>
                </div>
                <span className={styles.topNavBalanceTooltip}>Your USDC.e balance on Polygon</span>
              </div>
              <Link className={styles.topNavTab} href="/my-positions">
                <span className={styles.topNavTabText}>My Positions</span>
                {myPositionsCount > 0 ? (
                  <span className={styles.topNavTabBadge}>{myPositionsCount > 99 ? '99+' : myPositionsCount}</span>
                ) : null}
              </Link>
              <ConnectButton />
            </div>
          </div>
        </header>

        <div className={`${styles.appShell} ${sidebarOpen ? '' : styles.appShellCollapsed}`}>
          <aside className={`${styles.sidebarNav} ${sidebarOpen ? '' : styles.sidebarCollapsed}`}>
            {sidebarOpen ? (
              <>
                <div className={styles.sidebarCourseCard}>
                  <p className={styles.sidebarCourseKicker}>Current Course</p>
                  <h2>Polymarket APIs 101</h2>
                  <p>6 modules • Hands-on developer path</p>
                </div>
                <div className={styles.sidebarModuleList}>
                  <div className={`${styles.sidebarModuleItem} ${styles.sidebarModuleItemActive}`}>
                    <span className={styles.sidebarModuleIndex}>1</span>
                    <div className={styles.sidebarModuleText}>
                      <strong>Place Your First Polymarket Trade</strong>
                      <span>Current module</span>
                    </div>
                  </div>
                  <Link className={`${styles.sidebarModuleItem} ${styles.sidebarModuleItemAvailable}`} href="/how-i-built-this-app">
                    <span className={styles.sidebarModuleIndex}>2</span>
                    <div className={styles.sidebarModuleText}>
                      <strong>How I Built &quot;Place Your First Trade&quot; App</strong>
                      <span>Available now</span>
                    </div>
                  </Link>
                  <div className={`${styles.sidebarModuleItem} ${styles.sidebarModuleItemComingSoon}`}>
                    <span className={styles.sidebarModuleIndex}>3</span>
                    <div className={styles.sidebarModuleText}>
                      <strong>Learn Gamma API</strong>
                      <span>Coming soon</span>
                    </div>
                  </div>
                  <div className={`${styles.sidebarModuleItem} ${styles.sidebarModuleItemComingSoon}`}>
                    <span className={styles.sidebarModuleIndex}>4</span>
                    <div className={styles.sidebarModuleText}>
                      <strong>Learn CLOB API</strong>
                      <span>Coming soon</span>
                    </div>
                  </div>
                  <div className={`${styles.sidebarModuleItem} ${styles.sidebarModuleItemComingSoon}`}>
                    <span className={styles.sidebarModuleIndex}>5</span>
                    <div className={styles.sidebarModuleText}>
                      <strong>Learn Data API</strong>
                      <span>Coming soon</span>
                    </div>
                  </div>
                  <div className={`${styles.sidebarModuleItem} ${styles.sidebarModuleItemComingSoon}`}>
                    <span className={styles.sidebarModuleIndex}>6</span>
                    <div className={styles.sidebarModuleText}>
                      <strong>Polymarket APIs Quiz</strong>
                      <span>Coming soon</span>
                    </div>
                  </div>
                </div>
                <div className={styles.sidebarFooter}>
                  <button
                    aria-label="Hide left navbar"
                    className={styles.sidebarNavToggle}
                    onClick={() => setSidebarOpen(false)}
                    type="button"
                  >
                    Hide Navbar
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.sidebarFooter}>
                <button
                  aria-label="Show left navbar"
                  className={styles.sidebarNavToggle}
                  onClick={() => setSidebarOpen(true)}
                  type="button"
                >
                  {'>'}
                </button>
              </div>
            )}
          </aside>

          <div className={styles.pageBody}>
            <main className={styles.main} id="tutorial-root">
              <TutorialFlow />
            </main>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
