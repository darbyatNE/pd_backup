/**
 * Client Error Logger - Modular Error Reporting for Frontend
 *
 * This module is completely isolated and optional.
 * To disable: Set ENABLE_CLIENT_ERROR_LOGGING=false or don't import this middleware.
 *
 * Features:
 * - Logs frontend errors to CloudWatch for centralized monitoring
 * - Auto-sanitizes sensitive data (passwords, tokens, SSNs, credit cards)
 * - Fire-and-forget async logging (doesn't block response)
 * - Session tracking and error fingerprinting
 * - Breadcrumb support for debugging user journeys
 */

import { CloudWatchLogsClient, PutLogEventsCommand, CreateLogStreamCommand } from '@aws-sdk/client-cloudwatch-logs';

class ClientErrorLogger {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.logGroupName = options.logGroupName || process.env.FRONTEND_ERROR_LOG_GROUP || '/client/powerdime-frontend-errors';
    this.region = options.region || process.env.AWS_REGION || 'us-east-1';

    if (this.enabled) {
      this.client = new CloudWatchLogsClient({ region: this.region });
      this.streamCache = new Map(); // Cache to avoid recreating streams
    }
  }

  /**
   * Express middleware to handle client error reports
   */
  middleware() {
    return async (req, res) => {
      // If disabled, return 204 No Content
      if (!this.enabled) {
        return res.status(204).send();
      }

      try {
        const {
          errorType,
          errorMessage,
          errorStack,
          componentStack,
          url,
          userAgent,
          timestamp,
          // Enhanced debugging context
          userId,
          sessionId,
          breadcrumbs,
          appState,
          environment,
          fingerprint,
          severity
        } = req.body;

        // Validate required fields
        if (!errorMessage) {
          return res.status(400).json({ error: 'errorMessage is required' });
        }

        // Sanitize error data (remove sensitive information)
        const sanitizedData = this._sanitizeErrorData({
          errorType,
          errorMessage,
          errorStack,
          componentStack,
          url,
          userAgent,
          timestamp: timestamp || Date.now(),
          userId,
          sessionId,
          breadcrumbs,
          appState,
          environment,
          fingerprint,
          severity: severity || 'error'
        });

        // Log to CloudWatch asynchronously (don't await)
        this._logToCloudWatch(sanitizedData).catch(err => {
          // Silently log error but don't expose to client
          console.error('[ClientErrorLogger] Failed to log to CloudWatch:', err.message);
        });

        // Respond immediately (don't wait for CloudWatch)
        res.status(200).json({ success: true });
      } catch (error) {
        console.error('[ClientErrorLogger] Error processing request:', error);
        res.status(500).json({ error: 'Failed to process error report' });
      }
    };
  }

  /**
   * Sanitize error data to remove sensitive information
   */
  _sanitizeErrorData(data) {
    const sensitivePatterns = [
      /password["\s:=]+[^\s&"]*/gi,
      /token["\s:=]+[^\s&"]*/gi,
      /api[_-]?key["\s:=]+[^\s&"]*/gi,
      /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
      /\b\d{16}\b/g, // Credit card
      /bearer\s+[^\s]*/gi,
      /authorization["\s:=]+[^\s&"]*/gi
    ];

    const sanitize = (str) => {
      if (typeof str !== 'string') return str;
      let sanitized = str;
      sensitivePatterns.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      });
      return sanitized;
    };

    return {
      ...data,
      errorMessage: sanitize(data.errorMessage),
      errorStack: sanitize(data.errorStack),
      url: sanitize(data.url),
      breadcrumbs: data.breadcrumbs?.map(b => ({
        ...b,
        data: sanitize(JSON.stringify(b.data || {}))
      }))
    };
  }

  async _logToCloudWatch(errorData) {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const streamName = `errors-${date}`;

    // Ensure log stream exists (cached to avoid redundant API calls)
    await this._ensureLogStream(streamName);

    // Write to CloudWatch
    await this.client.send(new PutLogEventsCommand({
      logGroupName: this.logGroupName,
      logStreamName: streamName,
      logEvents: [{
        message: JSON.stringify({
          ...errorData,
          serverTimestamp: new Date().toISOString(),
          // Add error fingerprint if not provided
          fingerprint: errorData.fingerprint || this._generateFingerprint(errorData)
        }),
        timestamp: errorData.timestamp
      }]
    }));
  }

  /**
   * Generate error fingerprint for grouping similar errors
   */
  _generateFingerprint(errorData) {
    // Normalize error message by removing dynamic parts (numbers, IDs, timestamps)
    const normalized = (errorData.errorMessage || '')
      .replace(/\d+/g, 'N')
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID')
      .replace(/https?:\/\/[^\s]+/g, 'URL');

    return `${errorData.errorType}:${normalized}`.substring(0, 100);
  }

  async _ensureLogStream(streamName) {
    // Check cache first
    if (this.streamCache.has(streamName)) {
      return;
    }

    try {
      await this.client.send(new CreateLogStreamCommand({
        logGroupName: this.logGroupName,
        logStreamName: streamName
      }));
      this.streamCache.set(streamName, true);
    } catch (err) {
      // Stream might already exist - that's fine
      if (err.name === 'ResourceAlreadyExistsException') {
        this.streamCache.set(streamName, true);
      } else {
        throw err;
      }
    }
  }
}

// Export singleton instance
const clientErrorLogger = new ClientErrorLogger({
  enabled: process.env.ENABLE_CLIENT_ERROR_LOGGING !== 'false' // Enable by default
});

export default clientErrorLogger;
