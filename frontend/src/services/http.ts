import { supabase } from './supabase';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Get the current auth token from the Supabase session.
 */
export const getAuthToken = async (): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
};

/**
 * Build request headers, attaching the bearer token when available.
 */
const authHeaders = (token: string | null, extra?: Record<string, string>): HeadersInit => ({
  ...extra,
  ...(token && { Authorization: `Bearer ${token}` }),
});

/**
 * Perform an authenticated request against the API and parse the JSON response.
 * On a non-OK response, throws an Error using the server-provided message,
 * falling back to `errorMessage`.
 *
 * @param path - Path relative to API_BASE_URL (e.g. '/documents/upload')
 * @param errorMessage - Fallback error message when the request fails
 * @param init - Standard fetch init; `Authorization` is added automatically
 */
export const apiRequest = async <T = Record<string, unknown>>(
  path: string,
  errorMessage: string,
  init: RequestInit = {}
): Promise<T> => {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: authHeaders(token, init.headers as Record<string, string> | undefined),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: errorMessage }));
    throw new Error(body.error || errorMessage);
  }

  return response.json();
};

/**
 * Build a query string from a set of optional params, omitting empty values.
 * Returns an empty string when no params are set (no leading '?').
 */
export const buildQueryString = (params: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.append(key, value);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

/**
 * Build a multipart FormData body from files plus scalar fields.
 * Fields with `undefined` values are skipped.
 */
export const buildFormData = (
  files: File[],
  fields: Record<string, string | undefined> = {}
): FormData => {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      formData.append(key, value);
    }
  }
  return formData;
};
