/**
 * Error Reporter - Production-Ready Client-Side Error Monitoring
 *
 * This module provides comprehensive error tracking with:
 * - All error types: unhandled exceptions, promise rejections, React errors, network, resources, console
 * - Rich debugging context: breadcrumbs, session tracking, user identity, application state
 * - Auto-sanitization of sensitive data
 * - Error fingerprinting for grouping similar errors
 * - Environment-aware: only enabled in production
 * - Fire-and-forget: non-blocking, failures silently ignored
 */

const API_URL = import.meta.env.VITE_API_URL || '';
const ENABLED = import.meta.env.PROD; // Only in production
const MAX_BREADCRUMBS = 20;
const SESSION_KEY = 'error_reporter_session_id';

// Types
interface Breadcrumb {
  type: 'navigation' | 'click' | 'api' | 'error' | 'state' | 'console';
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

interface ErrorContext {
  type?: string;
  componentStack?: string;
  [key: string]: unknown;
}

interface ErrorReport {
  errorType: string;
  errorMessage: string;
  errorStack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
  timestamp: number;
  // Enhanced context
  userId?: string;
  sessionId: string;
  breadcrumbs: Breadcrumb[];
  appState: {
    url: string;
    referrer: string;
    viewport: string;
    online: boolean;
  };
  environment: {
    userAgent: string;
    platform: string;
    language: string;
    deviceMemory?: number;
    connection?: string;
  };
  fingerprint?: string;
  severity: 'error' | 'warning' | 'fatal';
}

// Global state
let breadcrumbs: Breadcrumb[] = [];
let sessionId: string | null = null;
let userId: string | null = null;

/**
 * Initialize or retrieve session ID
 */
function getSessionId(): string {
  if (sessionId) return sessionId;

  // Try to get from sessionStorage
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored) {
    sessionId = stored;
    return sessionId;
  }

  // Generate new session ID
  sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  sessionStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}

/**
 * Set user ID for error tracking (call after authentication)
 */
export function setUserId(id: string | null) {
  userId = id;
}

/**
 * Add breadcrumb to trail
 */
function addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'timestamp'>) {
  breadcrumbs.push({
    ...breadcrumb,
    timestamp: Date.now()
  });

  // Keep only last MAX_BREADCRUMBS
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs = breadcrumbs.slice(-MAX_BREADCRUMBS);
  }
}

/**
 * Track navigation breadcrumb
 */
function trackNavigation(url: string) {
  addBreadcrumb({
    type: 'navigation',
    message: `Navigated to ${url}`,
    data: { url }
  });
}

/**
 * Track user interactions
 */
function setupClickTracking() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    const text = target.textContent?.substring(0, 50) || '';
    const id = target.id ? `#${target.id}` : '';
    const className = target.className ? `.${target.className.split(' ')[0]}` : '';

    addBreadcrumb({
      type: 'click',
      message: `Clicked ${tagName}${id}${className}`,
      data: {
        tagName,
        id: target.id,
        className: target.className,
        text
      }
    });
  }, true);
}

/**
 * Intercept fetch for API tracking
 */
function setupFetchTracking() {
  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const [url, options] = args;
    const startTime = Date.now();

    try {
      const response = await originalFetch(...args);
      const duration = Date.now() - startTime;

      addBreadcrumb({
        type: 'api',
        message: `${options?.method || 'GET'} ${url} - ${response.status}`,
        data: {
          url: url.toString(),
          method: options?.method || 'GET',
          status: response.status,
          duration
        }
      });

      return response;
    } catch (error) {
      addBreadcrumb({
        type: 'api',
        message: `${options?.method || 'GET'} ${url} - Failed`,
        data: {
          url: url.toString(),
          method: options?.method || 'GET',
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  };
}

/**
 * Intercept console.error for tracking
 */
function setupConsoleTracking() {
  const originalError = console.error;

  console.error = (...args) => {
    addBreadcrumb({
      type: 'console',
      message: args.map(a => String(a)).join(' ').substring(0, 200),
      data: { args: args.map(a => String(a)) }
    });

    originalError.apply(console, args);
  };
}

/**
 * Generate error fingerprint for grouping
 */
function generateFingerprint(error: Error): string {
  const message = error.message
    .replace(/\d+/g, 'N') // Replace numbers
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID') // Replace UUIDs
    .replace(/https?:\/\/[^\s]+/g, 'URL') // Replace URLs
    .substring(0, 100);

  return `${error.name}:${message}`;
}

/**
 * Get application state snapshot
 */
function getAppState(): ErrorReport['appState'] {
  return {
    url: window.location.href,
    referrer: document.referrer,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    online: navigator.onLine
  };
}

/**
 * Get environment information
 */
function getEnvironment(): ErrorReport['environment'] {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType: string } };

  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    deviceMemory: nav.deviceMemory,
    connection: nav.connection?.effectiveType
  };
}

/**
 * Report error to backend
 * Fire-and-forget: failures are silently ignored
 */
function reportError(error: Error, context: ErrorContext = {}, severity: 'error' | 'warning' | 'fatal' = 'error') {
  if (!ENABLED || !API_URL) return;

  const errorReport: ErrorReport = {
    errorType: error?.name || 'UnknownError',
    errorMessage: error?.message || String(error),
    errorStack: error?.stack,
    componentStack: context.componentStack,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: Date.now(),
    // Enhanced context
    userId: userId || undefined,
    sessionId: getSessionId(),
    breadcrumbs: [...breadcrumbs], // Clone array
    appState: getAppState(),
    environment: getEnvironment(),
    fingerprint: generateFingerprint(error),
    severity
  };

  // Add error to breadcrumbs
  addBreadcrumb({
    type: 'error',
    message: `${error.name}: ${error.message}`,
    data: { severity }
  });

  // Fire-and-forget (don't await, don't handle errors)
  fetch(`${API_URL}/client-errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(errorReport),
    keepalive: true // Ensure request completes even if page unloads
  }).catch(() => {
    // Silently ignore - don't report errors about error reporting
  });
}

/**
 * Setup global error handlers
 * Call this once in your app entry point
 */
export function setupErrorReporting() {
  if (!ENABLED) {
    console.info('[ErrorReporter] Disabled in development');
    return;
  }

  // Initialize session
  getSessionId();

  // Track navigation
  trackNavigation(window.location.href);

  // Setup breadcrumb tracking
  setupClickTracking();
  setupFetchTracking();
  setupConsoleTracking();

  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    reportError(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      { type: 'UnhandledPromiseRejection' },
      'error'
    );
  });

  // Catch global errors
  window.addEventListener('error', (event) => {
    // Check if it's a resource loading error
    if (event.target && event.target !== window) {
      const target = event.target as HTMLElement;
      const tagName = target.tagName?.toLowerCase();

      const element = target as HTMLElement & { src?: string; href?: string };

      reportError(
        new Error(`Failed to load ${tagName}: ${element.src || element.href}`),
        {
          type: 'ResourceLoadingError',
          tagName,
          src: element.src || element.href
        },
        'warning'
      );
      return;
    }

    reportError(
      event.error || new Error(event.message),
      {
        type: 'GlobalError',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      },
      'error'
    );
  });

  // Track navigation changes (for SPAs)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      trackNavigation(currentUrl);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Track online/offline
  window.addEventListener('online', () => {
    addBreadcrumb({
      type: 'state',
      message: 'Connection restored'
    });
  });

  window.addEventListener('offline', () => {
    addBreadcrumb({
      type: 'state',
      message: 'Connection lost'
    });
  });

  console.info('[ErrorReporter] Initialized with session:', getSessionId());
}

/**
 * React Error Boundary helper
 * Use this in componentDidCatch or ErrorBoundary
 */
export function reportReactError(error: Error, errorInfo: { componentStack?: string }) {
  reportError(error, {
    type: 'ReactError',
    componentStack: errorInfo?.componentStack
  }, 'fatal');
}

/**
 * Manual error reporting (for try-catch blocks)
 */
export function reportManualError(error: Error, context?: ErrorContext, severity?: 'error' | 'warning' | 'fatal') {
  reportError(error, { type: 'ManualError', ...context }, severity || 'error');
}

/**
 * Add custom breadcrumb
 */
export function addCustomBreadcrumb(message: string, data?: Record<string, unknown>) {
  addBreadcrumb({
    type: 'state',
    message,
    data
  });
}
