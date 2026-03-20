/**
 * Audit Logger - Tracks all credential operations and tool invocations
 */

import { v4 as uuidv4 } from "uuid";
import { AuditLogEntry, AuditSearchParams } from "./types.js";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export class AuditLogger {
  private logs: AuditLogEntry[] = [];
  private logFilePath: string;
  private logDirectory: string;

  constructor(logDirectory: string = "./audit-logs") {
    this.logDirectory = logDirectory;
    this.logFilePath = join(logDirectory, `audit-${new Date().toISOString().split("T")[0]}.json`);
    this.initializeLogDirectory();
    this.loadExistingLogs();
  }

  private initializeLogDirectory(): void {
    if (!existsSync(this.logDirectory)) {
      mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  private loadExistingLogs(): void {
    if (existsSync(this.logFilePath)) {
      try {
        const data = readFileSync(this.logFilePath, "utf-8");
        this.logs = JSON.parse(data);
      } catch (error) {
        console.error("Failed to load existing audit logs:", error);
        this.logs = [];
      }
    }
  }

  private persistLogs(): void {
    try {
      writeFileSync(this.logFilePath, JSON.stringify(this.logs, null, 2));
    } catch (error) {
      console.error("Failed to persist audit logs:", error);
    }
  }

  log(
    action: AuditLogEntry["action"],
    actor: string,
    success: boolean,
    details: Record<string, unknown>,
    resource?: string,
    errorMessage?: string
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      action,
      actor,
      resource,
      details,
      success,
      errorMessage,
    };

    this.logs.push(entry);
    this.persistLogs();

    return entry;
  }

  search(params: AuditSearchParams): AuditLogEntry[] {
    let results = [...this.logs];

    // Filter by time range
    if (params.time_range) {
      results = results.filter(
        (log) =>
          log.timestamp >= params.time_range!.start && log.timestamp <= params.time_range!.end
      );
    }

    // Filter by actor
    if (params.actor) {
      results = results.filter((log) =>
        log.actor.toLowerCase().includes(params.actor!.toLowerCase())
      );
    }

    // Filter by query (searches in details and resource)
    if (params.query) {
      const query = params.query.toLowerCase();
      results = results.filter((log) => {
        const detailsStr = JSON.stringify(log.details).toLowerCase();
        const resourceStr = (log.resource || "").toLowerCase();
        const actionStr = log.action.toLowerCase();
        return (
          detailsStr.includes(query) || resourceStr.includes(query) || actionStr.includes(query)
        );
      });
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  getRecentLogs(limit: number = 100): AuditLogEntry[] {
    return this.logs.slice(-limit).reverse();
  }

  getStats(): {
    totalLogs: number;
    successfulOperations: number;
    failedOperations: number;
    actionBreakdown: Record<string, number>;
  } {
    const actionBreakdown: Record<string, number> = {};
    let successfulOperations = 0;
    let failedOperations = 0;

    this.logs.forEach((log) => {
      actionBreakdown[log.action] = (actionBreakdown[log.action] || 0) + 1;
      if (log.success) {
        successfulOperations++;
      } else {
        failedOperations++;
      }
    });

    return {
      totalLogs: this.logs.length,
      successfulOperations,
      failedOperations,
      actionBreakdown,
    };
  }
}
