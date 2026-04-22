import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.');
}

const enableDebugLogs = import.meta.env.DEV;

const ensureApiKey: typeof fetch = (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const headers = new Headers(request.headers);

  if (!headers.has('apikey')) {
    headers.set('apikey', supabaseAnonKey);
  }

  if (!headers.has('Authorization')) {
    const existingAuth = request.headers.get('Authorization');
    headers.set('Authorization', existingAuth ?? `Bearer ${supabaseAnonKey}`);
  }

  const finalRequest = new Request(request, {
    ...init,
    headers,
  });

  if (enableDebugLogs) {
    const apiKey = headers.get('apikey');
    const authorization = headers.get('Authorization');
    const maskedApiKey = apiKey ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}` : 'none';
    const maskedAuth = authorization ? `${authorization.slice(0, 10)}…` : 'none';
    console.debug(`[Supabase fetch] ${finalRequest.method} ${finalRequest.url}`, {
      apikey: maskedApiKey,
      authorization: maskedAuth,
    });
  }

  return fetch(finalRequest).then(async (response) => {
    if (enableDebugLogs) {
      console.debug(
        `[Supabase fetch] response ${response.status} ${finalRequest.method} ${finalRequest.url}`
      );
      if (!response.ok) {
        try {
          const clone = response.clone();
          const text = await clone.text();
          console.debug('[Supabase fetch] error body', text);
        } catch (err) {
          console.debug('[Supabase fetch] error body unreadable', err);
        }
      }
    }
    return response;
  });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: ensureApiKey,
  },
});
