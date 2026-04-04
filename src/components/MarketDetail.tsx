import { useEffect, useMemo, useState } from 'react';

import { getOrderBook, getPrice } from '../lib/clob';
import type { Market, OrderBook, OrderResult } from '../types/polymarket';
import styles from '../styles/Home.module.css';
import { OrderConfirmation } from './OrderConfirmation';
import { TradeForm } from './TradeForm';

interface MarketDetailProps {
  market: Market;
  onBack: () => void;
}

function formatDate(value: string): string {
  if (!value) {
    return 'TBD';
  }
  return new Date(value).toLocaleString();
}

export function MarketDetail({ market, onBack }: MarketDetailProps) {
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [yesPrice, setYesPrice] = useState<string>('--');
  const [noPrice, setNoPrice] = useState<string>('--');
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);

  const yesToken = useMemo(
    () => market.tokens.find((token) => token.outcome.toLowerCase() === 'yes')?.tokenId ?? '',
    [market.tokens],
  );
  const noToken = useMemo(
    () => market.tokens.find((token) => token.outcome.toLowerCase() === 'no')?.tokenId ?? '',
    [market.tokens],
  );

  useEffect(() => {
    const load = async () => {
      if (!yesToken || !noToken) {
        return;
      }

      console.log('[CLOB API - Public] Loading market detail panel data.');
      const [book, yesQuote, noQuote] = await Promise.all([
        getOrderBook(yesToken),
        getPrice(yesToken, 'BUY'),
        getPrice(noToken, 'BUY'),
      ]);
      setOrderBook(book);
      setYesPrice(yesQuote.price);
      setNoPrice(noQuote.price);
    };

    void load();
  }, [yesToken, noToken]);

  return (
    <div className={styles.detailView}>
      <button className={styles.secondaryButton} onClick={onBack} type="button">
        Back to market list
      </button>

      <section className={styles.panel}>
        <h2>{market.question}</h2>
        <p>{market.description}</p>
        <p>
          <strong>End date:</strong> {formatDate(market.endDate)}
        </p>
        <p>
          <strong>Volume:</strong> ${Number(market.volume).toLocaleString()}
        </p>
      </section>

      <section className={styles.panel}>
        <h3>Live Prices</h3>
        <p className={styles.apiTag}>
          API used: <strong>CLOB API public endpoint</strong> for real-time pricing
        </p>
        <div className={styles.priceRow}>
          <span>Yes: {(Number(yesPrice) * 100).toFixed(2)}%</span>
          <span>No: {(Number(noPrice) * 100).toFixed(2)}%</span>
        </div>
      </section>

      <section className={styles.panel}>
        <h3>Order Book (Yes Token)</h3>
        <p className={styles.apiTag}>
          API used: <strong>CLOB API public endpoint</strong> for market depth
        </p>
        <div className={styles.orderBookGrid}>
          <div>
            <h4>Bids</h4>
            {(orderBook?.bids ?? []).slice(0, 6).map((level, index) => (
              <p key={`bid-${index}`}>
                {level.size} @ {level.price}
              </p>
            ))}
          </div>
          <div>
            <h4>Asks</h4>
            {(orderBook?.asks ?? []).slice(0, 6).map((level, index) => (
              <p key={`ask-${index}`}>
                {level.size} @ {level.price}
              </p>
            ))}
          </div>
        </div>
      </section>

      {orderResult ? (
        <OrderConfirmation onBackToMarkets={onBack} result={orderResult} />
      ) : (
        <TradeForm market={market} onTradeComplete={setOrderResult} />
      )}
    </div>
  );
}
