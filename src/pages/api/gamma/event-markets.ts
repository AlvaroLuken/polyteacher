import type { NextApiRequest, NextApiResponse } from 'next';

import { fetchEventMarketsBySlug } from '../../../lib/gamma';
import type { Market } from '../../../types/polymarket';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Market[] | { error: string }>,
) {
  const slugQuery = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  const slug = slugQuery?.trim();

  if (!slug) {
    res.status(400).json({ error: 'Missing required slug query parameter' });
    return;
  }

  try {
    console.log('[Gamma API Proxy] Event markets request received.', { slug });
    const markets = await fetchEventMarketsBySlug(slug);
    console.log('[Gamma API Proxy] Event markets returned.', { slug, count: markets.length });
    res.status(200).json(markets);
  } catch (error) {
    console.error('[Gamma API Proxy] Event markets request failed.', { slug, error });
    res.status(500).json({ error: 'Failed to fetch event markets from Gamma API' });
  }
}
