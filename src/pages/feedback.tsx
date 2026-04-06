import { ConnectButton } from '@rainbow-me/rainbowkit';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';

import homeStyles from '../styles/Home.module.css';
import styles from '../styles/HowIBuilt.module.css';

const FeedbackPage: NextPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className={homeStyles.container}>
      <Head>
        <title>PolyTeacher - Feedback</title>
        <meta
          content="Builder feedback and clarity notes collected while building the PolyTeacher tutorial app."
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
                <p className={styles.kicker}>Builder Feedback</p>
                <h1>What was confusing while building this app</h1>
                <p className={styles.lead}>
                  These notes capture confusion points during implementation so future developer onboarding can be clearer.
                </p>

                <section>
                  <h2>1) Events vs Markets is essential but unclear</h2>
                  <p>
                    The docs emphasize this distinction, but it is still easy to mix up event-level discovery versus
                    market-level trading. A first-time builder benefits from a concrete example and a visual hierarchy
                    early in the flow.
                  </p>
                </section>

                <section>
                  <h2>2) API key derivation wording is confusing</h2>
                  <p>
                    The phrase &quot;Derivation of API keys&quot; can sound like there is an API key to fetch from a dashboard.
                    In practice, the key material is derived after L1 authentication with your wallet signature.
                  </p>
                </section>

                <section>
                  <h2>3) Post-signing outcome should be explicit</h2>
                  <p>
                    After successfully signing the EIP-712 message, docs should explicitly state that the app receives
                    or derives:
                  </p>
                  <ul>
                    <li>
                      <code>apiKey</code>
                    </li>
                    <li>
                      <code>secret</code>
                    </li>
                    <li>
                      <code>passphrase</code>
                    </li>
                  </ul>
                  <p>
                    This is much easier to understand when docs state the exact output shape up front, before code samples.
                  </p>
                </section>

                <section>
                  <h2>4) USDC.e requirement before allowances</h2>
                  <p>
                    A common uncertainty: do you need USDC.e before running approvals? In this app&apos;s flow, yes. The step
                    is on Polygon and requires the right token context, so this prerequisite should be stated prominently.
                  </p>
                </section>

                <section>
                  <h2>5) &quot;Set Allowances&quot; needs clearer mental model</h2>
                  <p>
                    The step can feel opaque unless users know exactly what is being approved and for which contracts.
                    Showing the six approvals with contract roles and success verification helps reduce confusion.
                  </p>
                </section>

                <section>
                  <h2>Suggested clarity improvements</h2>
                  <ul>
                    <li>Add a visual event → market example before any API calls.</li>
                    <li>Rename API key section to &quot;Derive L2 credentials from wallet signature&quot;.</li>
                    <li>Show exact credential output fields immediately after auth explanation.</li>
                    <li>Add prerequisite banner: &quot;Hold USDC.e on Polygon before Step 4&quot;.</li>
                    <li>List each approval target with plain-English contract purpose.</li>
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

export default FeedbackPage;
