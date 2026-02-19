/**
 * JIRA API HTTP client with retry logic and concurrency control
 * Story: E1-S05
 */

import type { JMLConfig } from '../types/config.js';
import { AuthenticationError } from '../errors/AuthenticationError.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import { RateLimitError } from '../errors/RateLimitError.js';
import { JiraServerError } from '../errors/JiraServerError.js';
import { NetworkError } from '../errors/NetworkError.js';
import { ValidationError } from '../errors/ValidationError.js';
import type { JiraErrorResponse } from '../types/jira-api.js';

/**
 * HTTP methods supported by the client
 */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Interface for JIRA HTTP client
 */
export interface JiraClient {
  get<T = unknown>(endpoint: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
  post<T = unknown>(endpoint: string, body: unknown, timeoutMs?: number): Promise<T>;
  put<T = unknown>(endpoint: string, body: unknown, timeoutMs?: number): Promise<T>;
  delete<T = unknown>(endpoint: string, timeoutMs?: number): Promise<T>;
}

/**
 * Semaphore for limiting concurrent requests
 */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const resolve = this.queue.shift();
    if (resolve) {
      this.permits--;
      resolve();
    }
  }
}

/**
 * Implementation of JIRA HTTP client with retry logic and concurrency control
 */
export class JiraClientImpl implements JiraClient {
  private readonly baseUrl: string;
  private readonly pat: string;
  private readonly semaphore: Semaphore;
  private readonly maxRetries = 3;
  private readonly retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s
  private readonly defaultTimeout: number;

  constructor(config: JMLConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.pat = config.auth.token;
    this.semaphore = new Semaphore(10); // Max 10 concurrent requests

    // Initialize default timeout from config
    this.defaultTimeout = config.timeout?.default ?? 10000;
  }

  /**
   * Make a GET request
   */
  async get<T = unknown>(endpoint: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T> {
    const url = this.buildUrl(endpoint, params);
    return this.request<T>('GET', url, undefined, timeoutMs);
  }

  /**
   * Make a POST request
   */
  async post<T = unknown>(endpoint: string, body: unknown, timeoutMs?: number): Promise<T> {
    const url = this.buildUrl(endpoint);
    return this.request<T>('POST', url, body, timeoutMs);
  }

  /**
   * Make a PUT request
   */
  async put<T = unknown>(endpoint: string, body: unknown, timeoutMs?: number): Promise<T> {
    const url = this.buildUrl(endpoint);
    return this.request<T>('PUT', url, body, timeoutMs);
  }

  /**
   * Make a DELETE request
   */
  async delete<T = unknown>(endpoint: string, timeoutMs?: number): Promise<T> {
    const url = this.buildUrl(endpoint);
    return this.request<T>('DELETE', url, undefined, timeoutMs);
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(endpoint: string, params?: Record<string, unknown>): string {
    const url = `${this.baseUrl}${endpoint}`;
    
    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        searchParams.append(key, String(value));
      }
    }

    return `${url}?${searchParams.toString()}`;
  }

  /**
   * Make HTTP request with retry logic and concurrency control
   */
  private async request<T>(method: HttpMethod, url: string, body?: unknown, timeoutOverride?: number): Promise<T> {
    // Acquire semaphore slot
    await this.semaphore.acquire();

    try {
      // Use provided timeout override, or default to configured default timeout
      const timeout = timeoutOverride ?? this.defaultTimeout;

      // Attempt request with retries
      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          // Create abort controller for timeout
          const controller = new AbortController();

          // Only set timeout if not Infinity (Phase 2.2 Hotfix)
          // When timeout is Infinity, we rely on progress-based timeout instead
          const timeoutId = timeout !== Infinity
            ? setTimeout(() => controller.abort(), timeout)
            : undefined;

          // Make request
          const response = await fetch(url, {
            method,
            headers: {
              'Authorization': `Bearer ${this.pat}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });

          // Only clear timeout if it was set
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
          }

          // Handle successful response
          if (response.ok) {
            // 204 No Content returns empty body
            if (response.status === 204) {
              return {} as T;
            }
            return (await response.json()) as T;
          }

          // Parse error response
          const errorData: JiraErrorResponse = (await response.json().catch((): JiraErrorResponse => ({
            errorMessages: ['Unknown error'],
          }))) as JiraErrorResponse;

          // Retry on 429 (rate limit) or 503 (service unavailable)
          if (response.status === 429 || response.status === 503) {
            if (attempt < this.maxRetries - 1) {
              // Rate limiting retry
              const delay = this.retryDelays[attempt]!;
              await this.sleep(delay);
              continue;
            }

            // Max retries exceeded
            if (response.status === 429) {
              throw new RateLimitError(
                errorData.errorMessages?.[0] || 'Rate limit exceeded',
                { status: response.status, url, attempt: attempt + 1 }
              );
            } else {
              throw new JiraServerError(
                errorData.errorMessages?.[0] || 'Service temporarily unavailable',
                { status: response.status, url, attempt: attempt + 1 }
              );
            }
          }

          // Don't retry on client errors (4xx except 429)
          throw this.normalizeError(response.status, errorData, url);

        } catch (error) {
          // Retry on network errors (timeout, connection refused, etc.)
          if (error instanceof Error && (
            error.name === 'AbortError' ||
            error.message.includes('fetch') ||
            error.message.includes('network')
          )) {
            if (attempt < this.maxRetries - 1) {
              const delay = this.retryDelays[attempt]!;
              // Network error retry
              await this.sleep(delay);
              continue;
            }

            // Max retries exceeded
            throw new NetworkError(
              'Network request failed after retries',
              { url, attempt: attempt + 1, originalError: error.message }
            );
          }

          // Re-throw if it's already one of our error types
          if (
            error instanceof AuthenticationError ||
            error instanceof NotFoundError ||
            error instanceof ValidationError ||
            error instanceof RateLimitError ||
            error instanceof JiraServerError ||
            error instanceof NetworkError
          ) {
            throw error;
          }

          // Unknown error
          throw new NetworkError(
            'Unexpected error during request',
            { url, originalError: error instanceof Error ? error.message : String(error) }
          );
        }
      }

      // TypeScript can't prove the loop always exits via return/throw, so we need this
      // to satisfy the type checker. This line should never execute at runtime.
      /* istanbul ignore next */
      throw new Error(`Unreachable: retry loop completed without exiting`);
    } finally {
      // Always release semaphore slot
      this.semaphore.release();
    }
  }

  /**
   * Normalize JIRA API error responses into typed errors
   * Preserves original JIRA response for debugging
   */
  private normalizeError(status: number, errorData: JiraErrorResponse, url: string): Error {
    const message = errorData.errorMessages?.[0] || 'Unknown error';
    const context = { status, url };

    switch (status) {
      case 401:
        return new AuthenticationError(
          `Authentication failed: ${message}. Check JIRA_PAT in .env file.`,
          { status, url }
        );
      
      case 403:
        return new AuthenticationError(
          `Forbidden: ${message}. PAT may lack required permissions.`,
          { status, url }
        );
      
      case 404:
        return new NotFoundError(
          `Resource not found: ${message}. Check project key, issue type, or field names.`,
          context
        );
      
      case 400: {
        // Validation error with field-level details
        // Combine errorMessages and field-specific errors
        const fieldErrors = errorData.errors || {};
        const allMessages = [
          ...(errorData.errorMessages || []),
          ...Object.entries(fieldErrors).map(([field, msg]) => `${field}: ${String(msg)}`)
        ];
        
        return new ValidationError(
          allMessages.join('; ') || 'Validation failed',
          { ...context, fields: fieldErrors },
          errorData // Preserve original JIRA response
        );
      }
      
      case 500:
      case 502:
      case 503:
      case 504:
        return new JiraServerError(
          `JIRA server error (${status}): ${message}. Try again later or contact JIRA administrator.`,
          context
        );
      
      default:
        return new JiraServerError(
          `HTTP ${status}: ${message}`,
          context
        );
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
