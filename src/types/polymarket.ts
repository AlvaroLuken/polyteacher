export interface GammaMarket {
  id: string;
  conditionId: string;
  question: string;
  description: string;
  image?: string;
  icon?: string;
  category?: string;
  active?: boolean;
  closed?: boolean;
  enableOrderBook?: boolean;
  outcomes: string[] | string;
  outcomePrices: string[] | string;
  clobTokenIds?: string[] | string;
  volume: string;
  liquidity: string;
  endDate: string;
}

export interface MarketToken {
  tokenId: string;
  outcome: string;
}

export interface Market {
  id: string;
  conditionId: string;
  question: string;
  description: string;
  image?: string;
  icon?: string;
  category?: string;
  eventSlug?: string;
  eventTitle?: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: string;
  liquidity: string;
  endDate: string;
  tokens: MarketToken[];
}

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface TradeParams {
  tokenId: string;
  amount: number;
}

export interface OrderResult {
  orderID?: string;
  orderId?: string;
  status?: string;
  success?: boolean;
  [key: string]: unknown;
}
