import type { NextApiRequest, NextApiResponse } from 'next';

import {
  fetchGammaMarketsByLiquidity,
  fetchGammaTutorialMarkets,
  fetchSpecificTutorialMarkets,
} from '../../../lib/gamma';
import type { Market } from '../../../types/polymarket';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Market[] | { error: string }>,
) {
  const limitQuery = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const tutorialQuery = Array.isArray(req.query.tutorial) ? req.query.tutorial[0] : req.query.tutorial;
  const presetQuery = Array.isArray(req.query.preset) ? req.query.preset[0] : req.query.preset;
  const isTutorial = tutorialQuery === 'true';
  const isSpecificPreset = presetQuery === 'specific';
  const parsedLimit = Number(limitQuery ?? 18);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 18;

  try {
    console.log('[Gamma API Proxy] Request received.', { limit, isTutorial, isSpecificPreset });
    const markets = isSpecificPreset
      ? await fetchSpecificTutorialMarkets()
      : isTutorial
        ? await fetchGammaTutorialMarkets(limit)
        : await fetchGammaMarketsByLiquidity(limit);
    console.log('[Gamma API Proxy] Returning markets.', { count: markets.length });
    res.status(200).json(markets);
  } catch (error) {
    console.error('[Gamma API Proxy] Failed to fetch.', error);
    res.status(500).json({ error: 'Failed to fetch from Gamma API' });
  }
}
