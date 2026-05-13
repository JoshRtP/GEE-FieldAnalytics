'use client';

import { GEEProvider } from '@/lib/gee-context';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <GEEProvider>{children}</GEEProvider>;
}
