import type { NextApiRequest, NextApiResponse } from 'next';

const DATA_API_BASE = 'https://data-api.polymarket.com';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<unknown[] | { error: string }>,
) {
  const user = Array.isArray(req.query.user) ? req.query.user[0] : req.query.user;
  const limit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;

  if (!user) {
    res.status(400).json({ error: 'Missing required query param: user' });
    return;
  }

  const normalizedUser = user.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalizedUser)) {
    res.status(400).json({ error: 'Invalid user address' });
    return;
  }

  const params = new URLSearchParams({
    user: normalizedUser,
    limit: limit ?? '5',
    sortBy: 'TOKENS',
    sortDirection: 'DESC',
    sizeThreshold: '0',
  });

  try {
    const url = `${DATA_API_BASE}/positions?${params.toString()}`;
    console.log('[Data API Proxy] Fetching positions.', { user: normalizedUser, limit: params.get('limit') });
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
    });
    const raw = await response.text();
    if (!response.ok) {
      console.error('[Data API Proxy] Non-OK response.', {
        status: response.status,
        bodyPreview: raw.slice(0, 200),
        user: normalizedUser,
      });
      throw new Error(`Data API status ${response.status}`);
    }
    const parsed = JSON.parse(raw) as unknown;
    const data = Array.isArray(parsed) ? parsed : [];
    console.log('[Data API Proxy] Positions fetched.', { user: normalizedUser, count: data.length });
    res.status(200).json(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('[Data API Proxy] Failed to fetch positions.', { error, user });
    res.status(500).json({ error: 'Failed to fetch positions from Data API' });
  }
}
