'use client';

import { useEffect, useState } from 'react';

const POPUP_MESSAGE_TYPE = 'gee_oauth_result';

export default function OAuthCallbackPage() {
  const [state, setState] = useState<'processing' | 'done' | 'error'>('processing');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');
      const errorDesc = params.get('error_description');

      if (error) {
        if (window.opener) {
          window.opener.postMessage(
            { type: POPUP_MESSAGE_TYPE, error: errorDesc ?? error },
            window.location.origin
          );
        }
        setMessage(`Authentication failed: ${errorDesc ?? error}`);
        setState('error');
      } else if (code) {
        if (window.opener) {
          window.opener.postMessage(
            { type: POPUP_MESSAGE_TYPE, code },
            window.location.origin
          );
          setMessage('Authentication successful! Closing...');
          setState('done');
          setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 800);
        } else {
          // Fallback: no opener (e.g. user navigated directly) — just show success
          setMessage('Authentication successful! You can close this window.');
          setState('done');
        }
      } else {
        if (window.opener) {
          window.opener.postMessage(
            { type: POPUP_MESSAGE_TYPE, error: 'no_code' },
            window.location.origin
          );
        }
        setMessage('No authorization code received. Please try again.');
        setState('error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      try {
        if (window.opener) {
          window.opener.postMessage(
            { type: POPUP_MESSAGE_TYPE, error: msg },
            window.location.origin
          );
        }
      } catch { /* ignore */ }
      setMessage(`Unexpected error: ${msg}`);
      setState('error');
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
      <div className="text-center space-y-4 p-8 max-w-sm">
        {state === 'processing' && (
          <div className="h-8 w-8 rounded-full border-2 border-[#9AD1DC] border-t-transparent animate-spin mx-auto" />
        )}
        {state === 'done' && (
          <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {state === 'error' && (
          <div className="h-8 w-8 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
            <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )}
        <p className="text-sm text-gray-300">{message}</p>
        {state !== 'processing' && (
          <p className="text-xs text-gray-500">You can close this window and return to the app.</p>
        )}
      </div>
    </div>
  );
}
