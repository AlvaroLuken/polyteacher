import { useEffect, useMemo, useState } from 'react';

import { fetchMarketsByLiquidity } from '../lib/gamma';
import type { Market } from '../types/polymarket';
import styles from '../styles/Home.module.css';
import { MarketCard } from './MarketCard';

interface MarketListProps {
  onSelect: (market: Market) => void;
}

type ScenarioKey = 'news' | 'finance' | 'sports';

interface ScenarioConfig {
  key: ScenarioKey;
  title: string;
  description: string;
}

const SCENARIOS: ScenarioConfig[] = [
  {
    key: 'news',
    title: 'For a news site',
    description: 'Embed live prediction odds alongside breaking news coverage.',
  },
  {
    key: 'finance',
    title: 'For a finance blog',
    description: 'Embed market sentiment next to macro and crypto analysis.',
  },
  {
    key: 'sports',
    title: 'For a sports page',
    description: 'Embed headline outcome markets near game previews and recaps.',
  },
];

const BLOCKED_PATTERNS = ['o/u', 'spread:', 'assists', 'rebounds', 'draw at halftime'];

const CATEGORY_KEYWORDS: Record<ScenarioKey, string[]> = {
  news: ['politics', 'geopolitics', 'world', 'election', 'government', 'war', 'conflict'],
  finance: ['crypto', 'bitcoin', 'ethereum', 'fed', 'economy', 'finance', 'rates'],
  sports: ['sports', 'nba', 'nfl', 'mlb', 'nhl', 'f1', 'soccer', 'tennis', 'champion'],
};

function shouldExcludeQuestion(question: string): boolean {
  const normalized = question.toLowerCase();
  return BLOCKED_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function classifyScenario(market: Market): ScenarioKey | null {
  const categoryText = (market.category ?? '').toLowerCase();
  const fallbackText = market.question.toLowerCase();

  if (categoryText) {
    for (const scenario of SCENARIOS) {
      if (CATEGORY_KEYWORDS[scenario.key].some((keyword) => categoryText.includes(keyword))) {
        return scenario.key;
      }
    }
  }

  // Fallback keeps sections populated when category is missing in active-market payloads.
  const text = `${categoryText} ${fallbackText}`;
  for (const scenario of SCENARIOS) {
    if (CATEGORY_KEYWORDS[scenario.key].some((keyword) => text.includes(keyword))) {
      return scenario.key;
    }
  }
  return null;
}

export function MarketList({ onSelect }: MarketListProps) {
  const [markets, setMarkets] = useState<Market[]>([]);

  useEffect(() => {
    const load = async () => {
      console.log('[MarketList] Starting market fetch on mount.');
      try {
        const data = await fetchMarketsByLiquidity(20);
        console.log('[MarketList] Market fetch finished.', {
          count: data.length,
          firstConditionId: data[0]?.conditionId ?? null,
        });
        setMarkets(data);
      } catch (error) {
        console.error('[MarketList] Market fetch failed.', error);
      }
    };

    void load();
  }, []);

  const marketsByScenario = useMemo(() => {
    const result: Record<ScenarioKey, Market[]> = {
      news: [],
      finance: [],
      sports: [],
    };

    const filtered = markets.filter((market) => !shouldExcludeQuestion(market.question));
    for (const market of filtered) {
      const scenario = classifyScenario(market);
      if (!scenario || result[scenario].length >= 4) {
        continue;
      }
      result[scenario].push(market);
    }
    return result;
  }, [markets]);

  return (
    <section>
      <h2>Market Discovery for Embeds</h2>
      {SCENARIOS.map((scenario) => (
        <section className={styles.discoverySection} key={scenario.key}>
          <h3>{scenario.title}</h3>
          <p className={styles.embedHint}>
            <em>{scenario.description}</em>
          </p>
          <p className={styles.apiTag}>
            API: <strong>Gamma API</strong> `GET /markets` with `active=true`, `closed=false`,
            `volume_num_min=50000`, `liquidity_num_min=5000`, `order=volume`, `ascending=false`,
            `limit=20`, then client-side filtering removes prop-style sports lines.
          </p>
          <div className={styles.marketGrid}>
            {marketsByScenario[scenario.key].map((market) => (
              <MarketCard key={market.id} market={market} onSelect={onSelect} />
            ))}
          </div>
          {marketsByScenario[scenario.key].length === 0 ? (
            <p className={styles.emptyCategory}>No clean demo markets in this category right now.</p>
          ) : null}
        </section>
      ))}
    </section>
  );
}
