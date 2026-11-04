import { api } from "./api";

export interface Terminal {
  id: string;
  terminalCode: string;
  name: string;
  isActive: boolean;
}

export interface TerminalsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TerminalsResponse {
  data: Terminal[];
  pagination: TerminalsPagination;
}

export async function getTerminals(): Promise<Terminal[]> {
  const response = await api.get<TerminalsResponse>("/terminals", {
    params: {
      isActive: true,
      page: 1,
      limit: 100,
    },
  });

  return response.data.data;
}

export interface TerminalListItem {
  id: string;
  terminalCode: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TerminalsListResponse {
  data: TerminalListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TerminalsFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export async function getTerminalList(
  filters: TerminalsFilters = {},
): Promise<TerminalsListResponse> {
  const response = await api.get<TerminalsListResponse>("/terminals", {
    params: filters,
  });

  return response.data;
}

export async function updateTerminalStatus(
  id: string,
  isActive: boolean,
): Promise<{ message: string }> {
  const response = await api.patch<{ message: string }>(
    `/terminals/${id}/status`,
    { isActive },
  );

  return response.data;
}

export interface UpdateTerminalPayload {
  name: string;
  terminalCode: string;
}

export async function updateTerminal(
  id: string,
  payload: UpdateTerminalPayload,
): Promise<{ message: string }> {
  const response = await api.patch<{ message: string }>(
    `/terminals/${id}`,
    payload,
  );

  return response.data;
}

export interface PairingCodeResponse {
  message: string;
  terminalCode: string;
  pairingCode: string;
  expiresAt: string;
}

export async function generateTerminalPairingCode(
  id: string,
): Promise<PairingCodeResponse> {
  const response = await api.post<PairingCodeResponse>(
    `/terminals/${id}/pairing-code`,
  );

  return response.data;
}

export async function unpairTerminal(id: string): Promise<{ message: string }> {
  const response = await api.post<{ message: string }>(
    `/terminals/${id}/unpair`,
  );

  return response.data;
}
