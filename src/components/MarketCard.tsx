import type { Market } from '../types/polymarket';
import styles from '../styles/Home.module.css';

interface MarketCardProps {
  market: Market;
  onSelect: (market: Market) => void;
}

function parseProbability(value?: string): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.min(1, Math.max(0, parsed));
}

function formatCompactCurrency(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return '$0';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(parsed);
}

export function MarketCard({ market, onSelect }: MarketCardProps) {
  const yesProbability = parseProbability(market.outcomePrices[0]);
  const noProbability =
    parseProbability(market.outcomePrices[1]) || Math.max(0, 1 - yesProbability);
  const normalizedSum = yesProbability + noProbability || 1;
  const yesWidth = (yesProbability / normalizedSum) * 100;
  const noWidth = (noProbability / normalizedSum) * 100;

  return (
    <article className={styles.marketCard}>
      <h3 className={styles.cardTitleClamp}>{market.question}</h3>

      <div className={styles.probabilityBar} role="presentation">
        <div className={styles.yesBar} style={{ width: `${yesWidth}%` }} />
        <div className={styles.noBar} style={{ width: `${noWidth}%` }} />
      </div>

      <div className={styles.priceRow}>
        <span>Yes: {(yesProbability * 100).toFixed(1)}%</span>
        <span>No: {(noProbability * 100).toFixed(1)}%</span>
      </div>

      <div className={styles.marketMeta}>
        <span>Volume: {formatCompactCurrency(market.volume)}</span>
        <span>Liquidity: {formatCompactCurrency(market.liquidity)}</span>
      </div>

      <button className={styles.selectButton} onClick={() => onSelect(market)} type="button">
        Try embedding this →
      </button>
    </article>
  );
}
