import '../loadEnv.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabaseKey = supabaseServiceKey || supabaseAnonKey;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const enableDebugLogs = process.env.NODE_ENV !== 'production';

const ensureApiKey = (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const headers = new Headers(request.headers);

  if (!headers.has('apikey')) {
    headers.set('apikey', supabaseKey);
  }

  if (!headers.has('Authorization')) {
    const existingAuth = request.headers.get('Authorization');
    headers.set('Authorization', existingAuth ?? `Bearer ${supabaseKey}`);
  }

  const finalRequest = new Request(request, {
    ...init,
    headers,
  });

  if (enableDebugLogs) {
    const apiKeyPreview = headers.get('apikey')?.slice(0, 6) ?? 'none';
    const hasAuth = headers.has('Authorization');
    console.debug('[Backend Supabase fetch] outgoing request', {
      method: finalRequest.method,
      url: finalRequest.url,
      apiKeyPreview,
      hasAuthorizationHeader: hasAuth,
    });
  }

  return fetch(finalRequest);
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    fetch: ensureApiKey,
  },
});

/**
 * Get a Supabase client with user context for RLS
 * Use this in routes to respect Row Level Security policies
 * @param {string} userToken - JWT token from authenticated user
 * @returns {SupabaseClient} Supabase client with user context
 */
export const getSupabaseWithUser = (userToken) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    },
  });
};
