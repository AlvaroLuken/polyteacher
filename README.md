# PolyTeacher: Place Your First Polymarket Trade

PolyTeacher is a tutorial-first web app that helps a new developer go from wallet connection to first trade on Polymarket using an EOA flow.

## What We Are Building

Step-by-step tutorial app:

1. **Explore Events**: fetch specific tutorial events from Gamma.
2. **Choose Sub-Market**: select the exact market to trade.
3. **Authenticate for CLOB**: derive L2 credentials from wallet signature.
4. **Set Allowances**: run required Polygon approvals (USDC.e + CTF).
5. **Execute Trade**: submit first BUY order and review confirmation in a completion modal.

The goal is educational clarity: each step explicitly calls out **which API is used and why**.

## Stack

- Next.js + TypeScript
- RainbowKit + wagmi
- `@polymarket/clob-client` for CLOB interactions
- viem for chain reads/writes on Polygon

## APIs Used (and Why)

- **Gamma API** (`https://gamma-api.polymarket.com`)
  - Used for event discovery, event sub-markets, and market metadata refresh.
  - Reason: clean public market/event data optimized for discovery.

- **CLOB API Public Endpoints** (`https://clob.polymarket.com`)
  - Used for order book and live pricing.
  - Reason: market microstructure data (depth/quotes) comes from CLOB.

- **CLOB API L1 + L2 Auth**
  - **L1 (wallet signing)**: derive API credentials via `createOrDeriveApiKey()`.
  - **L2 (API credentials)**: create/post orders via `createAndPostOrder()`.
  - Reason: order placement requires authenticated CLOB flow.

- **Polymarket Data API** (`https://data-api.polymarket.com`)
  - Used for sidebar position snapshot after trade.
  - Reason: easiest way to show portfolio impact to the learner.

## Local Setup

1. (Optional) Bootstrap a fresh RainbowKit app:

```bash
npm init @rainbow-me/rainbowkit@latest
```

2. Install dependencies:

```bash
npm install
```

3. Add env vars in `.env`:

```bash
NEXT_PUBLIC_POLYGON_RPC_URL=
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

4. Start the app:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000).

6. Connect wallet from the top-right button.

## Tutorial Walkthrough

### 1) Explore Events (Gamma API)

- Component: `src/components/TutorialFlow.tsx`
- Calls `fetchSpecificTutorialMarkets()` in `src/lib/gamma.ts`
- Uses local route `GET /api/gamma/markets?preset=specific`
- **Why Gamma**: simplest way to show event metadata for tutorial selection

### 2) Choose Sub-Market + Live Focus (Gamma + CLOB Public)

- Calls `GET /api/gamma/event-markets?slug=...` for event sub-markets
- Polls `GET /api/gamma/market?marketId=...` to keep focused odds fresh
- Calls `getOrderBook()` in `src/lib/clob.ts` for best bid/ask context
- **Why split this step**: event choice and exact market choice are separate learning actions

### 3) Wallet Auth + Allowances + Trade (EOA Flow)

- Component: `src/components/TutorialFlow.tsx`
- Step-by-step:
  1. Build L1 client from connected wallet
  2. Derive credentials via `createOrDeriveApiKey()` (L1)
  3. Set Polygon approvals (`approve` + `setApprovalForAll`) for Exchange / Neg-Risk contracts
  4. Build L2 client with derived credentials
  5. Create and post BUY order via `createAndPostOrder()` (L2)
- **Why L1 then L2**: wallet establishes trust once; API credentials execute trades efficiently

### 4) Confirmation + Position Refresh

- Step 5 opens a completion modal with:
  - status
  - filled shares
  - USDC.e spent
  - order id
  - Polygonscan link
- App dispatches `polyteacher:trade-executed` and refreshes Data API position snapshot (`/api/data/positions`)

## Tradeoffs I Made

- Prioritized learning flow over advanced trading features (limit/cancel/edit).
- Used explicit step gating and button states instead of a generalized state machine.
- Kept API wrappers thin and readable, with route-level logging for debugging.
- Optimized for first successful trade UX (amount-in-USDC input, clear completion modal).

## What I'd Improve in Developer Experience

- Add explicit troubleshooting section (wrong chain, allowance not set, empty positions).
- Add stronger typed response models around CLOB/Data API responses.
- Add "reset tutorial" and persisted step progress per connected wallet.
- Add optional mock/sandbox mode for safer local onboarding demos.

## Explicit Non-Goals

- Full portfolio analytics dashboard
- Advanced order management (limit/cancel/edit lifecycle)
- Production-grade backend auth/session layer
- Market making or strategy automation

## Suggested Demo Deliverable

- 3-5 minute walkthrough video or GIF:
  1. Connect wallet
  2. Select event and sub-market
  3. Derive API keys
  4. Set allowances
  5. Execute first trade and show completion modal + position update
