import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';

const API_BASE = 'https://api.todoist.com/api/v1';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

class TodoistApiClient {
  private client: AxiosInstance;

  constructor(apiToken: string) {
    if (!apiToken) {
      throw new Error('TODOIST_API_TOKEN is required');
    }

    this.client = axios.create({
      baseURL: API_BASE,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          
          if (axiosError.response?.status === 429) {
            const retryAfter = parseInt(
              axiosError.response.headers['retry-after'] as string || '60',
              10
            );
            await this.sleep(retryAfter * 1000);
            continue;
          }
          
          if (axiosError.response?.status && axiosError.response.status >= 500) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            await this.sleep(delay);
            continue;
          }
          
          throw error;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }

  async get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    return this.withRetry(async () => {
      const config: AxiosRequestConfig = {};
      if (params) {
        config.params = params;
      }
      const response = await this.client.get<T>(endpoint, config);
      return response.data;
    });
  }

  async post<T>(endpoint: string, data?: Record<string, unknown>): Promise<T> {
    return this.withRetry(async () => {
      const response = await this.client.post<T>(endpoint, data);
      return response.data;
    });
  }

  async delete(endpoint: string): Promise<void> {
    return this.withRetry(async () => {
      await this.client.delete(endpoint);
    });
  }
}

let clientInstance: TodoistApiClient | null = null;

export function getApiClient(): TodoistApiClient {
  if (!clientInstance) {
    const token = process.env.TODOIST_API_TOKEN;
    if (!token) {
      throw new Error('TODOIST_API_TOKEN environment variable is not set');
    }
    clientInstance = new TodoistApiClient(token);
  }
  return clientInstance;
}

export function createResponse<T>(success: boolean, data?: T, error?: { code: string; message: string; details?: unknown }) {
  if (success) {
    return { success: true, data };
  }
  return { success: false, error };
}

export function handleApiError(error: unknown): { code: string; message: string; details?: unknown } {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ message?: string }>;
    const status = axiosError.response?.status || 500;
    const message = axiosError.response?.data?.message || axiosError.message;
    
    return {
      code: `HTTP_${status}`,
      message,
      details: axiosError.response?.data,
    };
  }
  
  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
    };
  }
  
  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
  };
}
