import { api } from "./api";

export interface AuditLogUser {
  id: string;
  fullName: string;
  username: string;
  role: string;
}

export interface AuditLogTerminal {
  id: string;
  terminalCode: string;
  name: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  terminalId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  user: AuditLogUser | null;
  terminal: AuditLogTerminal | null;
}

export interface AuditLogFilters {
  search?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogResponse {
  logs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getAuditLogs(
  filters: AuditLogFilters = {},
): Promise<AuditLogResponse> {
  const response = await api.get<AuditLogResponse>("/audit-logs", {
    params: filters,
  });

  return response.data;
}
