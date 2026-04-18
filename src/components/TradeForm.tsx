import { AssetType, OrderType, Side } from '@polymarket/clob-client-v2';
import { useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';

import { createL1Client, createL2Client } from '../lib/clob';
import type { Market, OrderResult } from '../types/polymarket';
import styles from '../styles/Home.module.css';

interface TradeFormProps {
  market: Market;
  onTradeComplete: (result: OrderResult) => void;
}

type OutcomeSelection = 'yes' | 'no';

export function TradeForm({ market, onTradeComplete }: TradeFormProps) {
  const [outcome, setOutcome] = useState<OutcomeSelection>('yes');
  const [amount, setAmount] = useState('10');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const yesToken = market.tokens.find((token) => token.outcome.toLowerCase() === 'yes');
  const noToken = market.tokens.find((token) => token.outcome.toLowerCase() === 'no');
  const tokenId = outcome === 'yes' ? yesToken?.tokenId : noToken?.tokenId;

  const canSubmit = isConnected && walletClient && tokenId && Number(amount) > 0;

  const placeTrade = async () => {
    if (!walletClient || !tokenId) {
      return;
    }

    setIsSubmitting(true);
    try {
      console.log('[CLOB API - L1] Preparing wallet-authenticated client.');
      const l1Client = createL1Client(walletClient);

      console.log('[CLOB API - L1] Deriving API credentials from wallet signature.');
      const creds = await l1Client.createOrDeriveApiKey();

      console.log('[CLOB API - L1] Updating collateral allowance for pUSD.');
      await l1Client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });

      console.log('[CLOB API - L2] Creating market order payload.');
      const l2Client = createL2Client(walletClient, creds);
      const order = await l2Client.createMarketOrder({
        tokenID: tokenId,
        amount: Number(amount),
        side: Side.BUY,
      });

      console.log('[CLOB API - L2] Posting market order.');
      const result = (await l2Client.postOrder(order, OrderType.FOK)) as OrderResult;
      console.log('[CLOB API - L2] Order response:', result);
      onTradeComplete(result);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className={styles.panel}>
      <h3>Place Your First Trade</h3>
      <p className={styles.apiTag}>
        API used: <strong>CLOB API</strong> (L1 for auth/allowance, L2 for order placement)
      </p>

      <div className={styles.segmentedControl}>
        <button
          className={outcome === 'yes' ? styles.activeChoice : styles.choice}
          onClick={() => setOutcome('yes')}
          type="button"
        >
          Yes
        </button>
        <button
          className={outcome === 'no' ? styles.activeChoice : styles.choice}
          onClick={() => setOutcome('no')}
          type="button"
        >
          No
        </button>
      </div>

      <label className={styles.inputLabel} htmlFor="trade-amount">
        Amount (pUSD)
      </label>
      <input
        className={styles.input}
        id="trade-amount"
        min="0"
        onChange={(event) => setAmount(event.target.value)}
        step="0.01"
        type="number"
        value={amount}
      />

      <button
        className={styles.primaryButton}
        disabled={!canSubmit || isSubmitting}
        onClick={placeTrade}
        type="button"
      >
        {isSubmitting ? 'Placing order...' : 'Place market order'}
      </button>
    </section>
  );
}
