import { useCallback, useEffect, useState } from "react";
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  ClipboardList,
} from "lucide-react";

import {
  getAuditLogs,
  type AuditLog,
  type AuditLogFilters,
} from "../services/audit-log.service";

const PAGE_SIZE = 20;

function formatAction(action: string) {
  const knownActions: Record<string, string> = {
    PRODUCT_CREATED: "Product Created",
    PRODUCT_UPDATED: "Product Updated",
    PRODUCT_ACTIVATED: "Product Activated",
    PRODUCT_DEACTIVATED: "Product Deactivated",
    PRODUCT_ARCHIVED: "Product Archived",
    PRODUCT_RESTORED: "Product Restored",
    STOCK_RECEIPT_CONFIRMED: "Stock Receipt Confirmed",
    STOCK_RECEIPT_CREATED: "Stock Receipt Created",
    STOCK_RECEIPT_CANCELLED: "Stock Receipt Cancelled",
    USER_CREATED: "User Created",
    USER_UPDATED: "User Updated",
    USER_PASSWORD_RESET: "User Password Reset",
    CATEGORY_CREATED: "Category Created",
    CATEGORY_UPDATED: "Category Updated",
    SALE_CREATED: "Sale Created",
  };

  if (knownActions[action]) return knownActions[action];

  return action
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(date: string) {
  return new Date(date).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActionColor(action: string) {
  if (action.includes("ARCHIVED") || action.includes("DEACTIVATED")) {
    return "bg-red-50 text-red-700";
  }

  if (action.includes("RESTORED") || action.includes("ACTIVATED")) {
    return "bg-green-50 text-green-700";
  }

  if (action.includes("CREATED") || action.includes("CONFIRMED")) {
    return "bg-blue-50 text-blue-700";
  }

  if (action.includes("DELETED") || action.includes("CANCELLED")) {
    return "bg-orange-50 text-orange-700";
  }

  return "bg-slate-100 text-slate-700";
}

function AuditLogDetailsModal({
  log,
  onClose,
}: {
  log: AuditLog;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Audit Log Details
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {formatAction(log.action)}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close details"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Action
              </p>
              <p className="mt-1 text-sm font-medium text-slate-800">
                {formatAction(log.action)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Date and time
              </p>
              <p className="mt-1 text-sm text-slate-800">
                {formatDate(log.createdAt)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Performed by
              </p>
              <p className="mt-1 text-sm text-slate-800">
                {log.user?.fullName || "System"}
              </p>
              {log.user && (
                <p className="text-xs text-slate-500">
                  @{log.user.username} · {log.user.role}
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Terminal
              </p>
              <p className="mt-1 text-sm text-slate-800">
                {log.terminal
                  ? `${log.terminal.name} (${log.terminal.terminalCode})`
                  : "Not associated with a terminal"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Entity type
              </p>
              <p className="mt-1 text-sm text-slate-800">
                {log.entityType || "—"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Entity ID
              </p>
              <p className="mt-1 break-all text-sm text-slate-800">
                {log.entityId || "—"}
              </p>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Description</p>
            <p className="mt-1 text-sm text-gray-900">
              {getAuditDescription(log)}
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase text-slate-500">
              Event details
            </p>

            <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
              {log.details
                ? JSON.stringify(log.details, null, 2)
                : "No additional details recorded."}
            </pre>
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-slate-500">
              Audit record ID
            </p>
            <p className="mt-1 break-all text-xs text-slate-600">{log.id}</p>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function getAuditDescription(log: AuditLog): string {
  const details = log.details as Record<string, unknown> | null;

  const receiptNumber =
    typeof details?.receiptNumber === "string" ? details.receiptNumber : null;

  const supplierName =
    typeof details?.supplierName === "string" ? details.supplierName : null;

  const itemCount =
    typeof details?.itemCount === "number" ? details.itemCount : null;

  switch (log.action) {
    case "STOCK_RECEIPT_CREATED": {
      const receipt = receiptNumber
        ? `Receipt #${receiptNumber}`
        : "Stock receipt";

      const supplier = supplierName ? ` from ${supplierName}` : "";

      const items = itemCount !== null ? ` (${itemCount} line items)` : "";

      return `Created ${receipt}${supplier}${items}`;
    }

    case "STOCK_RECEIPT_UPDATED": {
      const receipt = receiptNumber
        ? `Receipt #${receiptNumber}`
        : "Stock receipt";

      const supplier =
        typeof details?.supplierName === "string"
          ? ` (${details.supplierName})`
          : "";

      const items = itemCount !== null ? `, ${itemCount} line items` : "";

      const changes =
        details?.itemsReplaced === true
          ? " — items replaced"
          : " — details updated";

      return `Updated ${receipt}${supplier}${items}${changes}`;
    }

    case "STOCK_RECEIPT_CONFIRMED": {
      const receipt = receiptNumber
        ? `Receipt #${receiptNumber}`
        : "Stock receipt";

      const items = itemCount !== null ? ` (${itemCount} line items)` : "";

      const totalQuantity =
        typeof details?.totalQuantity === "string"
          ? `, total quantity: ${details.totalQuantity}`
          : "";

      const supplier =
        typeof details?.supplierName === "string"
          ? ` from ${details.supplierName}`
          : "";

      return `Confirmed ${receipt}${supplier}${items}${totalQuantity}`;
    }

    case "STOCK_RECEIPT_CANCELLED": {
      return receiptNumber
        ? `Cancelled Receipt #${receiptNumber}`
        : "Cancelled stock receipt";
    }

    case "PRODUCT_ARCHIVED":
    case "PRODUCT_RESTORED": {
      const name = details?.productName ?? "Unknown product";
      const sku = details?.sku;

      const description = `${log.action === "PRODUCT_ARCHIVED" ? "Archived" : "Restored"} product: ${name}`;

      return `${description}${sku ? ` (SKU: ${sku})` : ""}`;
    }

    default:
      return getReadableAction(log.action);
  }
}

function getReadableAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [searchInput, setSearchInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [entityInput, setEntityInput] = useState("");
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await getAuditLogs({
        ...filters,
        page,
        limit: PAGE_SIZE,
      });

      setLogs(response.logs);
      setTotal(response.pagination.total);
      setTotalPages(response.pagination.totalPages);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load audit logs.",
      );
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  function applyFilters() {
    const nextFilters: AuditLogFilters = {
      ...(searchInput.trim() ? { search: searchInput.trim() } : {}),
      ...(actionInput.trim()
        ? { action: actionInput.trim().toUpperCase() }
        : {}),
      ...(entityInput.trim() ? { entityType: entityInput.trim() } : {}),
      ...(startDateInput ? { startDate: startDateInput } : {}),
      ...(endDateInput ? { endDate: endDateInput } : {}),
    };

    setPage(1);
    setFilters(nextFilters);
  }

  function clearFilters() {
    setSearchInput("");
    setActionInput("");
    setEntityInput("");
    setStartDateInput("");
    setEndDateInput("");
    setPage(1);
    setFilters({});
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="text-orange-500" size={24} />
            <h1 className="text-2xl font-bold text-slate-800">Audit Logs</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Monitor and review activities performed in your supermarket.
          </p>
        </div>

        <button
          onClick={() => void loadLogs()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-500">Total recorded activities</p>
        <p className="mt-1 text-3xl font-bold text-slate-800">
          {total.toLocaleString()}
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Search size={18} className="text-slate-500" />
          <h2 className="font-semibold text-slate-800">Search and filters</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Search
            </label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="Action, user or entity..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Action
            </label>
            <input
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="e.g. PRODUCT_ARCHIVED"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Entity type
            </label>
            <input
              value={entityInput}
              onChange={(e) => setEntityInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="e.g. Product, User"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Start date
            </label>
            <input
              type="date"
              value={startDateInput}
              onChange={(e) => setStartDateInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              End date
            </label>
            <input
              type="date"
              value={endDateInput}
              onChange={(e) => setEndDateInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={applyFilters}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
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

      {/* Audit log table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-800">Activity history</h2>
          <span className="text-sm text-slate-500">
            {total.toLocaleString()} records
          </span>
        </div>

        {error && (
          <div className="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Loading audit logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-700">No audit records found</p>
            <p className="mt-1 text-sm text-slate-500">
              Try changing your search criteria or clearing the filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Date and time</th>
                  <th className="px-5 py-3 font-semibold">Activity</th>
                  <th className="px-5 py-3 font-semibold">Performed by</th>
                  <th className="px-5 py-3 font-semibold">Entity</th>
                  <th className="px-5 py-3 font-semibold">Terminal</th>
                  <th className="px-5 py-3 text-right font-semibold">
                    Details
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {formatDate(log.createdAt)}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getActionColor(log.action)}`}
                      >
                        {getAuditDescription(log)}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">
                        {log.user?.fullName || "System"}
                      </p>
                      {log.user && (
                        <p className="text-xs text-slate-500">
                          @{log.user.username}
                        </p>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <p className="text-slate-700">{log.entityType || "—"}</p>
                      {log.entityId && (
                        <p className="text-xs text-slate-400">
                          {log.entityId.slice(0, 8)}...
                        </p>
                      )}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {log.terminal?.name || "—"}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-orange-300 hover:text-orange-600"
                      >
                        <Eye size={14} />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <p className="text-sm text-slate-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={16} />
                Previous
              </button>

              <span className="px-2 text-sm text-slate-600">
                {page} / {totalPages}
              </span>

              <button
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedLog && (
        <AuditLogDetailsModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </div>
  );
}
