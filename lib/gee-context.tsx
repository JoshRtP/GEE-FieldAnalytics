'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { EEStatus } from './gee';
import { resetGeeAvailabilityCache } from './api';

interface GEEContextValue {
  status: EEStatus;
  error: string | null;
  /** Re-check whether the GEE backend is reachable. */
  login: () => Promise<void>;
}

const GEEContext = createContext<GEEContextValue>({
  status: 'idle',
  error: null,
  login: async () => {},
});

async function pingBackend(): Promise<boolean> {
  try {
    const res = await fetch('/api/gee/health', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.gee_available === true;
  } catch {
    return false;
  }
}

export function GEEProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<EEStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const checkBackend = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setStatus('initializing');

    // Reset cached result so api.ts re-evaluates on next call.
    resetGeeAvailabilityCache();

    const available = await pingBackend();

    if (available) {
      setStatus('ready');
    } else {
      setStatus('error');
      setError(
        'GEE backend is unreachable. Start the Python backend and set GEE_BACKEND_URL in .env.local'
      );
    }
    inFlight.current = false;
  }, []);

  // Auto-check on mount so the UI reflects backend state immediately.
  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  return (
    <GEEContext.Provider value={{ status, error, login: checkBackend }}>
      {children}
    </GEEContext.Provider>
  );
}

export function useGEE() {
  return useContext(GEEContext);
}
