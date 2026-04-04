import type { OrderResult } from '../types/polymarket';
import styles from '../styles/Home.module.css';

interface OrderConfirmationProps {
  result: OrderResult;
  onBackToMarkets: () => void;
}

export function OrderConfirmation({
  result,
  onBackToMarkets,
}: OrderConfirmationProps) {
  const orderId =
    (result.orderID as string | undefined) ??
    (result.orderId as string | undefined) ??
    'Unavailable';
  const status =
    (result.status as string | undefined) ??
    (result.success ? 'accepted' : 'pending');

  return (
    <section className={styles.panel}>
      <h3>Order Confirmation</h3>
      <p>
        <strong>Order ID:</strong> {orderId}
      </p>
      <p>
        <strong>Status:</strong> {status}
      </p>
      <button className={styles.secondaryButton} onClick={onBackToMarkets} type="button">
        Back to markets
      </button>
    </section>
  );
}
