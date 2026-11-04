import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Package,
  RefreshCw,
  Search,
} from "lucide-react";

import {
  getAllInventory,
  getInventory,
  getLowStock,
  type InventoryItem,
  type InventoryPagination,
  type LowStockItem,
} from "../services/inventory.service";
import StockAdjustmentModal from "../components/inventory/StockAdjustmentModal";
import StockMovementHistoryModal from "../components/inventory/StockMovementHistoryModal";
import { exportToCsv } from "../utils/csvExport";
import { exportToPdf } from "../utils/pdfExport";

const PAGE_SIZE = 20;

function formatQuantity(value: string | number): string {
  const quantity = Number(value);

  if (!Number.isFinite(quantity)) return String(value);

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
  }).format(quantity);
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as {
        response?: { data?: { message?: string } };
      }
    ).response;

    if (response?.data?.message) {
      return response.data.message;
    }
  }

  if (error instanceof Error) return error.message;

  return "Something went wrong. Please try again.";
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  warning = false,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: typeof Package;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>

        <div
          className={`rounded-lg p-2 ${
            warning
              ? "bg-orange-50 text-orange-600"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          <Icon size={20} />
        </div>
      </div>

      <p className="mt-4 text-2xl font-bold text-slate-900">{value}</p>

      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </div>
  );
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const [adjustingProductId, setAdjustingProductId] = useState<string | null>(
    null,
  );
  const [pagination, setPagination] = useState<InventoryPagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [thresholdInput, setThresholdInput] = useState("5");
  const [appliedThreshold, setAppliedThreshold] = useState("5");

  const [loading, setLoading] = useState(true);
  const [lowStockLoading, setLowStockLoading] = useState(true);
  const [error, setError] = useState("");
  const [lowStockError, setLowStockError] = useState("");
  const [exporting, setExporting] = useState(false);

  async function exportInventory() {
    try {
      setExporting(true);

      const allItems = await getAllInventory({
        search: searchInput.trim() || undefined,
      });

      exportToCsv(
        "inventory-stock-overview.csv",
        [
          "Product",
          "SKU",
          "Selling Mode",
          "Unit",
          "Available Quantity",
          "Last Updated",
        ],
        allItems.map((item) => [
          item.product.name,
          item.product.sku,
          item.product.sellingMode,
          item.product.unitOfMeasure,
          item.quantity,
          item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "",
        ]),
      );
    } catch (error) {
      console.error("Failed to export inventory:", error);
      setError("Unable to export inventory.");
    } finally {
      setExporting(false);
    }
  }

  async function exportInventoryPdf() {
    try {
      setExporting(true);

      const items = await getAllInventory({
        search: searchInput.trim() || undefined,
      });

      const rows = items.map((item) => [
        item.product.name,
        item.product.sku,
        item.product.sellingMode,
        item.product.unitOfMeasure,
        Number(item.quantity),
        new Date(item.updatedAt).toLocaleString(),
      ]);

      exportToPdf(
        "inventory-overview.pdf",
        "Inventory Overview",
        ["Product", "SKU", "Selling Mode", "Unit", "Quantity", "Last Updated"],
        rows,
        {
          orientation: "landscape",
          subtitle: `Total products: ${items.length}`,
        },
      );
    } catch (error) {
      console.error("Inventory PDF export failed:", error);
      alert("Failed to export inventory PDF.");
    } finally {
      setExporting(false);
    }
  }

  async function exportLowStockPdf() {
    try {
      setExporting(true);

      const rows = lowStockItems.map((item) => [
        item.product.name,
        item.product.sku,
        item.product.unitOfMeasure,
        Number(item.quantity),
        `${Number(item.product.price).toLocaleString()} FCFA`,
      ]);

      exportToPdf(
        "low-stock-report.pdf",
        "Low Stock Report",
        ["Product", "SKU", "Unit", "Current Quantity", "Selling Price"],
        rows,
        {
          orientation: "landscape",
          subtitle: `Stock threshold: ${appliedThreshold} | Products found: ${lowStockItems.length}`,
        },
      );
    } catch (error) {
      console.error("Low-stock PDF export failed:", error);
      alert("Failed to export low-stock PDF.");
    } finally {
      setExporting(false);
    }
  }

  function exportLowStock() {
    exportToCsv(
      "inventory-low-stock.csv",
      ["Product", "SKU", "Unit", "Available Quantity", "Selling Price"],
      lowStockItems.map((item) => [
        item.product.name,
        item.product.sku,
        item.product.unitOfMeasure,
        item.quantity,
        item.product.price,
      ]),
    );
  }

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await getInventory({
        search: appliedSearch || undefined,
        page: pagination.page,
        limit: PAGE_SIZE,
      });

      setItems(response.data);
      setPagination(response.pagination);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, pagination.page]);

  const loadLowStock = useCallback(async () => {
    setLowStockLoading(true);
    setLowStockError("");

    try {
      const response = await getLowStock(appliedThreshold);

      setLowStockItems(response.data);
      setLowStockCount(response.count);
    } catch (err) {
      setLowStockError(getErrorMessage(err));
    } finally {
      setLowStockLoading(false);
    }
  }, [appliedThreshold]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    void loadLowStock();
  }, [loadLowStock]);

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setPagination((previous) => ({
      ...previous,
      page: 1,
    }));

    setAppliedSearch(searchInput.trim());
  }

  function handleThresholdSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = thresholdInput.trim();

    if (!/^(0|[1-9]\d{0,10})(\.\d{1,3})?$/.test(value)) {
      setLowStockError(
        "Enter a valid non-negative quantity with up to 3 decimal places.",
      );
      return;
    }

    setAppliedThreshold(value);
  }

  function changePage(nextPage: number) {
    if (nextPage < 1 || nextPage > pagination.totalPages) return;

    setPagination((previous) => ({
      ...previous,
      page: nextPage,
    }));
  }

  function refreshDashboard() {
    void loadInventory();
    void loadLowStock();
  }

  const totalPages = Math.max(1, pagination.totalPages);
  const firstRecord =
    pagination.total === 0 ? 0 : (pagination.page - 1) * PAGE_SIZE + 1;

  const lastRecord = Math.min(pagination.page * PAGE_SIZE, pagination.total);

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>

          <p className="mt-1 text-sm text-slate-500">
            Monitor product quantities and stock availability.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={refreshDashboard}
            disabled={loading || lowStockLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={loading || lowStockLoading ? "animate-spin" : ""}
            />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void exportInventory()}
            disabled={exporting || items.length === 0}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? "Exporting..." : "Export Stock CSV"}
          </button>
          <button
            type="button"
            onClick={exportInventoryPdf}
            disabled={exporting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting ? "Exporting..." : "Export PDF"}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard
          title="Inventory records"
          value={pagination.total}
          description="Products with inventory records"
          icon={Boxes}
        />

        <SummaryCard
          title="Low-stock products"
          value={lowStockLoading ? "..." : lowStockCount}
          description={`Active products at or below ${appliedThreshold}`}
          icon={AlertTriangle}
          warning={lowStockCount > 0}
        />
      </div>

      {/* Low-stock threshold */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="font-semibold text-slate-900">
              Low-stock monitoring
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Find active products whose stock is at or below your chosen
              threshold.
            </p>
          </div>

          <form
            onSubmit={handleThresholdSubmit}
            className="flex items-end gap-2"
          >
            <div>
              <label
                htmlFor="stockThreshold"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Threshold
              </label>

              <input
                id="stockThreshold"
                type="number"
                min="0"
                step="0.001"
                value={thresholdInput}
                onChange={(event) => setThresholdInput(event.target.value)}
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            <button
              type="submit"
              disabled={lowStockLoading}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={exportLowStock}
              disabled={lowStockItems.length === 0}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export Low Stock
            </button>
            <button
              type="button"
              onClick={exportLowStockPdf}
              disabled={exporting || lowStockItems.length === 0}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? "Exporting..." : "Export PDF"}
            </button>
          </form>
        </div>

        {lowStockError && (
          <p className="mt-3 text-sm text-red-600">{lowStockError}</p>
        )}

        {!lowStockError && !lowStockLoading && (
          <div className="mt-4">
            {lowStockItems.length === 0 ? (
              <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                No active products are currently at or below this threshold.
              </div>
            ) : (
              <div className="space-y-2">
                {lowStockItems.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-orange-50 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {item.product.name}
                      </p>

                      <p className="text-xs text-slate-500">
                        SKU: {item.product.sku}
                      </p>
                    </div>

                    <p className="shrink-0 text-sm font-semibold text-orange-700">
                      {formatQuantity(item.quantity)}{" "}
                      {item.product.unitOfMeasure}
                    </p>
                  </div>
                ))}

                {lowStockItems.length > 5 && (
                  <p className="text-xs text-slate-500">
                    Showing 5 of {lowStockItems.length} low-stock products. See
                    the inventory list for more.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inventory table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-900">Stock overview</h2>

            <p className="mt-1 text-sm text-slate-500">
              Search and inspect your inventory records.
            </p>
          </div>

          <form
            onSubmit={handleSearch}
            className="flex w-full gap-2 sm:max-w-md"
          >
            <div className="relative flex-1">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Name, SKU, barcode or PLU..."
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Search
            </button>
          </form>
        </div>

        {error && (
          <div className="m-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">Product</th>
                <th className="px-5 py-4 font-semibold">SKU</th>
                <th className="px-5 py-4 font-semibold">Barcode / PLU</th>
                <th className="px-5 py-4 font-semibold">Type</th>
                <th className="px-5 py-4 text-right font-semibold">
                  Available stock
                </th>
                <th className="px-5 py-4 text-center font-semibold">Status</th>
                <th className="px-5 py-4 text-center font-medium">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-slate-500"
                  >
                    Loading inventory...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-slate-400"
                  >
                    Unable to load inventory records.
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <Package
                      size={32}
                      className="mx-auto mb-3 text-slate-300"
                    />

                    <p className="font-medium text-slate-700">
                      No inventory records found
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Try another search or check whether stock records have
                      been created.
                    </p>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-900">
                        {item.product.name}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {item.product.unitOfMeasure}
                      </div>
                    </td>

                    <td className="px-5 py-4 font-mono text-xs text-slate-600">
                      {item.product.sku}
                    </td>

                    <td className="px-5 py-4">
                      <div className="text-xs text-slate-700">
                        {item.product.barcode || "No barcode"}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        PLU: {item.product.pluCode || "—"}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        {item.product.sellingMode === "WEIGHT"
                          ? "Weight"
                          : "Unit"}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <span className="font-semibold tabular-nums text-slate-900">
                        {formatQuantity(item.quantity)}
                      </span>

                      <span className="ml-1 text-xs text-slate-500">
                        {item.product.unitOfMeasure}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-center">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          !item.product.isActive
                            ? "bg-slate-100 text-slate-500"
                            : item.product.trackInventory
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {!item.product.isActive
                          ? "Inactive"
                          : item.product.trackInventory
                            ? "Tracked"
                            : "Tracking off"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => setAdjustingProductId(item.product.id)}
                        className="rounded-lg border border-orange-300 px-3 py-1.5 text-sm font-medium text-orange-600 transition hover:bg-orange-50"
                      >
                        Adjust Stock
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistoryProductId(item.product.id)}
                        className="ml-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                      >
                        View History
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
          <p className="text-xs text-slate-500">
            Showing {firstRecord}–{lastRecord} of {pagination.total} records
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changePage(pagination.page - 1)}
              disabled={loading || pagination.page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Previous
            </button>

            <span className="px-2 text-xs text-slate-500">
              Page {pagination.page} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() => changePage(pagination.page + 1)}
              disabled={loading || pagination.page >= pagination.totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
      {adjustingProductId && (
        <StockAdjustmentModal
          productId={adjustingProductId}
          onClose={() => setAdjustingProductId(null)}
          onAdjusted={() => {
            setAdjustingProductId(null);
            refreshDashboard();
          }}
        />
      )}
      {historyProductId && (
        <StockMovementHistoryModal
          productId={historyProductId}
          onClose={() => setHistoryProductId(null)}
        />
      )}
    </div>
  );
}
