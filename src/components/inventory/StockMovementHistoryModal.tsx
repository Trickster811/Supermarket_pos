import { useEffect, useState } from "react";
import {
  getAllInventoryMovements,
  getInventoryMovements,
  type InventoryMovement,
} from "../../services/inventory.service";
import { exportToCsv } from "../../utils/csvExport";
import { exportToPdf } from "../../utils/pdfExport";

interface StockMovementHistoryModalProps {
  productId: string;
  onClose: () => void;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function getErrorMessage(error: unknown): string {
  const apiError = error as {
    response?: {
      data?: {
        message?: string;
      };
    };
    message?: string;
  };

  return (
    apiError.response?.data?.message ||
    apiError.message ||
    "Unable to load stock movement history."
  );
}

function formatMovementType(type: string): string {
  const safeType = type || "UNKNOWN";

  switch (safeType) {
    case "OPENING_STOCK":
      return "Opening stock";
    case "ADJUSTMENT":
      return "Adjustment";
    case "SPOILAGE":
      return "Spoilage";
    default:
      return safeType.replaceAll("_", " ");
  }
}

function getPerformerName(movement: InventoryMovement): string {
  const performer = movement.performedBy ?? movement.user;

  if (!performer) {
    return "Unknown";
  }

  const fullName = [performer.firstName, performer.lastName]
    .filter(Boolean)
    .join(" ");

  return performer.name || fullName || performer.email || "Unknown";
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function StockMovementHistoryModal({
  productId,
  onClose,
}: StockMovementHistoryModalProps) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  async function exportMovementHistory() {
    try {
      setExporting(true);
      setError("");

      const allMovements = await getAllInventoryMovements(productId);

      exportToCsv(
        "stock-movement-history.csv",
        [
          "Date",
          "Movement Type",
          "Quantity Change",
          "Reason",
          "Performed By",
          "Terminal",
        ],
        allMovements.map((movement) => [
          movement.createdAt
            ? new Date(movement.createdAt).toLocaleString()
            : "",
          formatMovementType(movement.movementType),
          movement.quantityChange,
          movement.reason || "",
          getPerformerName(movement),
          movement.terminal?.name || "",
        ]),
      );
    } catch (err) {
      console.error("Failed to export movement history:", err);
      setError(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  async function exportMovementHistoryPdf() {
    try {
      setExporting(true);

      const allMovements = await getAllInventoryMovements(productId);

      const rows = allMovements.map((movement) => {
        const performer = movement.performedBy ?? movement.user;

        const performerName =
          performer?.name ||
          [performer?.firstName, performer?.lastName]
            .filter(Boolean)
            .join(" ") ||
          performer?.email ||
          "Unknown";

        return [
          formatDate(movement.createdAt),
          formatMovementType(movement.movementType),
          movement.quantityChange,
          movement.reason,
          performerName,
          movement.terminal?.name || "N/A",
        ];
      });

      exportToPdf(
        "stock-movement-history.pdf",
        "Stock Movement History",
        [
          "Date",
          "Movement Type",
          "Quantity Change",
          "Reason",
          "Performed By",
          "Terminal",
        ],
        rows,
        {
          orientation: "landscape",
          subtitle: `Total movements: ${allMovements.length}`,
        },
      );
    } catch (error) {
      console.error("Movement history PDF export failed:", error);
      alert("Failed to export stock movement history PDF.");
    } finally {
      setExporting(false);
    }
  }

  async function loadMovements(page: number) {
    try {
      setLoading(true);
      setError("");

      const response = await getInventoryMovements(productId, page, 10);

      const result = response as unknown as {
        movements?: InventoryMovement[];
        data?:
          | InventoryMovement[]
          | {
              movements?: InventoryMovement[];
            };
        pagination?: Partial<Pagination>;
      };

      // Support both { movements: [...] } and { data: [...] }.
      const records = Array.isArray(result.movements)
        ? result.movements
        : Array.isArray(result.data)
          ? result.data
          : Array.isArray(result.data?.movements)
            ? result.data.movements
            : [];

      const paginationData = result.pagination ?? {};

      setMovements(records);

      setPagination({
        page: paginationData.page ?? page,
        limit: paginationData.limit ?? 10,
        total: paginationData.total ?? records.length,
        totalPages: paginationData.totalPages ?? 1,
      });
    } catch (err) {
      console.error("Failed to load stock movement history:", err);
      setError(getErrorMessage(err));
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMovements(1);
  }, [productId]);

  const startRecord =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;

  const endRecord = Math.min(
    pagination.page * pagination.limit,
    pagination.total,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="movement-history-title"
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2
              id="movement-history-title"
              className="text-lg font-semibold text-slate-800"
            >
              Stock Movement History
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Review all recorded stock movements for this product.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void exportMovementHistory()}
              disabled={exporting || movements.length === 0}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
            <button
              type="button"
              onClick={exportMovementHistoryPdf}
              disabled={exporting || movements.length === 0}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? "Exporting..." : "Export PDF"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close modal"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading movement history...
            </div>
          ) : movements.length === 0 && !error ? (
            <div className="py-12 text-center">
              <p className="font-medium text-slate-700">
                No stock movements found
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Movements will appear here when stock is recorded or adjusted.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Movement</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Quantity
                    </th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 font-medium">Performed by</th>
                    <th className="px-4 py-3 font-medium">Terminal</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {movements.map((movement) => {
                    const quantity = Number(movement.quantityChange);
                    const isIncrease = quantity > 0;

                    return (
                      <tr key={movement.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {formatDate(movement.createdAt)}
                        </td>

                        <td className="px-4 py-3 font-medium text-slate-700">
                          {formatMovementType(movement.movementType)}
                        </td>

                        <td
                          className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${
                            isIncrease ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {isIncrease ? "+" : ""}
                          {Number.isFinite(quantity)
                            ? quantity.toLocaleString()
                            : movement.quantityChange}
                        </td>

                        <td className="max-w-xs px-4 py-3 text-slate-600">
                          <span className="line-clamp-2">
                            {movement.reason || "—"}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          {getPerformerName(movement)}
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          {movement.terminal?.name || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            Showing {startRecord}–{endRecord} of {pagination.total} records
          </p>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => void loadMovements(pagination.page - 1)}
              disabled={loading || pagination.page <= 1}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>

            <span className="whitespace-nowrap text-sm text-slate-600">
              Page {pagination.page} of {pagination.totalPages}
            </span>

            <button
              type="button"
              onClick={() => void loadMovements(pagination.page + 1)}
              disabled={loading || pagination.page >= pagination.totalPages}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
