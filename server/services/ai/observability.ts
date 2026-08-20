import { AiRequestLog } from './types.ts';

class AiObservabilityService {
  private logs: AiRequestLog[] = [];
  private maxLogs = 200;

  logRequest(log: AiRequestLog) {
    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
  }

  getLogs(limit = 50): AiRequestLog[] {
    return this.logs.slice(0, limit);
  }
}

export const aiObservability = new AiObservabilityService();
