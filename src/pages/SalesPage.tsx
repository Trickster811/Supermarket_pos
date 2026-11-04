import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import {
  getSales,
  getSaleById,
  type Sale,
  type SalesPagination,
  type SalesFilters,
  type SalesSummary,
} from "../services/sales.service";
import { getCashiers, type Cashier } from "../services/users.service";
import { getTerminals, type Terminal } from "../services/terminals.service";

function formatMoney(value: string | number, currency = "XAF") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: "bg-green-100 text-green-700",
    VOIDED: "bg-red-100 text-red-700",
    CASH_RECEIVED: "bg-green-100 text-green-700",
    CASHIER_CONFIRMED: "bg-blue-100 text-blue-700",
    PROVIDER_VERIFIED: "bg-purple-100 text-purple-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        styles[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function SaleDetailsModal({
  sale,
  loading,
  onClose,
}: {
  sale: Sale | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (!sale && !loading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Sale Details
            </h2>
            <p className="text-sm text-gray-500">
              {sale?.receipt?.receiptNumber ?? "Loading sale..."}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-500">
            Loading sale details...
          </div>
        ) : sale ? (
          <div className="space-y-6 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-gray-500">Transaction ID</p>
                <p className="mt-1 break-all text-sm font-medium">
                  {sale.transactionUuid}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Date</p>
                <p className="mt-1 text-sm font-medium">
                  {formatDate(sale.createdAt)}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Status</p>
                <div className="mt-1">
                  <StatusBadge status={sale.status} />
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500">Cashier</p>
                <p className="mt-1 text-sm font-medium">
                  {sale.cashier?.fullName ?? "Unknown"}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Terminal</p>
                <p className="mt-1 text-sm font-medium">
                  {sale.terminal?.name ?? "Unknown"}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Receipt Number</p>
                <p className="mt-1 text-sm font-medium">
                  {sale.receipt?.receiptNumber ?? "Not available"}
                </p>
              </div>
            </div>

            <div className="border-t pt-5">
              <h3 className="mb-3 font-semibold text-gray-900">
                Purchased Products
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-3">Product</th>
                      <th className="px-3 py-3 text-right">Quantity</th>
                      <th className="px-3 py-3 text-right">Unit Price</th>
                      <th className="px-3 py-3 text-right">Subtotal</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y">
                    {(sale.items ?? []).map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-3 font-medium">
                          {item.productName}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {item.quantity} {item.unitOfMeasure}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatMoney(item.unitPrice, sale.currencyCode)}
                        </td>
                        <td className="px-3 py-3 text-right font-medium">
                          {formatMoney(item.subtotal, sale.currencyCode)}
                        </td>
                      </tr>
                    ))}

                    {(!sale.items || sale.items.length === 0) && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-8 text-center text-gray-500"
                        >
                          No sale items available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ml-auto max-w-sm space-y-2 border-t pt-5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span>{formatMoney(sale.subtotal, sale.currencyCode)}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tax</span>
                <span>{formatMoney(sale.taxAmount, sale.currencyCode)}</span>
              </div>

              <div className="flex justify-between border-t pt-3 text-base font-bold">
                <span>Total</span>
                <span>{formatMoney(sale.totalAmount, sale.currencyCode)}</span>
              </div>
            </div>

            <div className="border-t pt-5">
              <h3 className="mb-3 font-semibold text-gray-900">
                Payment Information
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-500">Payment Method</p>
                  <p className="mt-1 text-sm font-medium">
                    {sale.paymentMethod.replace(/_/g, " ")}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Payment Status</p>
                  <div className="mt-1">
                    <StatusBadge status={sale.paymentStatus} />
                  </div>
                </div>

                {sale.paymentMethod === "CASH" && (
                  <>
                    <div>
                      <p className="text-xs text-gray-500">Amount Received</p>
                      <p className="mt-1 text-sm font-medium">
                        {sale.amountReceived
                          ? formatMoney(sale.amountReceived, sale.currencyCode)
                          : "Not available"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Change</p>
                      <p className="mt-1 text-sm font-medium">
                        {sale.changeAmount
                          ? formatMoney(sale.changeAmount, sale.currencyCode)
                          : "Not available"}
                      </p>
                    </div>
                  </>
                )}

                {sale.mobileMoneyProvider && (
                  <div>
                    <p className="text-xs text-gray-500">
                      Mobile Money Provider
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {sale.mobileMoneyProvider.replace(/_/g, " ")}
                    </p>
                  </div>
                )}

                {sale.paymentReference && (
                  <div>
                    <p className="text-xs text-gray-500">Payment Reference</p>
                    <p className="mt-1 break-all text-sm font-medium">
                      {sale.paymentReference}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [pagination, setPagination] = useState<SalesPagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  // Applied filters (used for API requests)
  const [filters, setFilters] = useState<SalesFilters>(() => {
    const today = getTodayDate();

    return {
      dateFrom: today,
      dateTo: today,
    };
  });

  const [summary, setSummary] = useState<SalesSummary>({
    totalAmount: "0",
  });

  const [searchInput, setSearchInput] = useState("");
  const [dateFromInput, setDateFromInput] = useState(getTodayDate());
  const [dateToInput, setDateToInput] = useState(getTodayDate());
  const [paymentMethodInput, setPaymentMethodInput] = useState("");
  const [statusInput, setStatusInput] = useState("");
  const [cashierIdInput, setCashierIdInput] = useState("");
  const [terminalIdInput, setTerminalIdInput] = useState("");
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);

  function getTodayDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  const applyFilters = () => {
    setFilters({
      dateFrom: dateFromInput || undefined,
      dateTo: dateToInput || undefined,
      paymentMethod:
        (paymentMethodInput as SalesFilters["paymentMethod"]) || undefined,
      status: (statusInput as SalesFilters["status"]) || undefined,
      cashierId: cashierIdInput.trim() || undefined,
      terminalId: terminalIdInput.trim() || undefined,
    });

    setSearch(searchInput.trim());
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput("");
    setDateFromInput(getTodayDate());
    setDateToInput(getTodayDate());
    setPaymentMethodInput("");
    setStatusInput("");
    setCashierIdInput("");
    setTerminalIdInput("");

    setSearch("");
    setFilters(() => {
      const today = getTodayDate();

      return {
        dateFrom: today,
        dateTo: today,
      };
    });
    setPage(1);
  };

  const loadSales = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await getSales({
        page,
        limit: 20,
        ...filters,
      });

      setSales(response.data);
      setPagination(response.pagination);
      setSummary(response.summary);
    } catch (err) {
      console.error(err);
      setError("Could not load sales. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [cashierData, terminalData] = await Promise.all([
          getCashiers(),
          getTerminals(),
        ]);

        setCashiers(cashierData);
        setTerminals(terminalData);
      } catch (error) {
        console.error("Could not load sales filter options:", error);
      }
    };

    void loadFilterOptions();
  }, []);

  const openSaleDetails = async (id: string) => {
    try {
      setSelectedSale(null);
      setDetailsLoading(true);

      const sale = await getSaleById(id);
      setSelectedSale(sale);
    } catch (err) {
      console.error(err);
      setError("Could not load sale details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const filteredSales = sales.filter((sale) => {
    const term = search.trim().toLowerCase();

    if (!term) return true;

    return (
      sale.receipt?.receiptNumber?.toLowerCase().includes(term) ||
      sale.transactionUuid.toLowerCase().includes(term) ||
      sale.cashier?.fullName?.toLowerCase().includes(term) ||
      sale.terminal?.name?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and monitor supermarket sales transactions.
          </p>
        </div>

        <button
          onClick={() => void loadSales()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Search size={18} className="text-slate-500" />
          <h2 className="font-semibold text-slate-800">Search and filters</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Search */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Search
            </label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="Receipt, transaction, cashier or terminal..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          {/* Payment method */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Payment method
            </label>
            <select
              value={paymentMethodInput}
              onChange={(e) => setPaymentMethodInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">All payment methods</option>
              <option value="CASH">Cash</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Sale status
            </label>
            <select
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">All statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="VOIDED">Voided</option>
            </select>
          </div>

          {/* Date from */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Date from
            </label>
            <input
              type="date"
              value={dateFromInput}
              max={dateToInput || undefined}
              onChange={(e) => setDateFromInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Date to
            </label>
            <input
              type="date"
              value={dateToInput}
              min={dateFromInput || undefined}
              onChange={(e) => setDateToInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          {/* Cashier ID */}
          {/* Cashier */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Cashier
            </label>
            <select
              value={cashierIdInput}
              onChange={(e) => setCashierIdInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">All Cashiers</option>

              {cashiers.map((cashier) => (
                <option key={cashier.id} value={cashier.id}>
                  {cashier.fullName} ({cashier.username})
                </option>
              ))}
            </select>
          </div>

          {/* Terminal ID */}
          {/* Terminal */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Terminal
            </label>
            <select
              value={terminalIdInput}
              onChange={(e) => setTerminalIdInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">All Terminals</option>

              {terminals.map((terminal) => (
                <option key={terminal.id} value={terminal.id}>
                  {terminal.name} ({terminal.terminalCode})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={applyFilters}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <Search size={16} />
            Apply filters
          </button>

          <button
            onClick={clearFilters}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Total Sales Amount</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {formatMoney(summary.totalAmount)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Total transactions</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {pagination.total}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Current page</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {pagination.page} / {Math.max(1, pagination.totalPages)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-5 py-4">Receipt</th>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Cashier</th>
                <th className="px-5 py-4">Terminal</th>
                <th className="px-5 py-4">Payment</th>
                <th className="px-5 py-4">Total</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-12 text-center text-gray-500"
                  >
                    Loading sales...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-12 text-center text-red-600"
                  >
                    {error}
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-12 text-center text-gray-500"
                  >
                    No sales found.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4 font-medium text-gray-900">
                      {sale.receipt?.receiptNumber ?? "—"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-gray-600">
                      {formatDate(sale.createdAt)}
                    </td>

                    <td className="px-5 py-4">
                      {sale.cashier?.fullName ?? "Unknown"}
                    </td>

                    <td className="px-5 py-4">
                      {sale.terminal?.name ?? "Unknown"}
                    </td>

                    <td className="px-5 py-4">
                      {sale.paymentMethod.replace(/_/g, " ")}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 font-semibold">
                      {formatMoney(sale.totalAmount, sale.currencyCode)}
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={sale.status} />
                    </td>

                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => void openSaleDetails(sale.id)}
                        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-gray-50"
                      >
                        <Eye size={15} />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col justify-between gap-3 border-t px-5 py-4 sm:flex-row sm:items-center">
          <p className="text-sm text-gray-500">
            {pagination.total} transactions found
          </p>

          <div className="flex items-center gap-3">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Previous
            </button>

            <span className="text-sm text-gray-600">
              Page {pagination.page} of {Math.max(1, pagination.totalPages)}
            </span>

            <button
              disabled={page >= pagination.totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <SaleDetailsModal
        sale={selectedSale}
        loading={detailsLoading}
        onClose={() => setSelectedSale(null)}
      />
    </div>
  );
}
