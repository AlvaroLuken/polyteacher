import { ConnectButton } from '@rainbow-me/rainbowkit';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPublicClient, erc20Abi, formatUnits, http } from 'viem';
import { polygon } from 'viem/chains';
import { useAccount, useWalletClient } from 'wagmi';

import styles from '../styles/HowIBuilt.module.css';
import homeStyles from '../styles/Home.module.css';

const POLYGON_RPC_URL = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as const;

const HowIBuiltThisApp: NextPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
  const [positionCount, setPositionCount] = useState(0);

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

  useEffect(() => {
    if (!balanceAddress) {
      setPositionCount(0);
      return;
    }

    let active = true;
    const proxyUrl = `/api/data/positions?user=${encodeURIComponent(balanceAddress)}&limit=25`;
    const directUrl = `https://data-api.polymarket.com/positions?user=${encodeURIComponent(balanceAddress.toLowerCase())}&limit=25&sortBy=TOKENS&sortDirection=DESC&sizeThreshold=0`;

    const fetchVia = async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 120)}`);
      }
      return (await response.json()) as unknown[];
    };

    void fetchVia(proxyUrl)
      .then((positions) => {
        if (!active) return;
        setPositionCount(Array.isArray(positions) ? positions.length : 0);
      })
      .catch(() =>
        fetchVia(directUrl)
          .then((positions) => {
            if (!active) return;
            setPositionCount(Array.isArray(positions) ? positions.length : 0);
          })
          .catch(() => {
            if (!active) return;
            setPositionCount(0);
          }),
      );

    return () => {
      active = false;
    };
  }, [balanceAddress]);

  const usdcDisplay = (() => {
    if (!balanceAddress) return 'Connect wallet';
    if (isUsdcLoading) return 'Loading...';
    if (isUsdcError) return 'Read failed';
    if (!usdcDisplayRaw) return 'Unavailable';
    const value = Number(usdcDisplayRaw);
    if (!Number.isFinite(value)) return usdcDisplayRaw;
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  })();
  const myPositionsCount = balanceAddress ? positionCount : 0;

  return (
    <div className={homeStyles.container}>
      <Head>
        <title>PolyTeacher</title>
        <meta
          content="A behind-the-scenes walkthrough of building PolyTeacher, an educational Polymarket trading tutorial app."
          name="description"
        />
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
              <div className={homeStyles.topNavBalanceWrap}>
                <div className={`${homeStyles.topNavTab} ${homeStyles.topNavCashTab}`}>
                  <span className={homeStyles.topNavTabText}>Balance</span>
                  <span className={homeStyles.topNavTabValue}>{usdcDisplay}</span>
                </div>
                <span className={homeStyles.topNavBalanceTooltip}>Your USDC.e balance on Polygon</span>
              </div>
              <Link className={homeStyles.topNavTab} href="/my-positions">
                <span className={homeStyles.topNavTabText}>My Positions</span>
                {myPositionsCount > 0 ? (
                  <span className={homeStyles.topNavTabBadge}>{myPositionsCount > 99 ? '99+' : myPositionsCount}</span>
                ) : null}
              </Link>
              <ConnectButton />
            </div>
          </div>
        </header>

        <div className={`${homeStyles.appShell} ${sidebarOpen ? '' : homeStyles.appShellCollapsed}`}>
          <aside className={`${homeStyles.sidebarNav} ${sidebarOpen ? '' : homeStyles.sidebarCollapsed}`}>
            {sidebarOpen ? (
              <>
                <div className={homeStyles.sidebarCourseCard}>
                  <p className={homeStyles.sidebarCourseKicker}>Current Course</p>
                  <h2>Polymarket APIs 101</h2>
                  <p>6 modules • Hands-on developer path</p>
                </div>
                <div className={homeStyles.sidebarModuleList}>
                  <Link className={`${homeStyles.sidebarModuleItem} ${homeStyles.sidebarModuleItemAvailable}`} href="/">
                    <span className={homeStyles.sidebarModuleIndex}>1</span>
                    <div className={homeStyles.sidebarModuleText}>
                      <strong>Place Your First Polymarket Trade</strong>
                      <span>Available now</span>
                    </div>
                  </Link>
                  <div className={`${homeStyles.sidebarModuleItem} ${homeStyles.sidebarModuleItemActive}`}>
                    <span className={homeStyles.sidebarModuleIndex}>2</span>
                    <div className={homeStyles.sidebarModuleText}>
                      <strong>How I Built &quot;Place Your First Trade&quot; App</strong>
                      <span>Current module</span>
                    </div>
                  </div>
                  <div className={`${homeStyles.sidebarModuleItem} ${homeStyles.sidebarModuleItemComingSoon}`}>
                    <span className={homeStyles.sidebarModuleIndex}>3</span>
                    <div className={homeStyles.sidebarModuleText}>
                      <strong>Learn Gamma API</strong>
                      <span>Coming soon</span>
                    </div>
                  </div>
                  <div className={`${homeStyles.sidebarModuleItem} ${homeStyles.sidebarModuleItemComingSoon}`}>
                    <span className={homeStyles.sidebarModuleIndex}>4</span>
                    <div className={homeStyles.sidebarModuleText}>
                      <strong>Learn CLOB API</strong>
                      <span>Coming soon</span>
                    </div>
                  </div>
                  <div className={`${homeStyles.sidebarModuleItem} ${homeStyles.sidebarModuleItemComingSoon}`}>
                    <span className={homeStyles.sidebarModuleIndex}>5</span>
                    <div className={homeStyles.sidebarModuleText}>
                      <strong>Learn Data API</strong>
                      <span>Coming soon</span>
                    </div>
                  </div>
                  <div className={`${homeStyles.sidebarModuleItem} ${homeStyles.sidebarModuleItemComingSoon}`}>
                    <span className={homeStyles.sidebarModuleIndex}>6</span>
                    <div className={homeStyles.sidebarModuleText}>
                      <strong>Polymarket APIs Quiz</strong>
                      <span>Coming soon</span>
                    </div>
                  </div>
                </div>
                <div className={homeStyles.sidebarFooter}>
                  <div className={homeStyles.sidebarFooterInlineCtas}>
                    <Link className={homeStyles.sidebarFooterInlineLink} href="/glossary">
                      Glossary
                    </Link>
                    <span aria-hidden="true" className={homeStyles.sidebarFooterDivider}>
                      |
                    </span>
                    <Link className={homeStyles.sidebarFooterInlineLink} href="/feedback">
                      Feedback
                    </Link>
                  </div>
                  <button
                    aria-label="Hide left navbar"
                    className={homeStyles.sidebarNavToggle}
                    onClick={() => setSidebarOpen(false)}
                    type="button"
                  >
                    Hide Navbar
                  </button>
                </div>
              </>
            ) : (
              <div className={homeStyles.sidebarFooter}>
                <button
                  aria-label="Show left navbar"
                  className={homeStyles.sidebarNavToggle}
                  onClick={() => setSidebarOpen(true)}
                  type="button"
                >
                  {'>'}
                </button>
              </div>
            )}
          </aside>

          <div className={homeStyles.pageBody}>
            <div className={styles.page}>
              <main className={styles.article}>
            <p className={styles.kicker}>Build Notes 🛠️</p>
            <h1>How I Built This App</h1>
            <p className={styles.lead}>
              I built PolyTeacher as a practical, step-by-step onboarding experience for new developers who want to
              place a first Polymarket trade using an EOA flow. This guide documents exactly how I structured the app
              and why each step exists.
            </p>

            <section>
              <h2>Tooling Note (Cursor + model)</h2>
              <p>
                I built this app in Cursor and used <code>gpt-5.3-codex</code> as my coding assistant model for
                implementation and iterative refinement.
              </p>
            </section>

            <section>
              <h2>0) Project Bootstrap (Next.js + RainbowKit)</h2>
              <p>
                I started with RainbowKit&apos;s starter so wallet UX was solved first, then layered Polymarket logic
                on top.
              </p>
              <pre className={styles.codeBlock}>
                <code>npm init @rainbow-me/rainbowkit@latest</code>
              </pre>
              <p>
                Why this matters: first-time builders often get blocked on wallet setup. Starting here gave me working
                wallet connection, chain config, and sane defaults before I touched trading logic.
              </p>
            </section>

            <section>
              <h2>1) The Product Goal</h2>
              <p>My goal was to teach the full path from &quot;wallet connected&quot; to &quot;trade submitted&quot; without making the user dig through docs first. The app is intentionally linear:</p>
              <ul>
                <li>Discover event (Gamma)</li>
                <li>Select specific market + outcome (Gamma)</li>
                <li>Derive CLOB credentials from wallet signature (CLOB L1 auth)</li>
                <li>Set on-chain approvals on Polygon (ERC20 + ERC1155)</li>
                <li>Submit a BUY order via CLOB (L2 authenticated request)</li>
                <li>Read position from Data API to confirm the result</li>
              </ul>
            </section>


            <section>
              <h2>2) API Routes I Added (and Why)</h2>
              <p>
                I use a thin API-proxy layer inside Next.js so the frontend talks to stable local routes, not directly
                to every external endpoint. This improves reliability, centralizes logging, and avoids CORS headaches.
              </p>
              <ul className={styles.routeList}>
                <li>
                  <code>/api/gamma/markets</code> - Step 1 market/event discovery.
                  <br />
                  Supports <code>limit</code>, <code>tutorial</code>, and <code>preset=specific</code> so I can
                  control which events appear in the tutorial.
                </li>
                <li>
                  <code>/api/gamma/event-markets?slug=...</code> - Step 2 sub-market list for a chosen event.
                  <br />
                  Keeps event selection and market selection as two separate learning actions.
                </li>
                <li>
                  <code>/api/gamma/market?marketId=...</code> - Focused market refresh/polling.
                  <br />
                  Used to keep YES/NO prices updated in the right rail every few seconds.
                </li>
                <li>
                  <code>/api/data/positions?user=0x...&amp;limit=5</code> - Sidebar position snapshot.
                  <br />
                  Normalizes/validates the address and returns a consistent shape for UI rendering.
                </li>
              </ul>
            </section>

            <section>
              <h2>3) EOA Auth Flow for CLOB (Critical Step)</h2>
              <p>
                Wallet connection alone is not enough to trade on CLOB. I first create an L1 wallet-authenticated
                client, then derive or fetch API credentials tied to that EOA signature:
              </p>
              <pre className={styles.codeBlock}>
                <code>{`const l1Client = createL1Client(walletClient);
const creds = await l1Client.createOrDeriveApiKey();`}</code>
              </pre>
              <p>
                Why this matters: these credentials are what authorize subsequent trading calls. I surface this
                explicitly as its own tutorial step so builders understand &quot;connect wallet&quot; and &quot;authenticate for
                trading&quot; are separate concerns.
              </p>
            </section>

            <section>
              <h2>4) On-Chain Approvals Before Trading</h2>
              <p>
                Before placing orders, I run one-time Polygon approvals for USDC.e and CTF across the exchange
                contracts used by normal and negative-risk markets. In-app, I execute six transactions and verify
                completion.
              </p>
              <ul>
                <li>USDC.e <code>approve</code> to CLOB Exchange</li>
                <li>CTF <code>setApprovalForAll</code> to CLOB Exchange</li>
                <li>USDC.e <code>approve</code> to Neg-Risk Exchange</li>
                <li>CTF <code>setApprovalForAll</code> to Neg-Risk Exchange</li>
                <li>USDC.e <code>approve</code> to Neg-Risk Adapter</li>
                <li>CTF <code>setApprovalForAll</code> to Neg-Risk Adapter</li>
              </ul>
              <p>
                Why this matters: the most common first-trade failure is missing allowance. I built clear progress text
                and post-transaction verification so builders can debug this quickly.
              </p>
            </section>

            <section>
              <h2>5) Order Execution: First Trade</h2>
              <p>
                I keep order entry simple: user enters USDC.e amount, and the app computes estimated shares from
                current outcome price. Then I submit a BUY order via the L2 client:
              </p>
              <pre className={styles.codeBlock}>
                <code>{`const l2Client = createL2Client(walletClient, creds);
await l2Client.createAndPostOrder({
  tokenID: activeTokenId,
  side: Side.BUY,
  price: marketOrderPrice,
  size: estimatedShares,
});`}</code>
              </pre>
              <p>
                Why this matters: first-time developers usually overcomplicate order sizing. Framing it as &quot;how much do
                you want to spend?&quot; is easier to reason about and maps cleanly to user intent.
              </p>
            </section>

            <section>
              <h2>6) Confirming Trade Outcome</h2>
              <p>
                After submission, I show a human-readable summary (status, filled shares, USDC.e spent, and tx link)
                instead of raw JSON. I also dispatch an in-app event to refresh positions:
              </p>
              <pre className={styles.codeBlock}>
                <code>{`window.dispatchEvent(new CustomEvent('polyteacher:trade-executed'));`}</code>
              </pre>
              <p>
                The sidebar then re-reads Data API positions so the learner immediately sees the top open position
                update. That closes the learning loop from order click to visible portfolio impact.
              </p>
            </section>

            <section>
              <h2>7) Recommended Build Order for New Developers</h2>
              <ul>
                <li>Bootstrap with RainbowKit starter and verify wallet connect/disconnect.</li>
                <li>Add Gamma proxy routes and render event/market selection UI.</li>
                <li>Implement <code>createOrDeriveApiKey()</code> and persist creds in app state.</li>
                <li>Add allowance transactions + on-chain verification.</li>
                <li>Wire <code>createAndPostOrder()</code> with clean error handling.</li>
                <li>Add Data API positions for post-trade confirmation and confidence.</li>
              </ul>
            </section>

            <section>
              <h2>8) What I&apos;d Improve Next</h2>
              <ul>
                <li>Persist tutorial progress per wallet.</li>
                <li>Add richer post-trade analytics and position history.</li>
                <li>Improve mobile-specific layout for dense steps.</li>
              </ul>
            </section>

            <div className={styles.backRow}>
              <Link href="/">Back to PolyTeacher tutorial</Link>
            </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HowIBuiltThisApp;
