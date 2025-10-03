import { v4 as uuidv4 } from 'uuid';

export interface LogEntry {
  timestamp: string;
  traceId: string;
  brand: 'DB' | 'CI';
  action: string;
  mode: 'dry_run' | 'execute';
  status: 'success' | 'error' | 'warning';
  duration: number; // milliseconds
  notes: string[];
  error?: string;
}

export interface LogFilters {
  traceId?: string;
  brand?: 'DB' | 'CI';
  action?: string;
  status?: 'success' | 'error' | 'warning';
}

// In-memory log storage (production would use a database)
const logs: LogEntry[] = [];

/**
 * Generates a unique trace ID using UUID v4
 * @returns UUID v4 string
 */
export function createTraceId(): string {
  return uuidv4();
}

/**
 * Adds a log entry and auto-cleans old logs
 * @param entry - Log entry to add
 */
export function addLog(entry: LogEntry): void {
  logs.push(entry);

  // Auto-clean logs older than retention period
  const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '60', 10);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffTimestamp = cutoffDate.toISOString();

  // Remove logs older than cutoff
  let i = 0;
  while (i < logs.length) {
    if (logs[i]!.timestamp < cutoffTimestamp) {
      logs.splice(i, 1);
    } else {
      i++;
    }
  }
}

/**
 * Retrieves logs with optional filtering
 * @param filters - Optional filters for traceId, brand, action, status
 * @returns Array of log entries sorted by timestamp descending
 */
export function getLogs(filters?: LogFilters): LogEntry[] {
  let filteredLogs = [...logs];

  if (filters) {
    if (filters.traceId) {
      filteredLogs = filteredLogs.filter(log => log.traceId === filters.traceId);
    }
    if (filters.brand) {
      filteredLogs = filteredLogs.filter(log => log.brand === filters.brand);
    }
    if (filters.action) {
      filteredLogs = filteredLogs.filter(log => log.action === filters.action);
    }
    if (filters.status) {
      filteredLogs = filteredLogs.filter(log => log.status === filters.status);
    }
  }

  // Sort by timestamp descending (newest first)
  return filteredLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Recursively masks sensitive data in objects
 * @param obj - Object to mask
 * @returns New object with sensitive values replaced with '***MASKED***'
 */
export function maskSecrets(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => maskSecrets(item));
  }

  const masked: any = {};
  const sensitiveKeys = [
    'grantkey',
    'password',
    'secret',
    'token',
    'key',
    'authorization'
  ];

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sensitiveKey =>
      lowerKey.includes(sensitiveKey)
    );

    if (isSensitive) {
      masked[key] = '***MASKED***';
    } else if (value && typeof value === 'object') {
      masked[key] = maskSecrets(value);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}
