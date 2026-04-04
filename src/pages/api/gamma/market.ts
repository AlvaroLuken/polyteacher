import type { NextApiRequest, NextApiResponse } from 'next';

import { getMarket } from '../../../lib/gamma';
import type { Market } from '../../../types/polymarket';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Market | { error: string }>,
) {
  const marketIdQuery = Array.isArray(req.query.marketId)
    ? req.query.marketId[0]
    : req.query.marketId;
  const marketId = marketIdQuery?.trim();

  if (!marketId) {
    res.status(400).json({ error: 'Missing required marketId query parameter' });
    return;
  }

  try {
    console.log('[Gamma API Proxy] Single market request received.', { marketId });
    const market = await getMarket(marketId);
    res.status(200).json(market);
  } catch (error) {
    console.error('[Gamma API Proxy] Single market request failed.', { marketId, error });
    res.status(500).json({ error: 'Failed to fetch market from Gamma API' });
  }
}
