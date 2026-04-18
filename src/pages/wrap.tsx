import { ConnectButton } from '@rainbow-me/rainbowkit';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPublicClient, erc20Abi, formatUnits, http, maxUint256, parseUnits } from 'viem';
import { polygon } from 'viem/chains';
import { useAccount, useWalletClient, useWriteContract } from 'wagmi';

import { POLYMARKET_CONTRACTS } from '../lib/clob';
import homeStyles from '../styles/Home.module.css';
import styles from '../styles/Wrap.module.css';

const POLYGON_RPC_URL = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';
const POLYGON_CHAIN_HEX = '0x89';
const USDC_E_ADDRESS = POLYMARKET_CONTRACTS.usdcE as `0x${string}`;
const PUSD_ADDRESS = POLYMARKET_CONTRACTS.collateral as `0x${string}`;
const ONRAMP_ADDRESS = POLYMARKET_CONTRACTS.collateralOnramp as `0x${string}`;
const ONRAMP_ABI = [{
  name: 'wrap',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [
    { name: '_asset', type: 'address' },
    { name: '_to', type: 'address' },
    { name: '_amount', type: 'uint256' },
  ],
  outputs: [],
}] as const;

function formatWrapError(error: unknown, stage: string): string {
  const raw = String(error ?? '');
  const normalized = raw.toLowerCase();
  if (normalized.includes('user rejected') || normalized.includes('user denied')) {
    return `Wrap cancelled in wallet during "${stage}". No transaction was submitted.`;
  }
  if (normalized.includes('wallet_switchethereumchain') || normalized.includes('chain')) {
    return 'Wrap failed: please switch to Polygon in your wallet and try again.';
  }
  if (normalized.includes('insufficient funds')) {
    return 'Wrap failed: insufficient MATIC for gas on Polygon.';
  }
  if (normalized.includes('timeout')) {
    return 'Wrap is taking longer than expected. Please check your wallet activity and retry.';
  }
  return `Wrap failed during "${stage}". Please retry.`;
}

const WrapPage: NextPage = () => {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();
  const balanceAddress = walletClient?.account?.address ?? address;
  const polygonReadClient = useMemo(
    () => createPublicClient({ chain: polygon, transport: http(POLYGON_RPC_URL) }),
    [],
  );

  const [amount, setAmount] = useState('10');
  const [usdcBalance, setUsdcBalance] = useState<bigint>(BigInt(0));
  const [pUsdBalance, setPUsdBalance] = useState<bigint>(BigInt(0));
  const [onrampAllowance, setOnrampAllowance] = useState<bigint>(BigInt(0));
  const [status, setStatus] = useState('');
  const [isWrapping, setIsWrapping] = useState(false);
  const [lastTxHash, setLastTxHash] = useState('');
  const [isPositionLoading, setIsPositionLoading] = useState(false);
  const [positionError, setPositionError] = useState(false);
  const [positionCount, setPositionCount] = useState(0);

  const numericAmount = Number(amount) || 0;
  const usdcLabel = Number(formatUnits(usdcBalance, 6)).toFixed(4);
  const pUsdLabel = Number(formatUnits(pUsdBalance, 6)).toFixed(4);
  const canWrap = Boolean(walletClient && address && numericAmount > 0);
  const navBalanceLabel = balanceAddress ? pUsdLabel : 'Connect wallet';
  const myPositionsCount = balanceAddress && !isPositionLoading && !positionError ? positionCount : 0;
  const wrapCtaLabel = (() => {
    if (!walletClient || !address) return 'Connect wallet';
    if (isWrapping) return 'Wrapping...';
    return 'Wrap';
  })();

  const toInputAmount = (value: bigint) => {
    const raw = formatUnits(value, 6);
    if (!raw.includes('.')) return raw;
    const normalized = raw.replace(/\.?0+$/, '');
    return normalized.length > 0 ? normalized : '0';
  };
  const applyPreset = (numerator: bigint, denominator: bigint) => {
    const next = denominator === BigInt(0) ? BigInt(0) : (usdcBalance * numerator) / denominator;
    setAmount(toInputAmount(next));
  };
  const setMax = () => setAmount(toInputAmount(usdcBalance));

  const refreshBalances = useCallback(async () => {
    if (!address) {
      setUsdcBalance(BigInt(0));
      setPUsdBalance(BigInt(0));
      setOnrampAllowance(BigInt(0));
      return;
    }
    const [usdcRaw, pUsdRaw, allowanceRaw] = await Promise.all([
      polygonReadClient.readContract({
        address: USDC_E_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      }) as Promise<bigint>,
      polygonReadClient.readContract({
        address: PUSD_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      }) as Promise<bigint>,
      polygonReadClient.readContract({
        address: USDC_E_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, ONRAMP_ADDRESS],
      }) as Promise<bigint>,
    ]);
    setUsdcBalance(usdcRaw);
    setPUsdBalance(pUsdRaw);
    setOnrampAllowance(allowanceRaw);
  }, [address, polygonReadClient]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

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

    const fetchVia = async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 120)}`);
      }
      return (await response.json()) as Array<unknown>;
    };

    const proxyUrl = `/api/data/positions?user=${encodeURIComponent(balanceAddress)}&limit=5`;
    const directUrl = `https://data-api.polymarket.com/positions?user=${encodeURIComponent(balanceAddress.toLowerCase())}&limit=5&sortBy=TOKENS&sortDirection=DESC&sizeThreshold=0`;

    void fetchVia(proxyUrl)
      .then((positions) => {
        if (!active) return;
        setPositionCount(positions.length);
      })
      .catch(() => {
        if (!active) return Promise.resolve();
        return fetchVia(directUrl)
          .then((positions) => {
            if (!active) return;
            setPositionCount(positions.length);
          })
          .catch(() => {
            if (!active) return;
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
  }, [balanceAddress]);

  const wrap = async () => {
    if (!walletClient || !address || numericAmount <= 0) return;
    let wrapStage = 'preflight';
    try {
      const wrapAmount = parseUnits(String(numericAmount), 6);
      if (usdcBalance < wrapAmount) {
        setStatus('Insufficient USDC.e balance for this wrap amount.');
        return;
      }
      setIsWrapping(true);
      setStatus('Preparing transactions...');
      wrapStage = 'network check';
      const chainId = await walletClient.getChainId();
      if (chainId !== polygon.id) {
        wrapStage = 'switch network';
        await walletClient.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: POLYGON_CHAIN_HEX }] });
      }
      if (onrampAllowance < wrapAmount) {
        wrapStage = 'approve onramp';
        setStatus('Approving Collateral Onramp...');
        const approvalHash = await writeContractAsync({
          address: USDC_E_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [ONRAMP_ADDRESS, maxUint256],
          chain: polygon,
        });
        await polygonReadClient.waitForTransactionReceipt({ hash: approvalHash, pollingInterval: 2000, timeout: 180_000 });
      }
      wrapStage = 'submit wrap';
      setStatus('Wrapping USDC.e -> pUSD...');
      const wrapHash = await writeContractAsync({
        address: ONRAMP_ADDRESS,
        abi: ONRAMP_ABI,
        functionName: 'wrap',
        args: [USDC_E_ADDRESS, address, wrapAmount],
        chain: polygon,
      });
      await polygonReadClient.waitForTransactionReceipt({ hash: wrapHash, pollingInterval: 2000, timeout: 180_000 });
      setLastTxHash(wrapHash);
      await refreshBalances();
      setStatus('Wrap complete. Your pUSD balance is updated.');
    } catch (error) {
      console.error('[Wrap] Wrap flow failed.', {
        stage: wrapStage,
        amount: amount,
        numericAmount,
        error,
      });
      setStatus(formatWrapError(error, wrapStage));
    } finally {
      setIsWrapping(false);
    }
  };

  return (
    <div className={homeStyles.container}>
      <Head>
        <title>PolyTeacher - Wrap USDC.e to pUSD</title>
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
              <a
                className={`${homeStyles.topNavTab} ${homeStyles.topNavTabActive}`}
                href="https://www.polywrap.fun/"
                rel="noreferrer noopener"
                target="_blank"
              >
                <span className={homeStyles.topNavTabText}>PUSD Wrapper ↗</span>
              </a>
              <div className={homeStyles.topNavBalanceWrap}>
                <div className={`${homeStyles.topNavTab} ${homeStyles.topNavCashTab}`}>
                  <span className={homeStyles.topNavTabText}>Balance</span>
                  <span className={homeStyles.topNavTabValue}>{navBalanceLabel}</span>
                </div>
                <span className={homeStyles.topNavBalanceTooltip}>Your pUSD balance on Polygon</span>
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
        <main className={styles.page}>
          <section className={styles.wrapperCard}>
            <div className={styles.formShell}>
              <div className={styles.panel}>
                <div className={styles.panelTop}>
                  <p className={styles.panelLabel}>Pay with</p>
                  <div className={styles.quickActions}>
                    <button className={styles.quickActionButton} onClick={() => applyPreset(BigInt(1), BigInt(4))} type="button">25%</button>
                    <button className={styles.quickActionButton} onClick={() => applyPreset(BigInt(1), BigInt(2))} type="button">50%</button>
                    <button className={styles.quickActionButton} onClick={() => applyPreset(BigInt(3), BigInt(4))} type="button">75%</button>
                    <button className={styles.quickActionButton} onClick={setMax} type="button">Max</button>
                  </div>
                </div>
                <div className={styles.panelBody}>
                  <input
                    className={styles.amountInput}
                    id="wrap-amount-input"
                    min="0"
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0"
                    step="0.01"
                    type="number"
                    value={amount}
                  />
                  <div className={styles.tokenColumn}>
                    <button className={styles.tokenSelector} type="button">
                      USDC.e <span>▾</span>
                    </button>
                    <p className={styles.tokenBalance}>{usdcLabel} USDC.e</p>
                  </div>
                </div>
                <p className={styles.subValue}>${numericAmount > 0 ? numericAmount.toFixed(2) : '0.00'}</p>
              </div>

              <div className={styles.dividerWrap}>
                <button className={styles.dividerButton} type="button">↓</button>
              </div>

              <div className={`${styles.panel} ${styles.panelReceive}`}>
                <div className={styles.panelTop}>
                  <p className={styles.panelLabel}>Receive</p>
                </div>
                <div className={styles.panelBody}>
                  <p className={styles.receiveValue}>{numericAmount > 0 ? numericAmount.toFixed(4) : '—'}</p>
                  <div className={styles.tokenColumn}>
                    <button className={styles.tokenSelector} type="button">
                      pUSD <span>▾</span>
                    </button>
                    <p className={styles.tokenBalance}>{pUsdLabel} pUSD</p>
                  </div>
                </div>
                <p className={styles.subValue}>${numericAmount > 0 ? numericAmount.toFixed(2) : '0.00'}</p>
              </div>

              <div className={styles.actionRow}>
                <button className={styles.wrapButton} disabled={!canWrap || isWrapping} onClick={() => void wrap()} type="button">
                  {wrapCtaLabel}
                </button>
              </div>
            </div>
            {status ? <p className={styles.statusText}>{status}</p> : null}
            {lastTxHash ? (
              <a className={styles.txLink} href={`https://polygonscan.com/tx/${lastTxHash}`} rel="noreferrer" target="_blank">
                View last wrap tx ↗
              </a>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
};

export default WrapPage;
