import { ConnectButton } from '@rainbow-me/rainbowkit';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';

import homeStyles from '../styles/Home.module.css';
import styles from '../styles/HowIBuilt.module.css';

const GlossaryPage: NextPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className={homeStyles.container}>
      <Head>
        <title>PolyTeacher - Glossary</title>
        <meta
          content="Quick Polymarket glossary for events, markets, APIs, L2 credentials, and allowance contracts."
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
              <Link className={homeStyles.topNavTab} href="/my-positions">
                <span className={homeStyles.topNavTabText}>My Positions</span>
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
                  <Link className={`${homeStyles.sidebarModuleItem} ${homeStyles.sidebarModuleItemAvailable}`} href="/how-i-built-this-app">
                    <span className={homeStyles.sidebarModuleIndex}>2</span>
                    <div className={homeStyles.sidebarModuleText}>
                      <strong>How I Built &quot;Place Your First Trade&quot; App</strong>
                      <span>Available now</span>
                    </div>
                  </Link>
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
                <p className={styles.kicker}>Developer Notes</p>
                <h1>Polymarket Glossary</h1>
                <p className={styles.lead}>
                  A quick-reference breakdown for the concepts used in this app, focused on practical developer
                  understanding.
                </p>

                <section>
                  <h2>Events vs Markets</h2>
                  <ul>
                    <li>
                      <strong>Event:</strong> The parent topic (example: a debate, a CPI release, a match). It groups
                      multiple tradable markets.
                    </li>
                    <li>
                      <strong>Market:</strong> A specific tradable question/outcome contract inside that event (usually
                      YES/NO).
                    </li>
                    <li>
                      <strong>In this app:</strong> Step 1 helps you choose an event for context, then Step 2 narrows to a
                      single market and outcome to trade.
                    </li>
                  </ul>
                </section>

                <section>
                  <h2>Polymarket APIs in this app</h2>
                  <ul>
                    <li>
                      <strong>Gamma API:</strong> Used for market discovery and metadata. In this app it powers event and
                      market selection and market detail refreshes.
                    </li>
                    <li>
                      <strong>CLOB API:</strong> Used for authenticated trading actions. In this app it derives trading
                      credentials (Step 3), fetches quotes, and submits orders.
                    </li>
                    <li>
                      <strong>Data API:</strong> Used for portfolio/position reads after trading. In this app it powers
                      sidebar counts and the My Positions page to confirm trade outcomes.
                    </li>
                    <li>
                      <strong>Why this split matters:</strong> Discovery (Gamma), execution (CLOB), and reporting (Data)
                      are intentionally separate responsibilities.
                    </li>
                  </ul>
                </section>

                <section>
                  <h2>Step 3: L2 credentials (derived from wallet signature)</h2>
                  <p>
                    After you sign with your EOA wallet, the CLOB auth flow derives API credentials for trading requests.
                    The app shows these three values:
                  </p>
                  <ul>
                    <li>
                      <strong>Key:</strong> Public identifier for your CLOB API identity. Sent with requests so the backend
                      knows which credential set is being used.
                    </li>
                    <li>
                      <strong>Secret:</strong> Private signing secret used to prove request authenticity. Keep this hidden.
                    </li>
                    <li>
                      <strong>Passphrase:</strong> Additional secret factor paired with key+secret for authenticated CLOB
                      calls.
                    </li>
                    <li>
                      <strong>Practical takeaway:</strong> wallet connection alone is not enough for trading; Step 3 creates
                      the credentials needed for authenticated order endpoints.
                    </li>
                  </ul>
                </section>

                <section>
                  <h2>Step 4: Contract permissions and why they are needed</h2>
                  <p>
                    Before first trade, the app sends approvals to Polymarket-related contracts on Polygon so exchange
                    contracts can move tokens during settlement.
                  </p>
                  <ul>
                    <li>
                      <strong>CLOB Exchange</strong> (<code>0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E</code>): primary
                      exchange contract used for standard order execution.
                    </li>
                    <li>
                      <strong>Neg-Risk Exchange</strong> (<code>0xC5d563A36AE78145C45a50134d48A1215220f80a</code>): exchange
                      path used for negative-risk style markets.
                    </li>
                    <li>
                      <strong>Neg-Risk Adapter</strong> (<code>0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296</code>): adapter
                      contract supporting negative-risk routing and token flow.
                    </li>
                    <li>
                      <strong>What is approved:</strong> USDC.e uses ERC20 <code>approve</code>, and CTF positions use
                      ERC1155 <code>setApprovalForAll</code>, for each of the contracts above.
                    </li>
                  </ul>
                </section>

                <div className={styles.backRow}>
                  <Link href="/">Back to tutorial</Link>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlossaryPage;
