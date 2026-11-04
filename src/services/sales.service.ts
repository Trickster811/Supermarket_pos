import { api } from "./api";

export interface SaleCashier {
  id: string;
  fullName: string;
  username: string;
}

export interface SaleTerminal {
  id: string;
  terminalCode: string;
  name: string;
}

export interface SaleReceipt {
  id: string;
  receiptNumber: string;
  issuedAt: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  unitOfMeasure: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
  createdAt: string;
}

export interface Sale {
  id: string;
  transactionUuid: string;
  cashierId: string;
  terminalId: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  currencyCode: string;
  paymentMethod: "CASH" | "MOBILE_MONEY";
  paymentStatus: "CASH_RECEIVED" | "CASHIER_CONFIRMED" | "PROVIDER_VERIFIED";
  amountReceived: string | null;
  changeAmount: string | null;
  mobileMoneyProvider: "MTN_MOMO" | "ORANGE_MONEY" | null;
  paymentReference: string | null;
  status: "COMPLETED" | "VOIDED";
  deviceCreatedAt: string | null;
  createdAt: string;

  cashier?: SaleCashier;
  terminal?: SaleTerminal;
  receipt?: SaleReceipt | null;
  items?: SaleItem[];

  _count?: {
    items: number;
  };
}

export interface SalesSummary {
  totalAmount: string;
}

export interface SalesFilters {
  page?: number;
  limit?: number;
  terminalId?: string;
  cashierId?: string;
  dateFrom?: string;
  dateTo?: string;
  paymentMethod?: "CASH" | "MOBILE_MONEY";
  status?: "COMPLETED" | "VOIDED";
}

export interface SalesPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SalesResponse {
  data: Sale[];
  pagination: SalesPagination;
  summary: SalesSummary;
}

export async function getSales(
  filters: SalesFilters = {},
): Promise<SalesResponse> {
  const response = await api.get<SalesResponse>("/sales", {
    params: filters,
  });

  return response.data;
}

export async function getSaleById(id: string): Promise<Sale> {
  const response = await api.get<Sale>(`/sales/${id}`);

  return response.data;
}
