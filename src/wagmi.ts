import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { polygon } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Polymarket Tutorial',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'polymarket-tutorial',
  chains: [polygon],
  ssr: true,
});
