/**
 * GEE status types.
 *
 * All actual Earth Engine computation now goes through the Python backend
 * (gee-backend/main.py) via the Next.js API proxy at /api/gee/*.
 *
 * The browser-side @google/earthengine SDK is no longer used — it is a
 * Node.js wrapper that does not work reliably in a browser context.
 */

export type EEStatus = 'idle' | 'authenticating' | 'initializing' | 'ready' | 'error';

// Kept for backward-compat with any code that imports EEInstance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EEInstance = any;

/** GEE project used by the Python backend. */
export const GEE_PROJECT = 'gen-lang-client-0499108456';


