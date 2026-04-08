import type { GammaMarket, Market } from '../types/polymarket';

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const TUTORIAL_EVENT_SLUGS = [
  'the-masters-winner-2026',
  'republican-presidential-nominee-2028',
  'natural-disaster-in-2026',
];

interface GammaEvent {
  slug?: string;
  title: string;
  image?: string;
  icon?: string;
  markets?: GammaMarket[];
}
function parseStringArray(input: string[] | string | undefined): string[] {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input;
  }

  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toMarket(raw: GammaMarket): Market {
  const outcomes = parseStringArray(raw.outcomes);
  const outcomePrices = parseStringArray(raw.outcomePrices);
  const tokenIds = parseStringArray(raw.clobTokenIds);

  return {
    id: raw.id,
    conditionId: raw.conditionId,
    question: raw.question,
    description: raw.description ?? '',
    image: raw.image,
    icon: raw.icon,
    category: raw.category,
    outcomes,
    outcomePrices,
    volume: raw.volume ?? '0',
    liquidity: raw.liquidity ?? '0',
    endDate: raw.endDate ?? '',
    tokens: outcomes.map((outcome, index) => ({
      outcome,
      tokenId: tokenIds[index] ?? '',
    })),
  };
}

async function fetchGammaMarketsByLiquidity(limit = 20): Promise<Market[]> {
  const query = new URLSearchParams({
    active: 'true',
    closed: 'false',
    volume_num_min: '50000',
    liquidity_num_min: '5000',
    order: 'volume',
    ascending: 'false',
    limit: String(limit),
  });

  console.log('[Gamma API] Fetching active markets sorted by volume.', {
    url: `${GAMMA_BASE}/markets?${query.toString()}`,
    runtime: typeof window === 'undefined' ? 'server' : 'browser',
  });
  const res = await fetch(`${GAMMA_BASE}/markets?${query.toString()}`);
  console.log('[Gamma API] Response metadata.', {
    status: res.status,
    ok: res.ok,
    contentType: res.headers.get('content-type'),
    runtime: typeof window === 'undefined' ? 'server' : 'browser',
  });
  const data = (await res.json()) as GammaMarket[];
  console.log('[Gamma API] Parsed market payload.', {
    isArray: Array.isArray(data),
    count: Array.isArray(data) ? data.length : 0,
    firstMarketQuestion: Array.isArray(data) && data.length > 0 ? data[0].question : null,
  });
  return data.map(toMarket);
}

async function fetchGammaTutorialMarkets(limit = 6): Promise<Market[]> {
  const query = new URLSearchParams({
    active: 'true',
    closed: 'false',
    volume_num_min: '50000',
    order: 'volume',
    ascending: 'false',
    limit: String(limit),
  });

  console.log('[Gamma API] Fetching tutorial markets.', {
    url: `${GAMMA_BASE}/markets?${query.toString()}`,
    runtime: typeof window === 'undefined' ? 'server' : 'browser',
  });
  const res = await fetch(`${GAMMA_BASE}/markets?${query.toString()}`);
  const data = (await res.json()) as GammaMarket[];
  return data.map(toMarket);
}

async function fetchEventBySlug(slug: string): Promise<GammaEvent | null> {
  const url = `${GAMMA_BASE}/events?slug=${encodeURIComponent(slug)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('[Gamma API] Event fetch failed.', { slug, status: res.status });
    return null;
  }

  const data = (await res.json()) as GammaEvent[];
  const event = Array.isArray(data) && data.length > 0 ? data[0] : null;
  console.log('[Gamma API] Event fetched by slug.', {
    slug,
    found: Boolean(event),
    marketCount: event?.markets?.length ?? 0,
  });
  return event;
}

function pickRepresentativeMarket(event: GammaEvent): Market | null {
  const markets = (event.markets ?? [])
    .filter((market) => market.active && !market.closed)
    .sort((a, b) => Number(b.volume ?? 0) - Number(a.volume ?? 0));

  const topMarket = markets[0];
  if (!topMarket) {
    return null;
  }

  const parsed = toMarket(topMarket);
  return {
    ...parsed,
    question: event.title || parsed.question,
    image: event.image ?? parsed.image,
    icon: event.icon ?? parsed.icon,
    eventSlug: event.slug,
    eventTitle: event.title,
  };
}

export async function fetchEventMarketsBySlug(slug: string): Promise<Market[]> {
  if (typeof window !== 'undefined') {
    const res = await fetch(`/api/gamma/event-markets?slug=${encodeURIComponent(slug)}`);
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Event markets request failed (${res.status}): ${body.slice(0, 200)}`);
    }
    if (!contentType.includes('application/json')) {
      const body = await res.text();
      throw new Error(`Event markets non-JSON response: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as Market[];
    return Array.isArray(data) ? data : [];
  }

  const event = await fetchEventBySlug(slug);
  if (!event) {
    return [];
  }

  return (event.markets ?? [])
    .filter((market) => market.active && !market.closed)
    .sort((a, b) => Number(b.volume ?? 0) - Number(a.volume ?? 0))
    .map((market) => ({
      ...toMarket(market),
      image: market.image ?? event.image,
      icon: market.icon ?? event.icon,
      eventSlug: event.slug,
      eventTitle: event.title,
    }));
}

// Gamma API: client-safe market discovery via local Next.js proxy.
export async function fetchMarketsByLiquidity(limit = 20): Promise<Market[]> {
  if (typeof window === 'undefined') {
    return fetchGammaMarketsByLiquidity(limit);
  }

  console.log('[Gamma API] Fetching markets through /api/gamma/markets proxy.', { limit });
  const res = await fetch(`/api/gamma/markets?limit=${limit}`);
  console.log('[Gamma API] Proxy response metadata.', {
    status: res.status,
    ok: res.ok,
    runtime: 'browser',
  });

  const data = (await res.json()) as Market[];
  console.log('[Gamma API] Proxy payload parsed.', {
    isArray: Array.isArray(data),
    count: Array.isArray(data) ? data.length : 0,
    firstMarketQuestion: Array.isArray(data) && data.length > 0 ? data[0].question : null,
  });
  return Array.isArray(data) ? data : [];
}

export async function fetchTutorialMarkets(limit = 6): Promise<Market[]> {
  if (typeof window === 'undefined') {
    return fetchGammaTutorialMarkets(limit);
  }

  console.log('[Gamma API] Fetching tutorial markets through proxy.', { limit });
  const res = await fetch(`/api/gamma/markets?tutorial=true&limit=${limit}`);
  const data = (await res.json()) as Market[];
  return Array.isArray(data) ? data : [];
}

export async function fetchSpecificTutorialMarkets(): Promise<Market[]> {
  if (typeof window !== 'undefined') {
    const res = await fetch('/api/gamma/markets?preset=specific');
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      const body = await res.text();
      const hint = body.trim().startsWith('<!DOCTYPE')
        ? 'Received HTML error page. Restart your dev server on this port.'
        : body.slice(0, 200);
      throw new Error(`Step 1 market endpoint failed (${res.status}). ${hint}`);
    }
    if (!contentType.includes('application/json')) {
      const body = await res.text();
      throw new Error(
        `Step 1 market endpoint returned non-JSON content (${contentType || 'unknown'}): ${body.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as Market[];
    return Array.isArray(data) ? data : [];
  }

  const events = await Promise.allSettled(TUTORIAL_EVENT_SLUGS.map((slug) => fetchEventBySlug(slug)));
  const resolvedEvents = events.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    console.error('[Gamma API] Failed tutorial slug fetch.', {
      slug: TUTORIAL_EVENT_SLUGS[index],
      reason: String(result.reason),
    });
    return null;
  });

  const markets = resolvedEvents
    .map((event) => (event ? pickRepresentativeMarket(event) : null))
    .filter((market): market is Market => Boolean(market));
  console.log('[Gamma API] Specific tutorial markets resolved.', { count: markets.length });
  return markets;
}

export async function getMarket(marketId: string): Promise<Market> {
  if (typeof window !== 'undefined') {
    const res = await fetch(`/api/gamma/market?marketId=${encodeURIComponent(marketId)}`);
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Market request failed (${res.status}): ${body.slice(0, 200)}`);
    }
    if (!contentType.includes('application/json')) {
      const body = await res.text();
      throw new Error(`Market non-JSON response: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as Market;
  }

  console.log('[Gamma API] Fetching market details by id.');
  const res = await fetch(`${GAMMA_BASE}/markets/${marketId}`);
  const data = (await res.json()) as GammaMarket;
  if (!data?.id || !data?.question) {
    throw new Error(`Market payload invalid for id ${marketId}`);
  }
  return toMarket(data);
}

export { fetchGammaMarketsByLiquidity, fetchGammaTutorialMarkets };
