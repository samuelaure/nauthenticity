import { AsyncLocalStorage } from 'async_hooks';

export interface LogContext {
  jobId?: string;
  username?: string;
  traceId?: string;
  [key: string]: any;
}

export const logContextStorage = new AsyncLocalStorage<LogContext>();
