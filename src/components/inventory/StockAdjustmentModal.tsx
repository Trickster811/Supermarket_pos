import { useEffect, useState } from "react";
import {
  createStockAdjustment,
  getProductStock,
  type ProductStockResponse,
  type StockMovementType,
} from "../../services/inventory.service";

interface StockAdjustmentModalProps {
  productId: string;
  onClose: () => void;
  onAdjusted: () => void;
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
    "The operation failed. Please try again."
  );
}

export default function StockAdjustmentModal({
  productId,
  onClose,
  onAdjusted,
}: StockAdjustmentModalProps) {
  const [stock, setStock] = useState<ProductStockResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [movementType, setMovementType] =
    useState<StockMovementType>("ADJUSTMENT");
  const [quantityChange, setQuantityChange] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    async function loadStock() {
      try {
        setLoading(true);
        setError("");

        const response = await getProductStock(productId);
        setStock(response);
      } catch (err) {
        console.error("Failed to load product stock:", err);
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    loadStock();
  }, [productId]);

  function validateQuantity(): string | null {
    const value = quantityChange.trim();

    if (!value) {
      return "Enter a quantity.";
    }

    // Allow up to three decimal places, including negative adjustments.
    if (!/^-?\d+(\.\d{1,3})?$/.test(value)) {
      return "Enter a valid quantity with no more than 3 decimal places.";
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue === 0) {
      return "Quantity must be greater than or less than zero.";
    }

    if (movementType === "OPENING_STOCK" && numericValue <= 0) {
      return "Opening stock must be a positive quantity.";
    }

    if (movementType === "SPOILAGE" && numericValue >= 0) {
      return "Spoilage quantity must be negative.";
    }

    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!stock) {
      setError("Product stock information is not available.");
      return;
    }

    if (!stock.inventoryTracked) {
      setError("Inventory tracking is disabled for this product.");
      return;
    }

    const quantityError = validateQuantity();

    if (quantityError) {
      setError(quantityError);
      return;
    }

    if (!reason.trim()) {
      setError("Please provide a reason for this stock movement.");
      return;
    }

    try {
      setSubmitting(true);

      await createStockAdjustment({
        productId,
        movementType,
        quantityChange: quantityChange.trim(),
        reason: reason.trim(),
      });

      onAdjusted();
    } catch (err) {
      console.error("Failed to adjust stock:", err);
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const currentQuantity =
    stock?.quantity !== null && stock?.quantity !== undefined
      ? Number(stock.quantity).toLocaleString("fr-FR")
      : "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Adjust Stock
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Record a stock movement for this product.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-2 py-1 text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 p-6">
            {loading ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Loading current stock...
              </div>
            ) : stock ? (
              <>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="font-medium text-slate-800">
                    {stock.product.name}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    SKU: {stock.product.sku}
                  </div>

                  <div className="mt-3 flex items-end justify-between">
                    <span className="text-sm text-slate-500">
                      Current stock
                    </span>

                    <span className="text-xl font-semibold text-slate-800">
                      {currentQuantity}{" "}
                      <span className="text-sm font-normal text-slate-500">
                        {stock.product.unitOfMeasure}
                      </span>
                    </span>
                  </div>
                </div>

                {!stock.inventoryTracked && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Inventory tracking is disabled for this product. Stock
                    adjustments are unavailable.
                  </div>
                )}

                <div>
                  <label
                    htmlFor="movementType"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Movement type
                  </label>

                  <select
                    id="movementType"
                    value={movementType}
                    onChange={(event) => {
                      setMovementType(event.target.value as StockMovementType);
                      setError("");
                      setQuantityChange("");
                    }}
                    disabled={submitting || !stock.inventoryTracked}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  >
                    <option value="ADJUSTMENT">Stock adjustment</option>
                    <option value="OPENING_STOCK">Opening stock</option>
                    <option value="SPOILAGE">Spoilage</option>
                  </select>

                  <p className="mt-1 text-xs text-slate-500">
                    {movementType === "OPENING_STOCK"
                      ? "Enter the initial stock quantity as a positive value."
                      : movementType === "SPOILAGE"
                        ? "Enter the spoiled quantity as a negative value."
                        : "Enter a positive value to increase stock or a negative value to decrease it."}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="quantityChange"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Quantity change
                  </label>

                  <input
                    id="quantityChange"
                    type="number"
                    step="0.001"
                    value={quantityChange}
                    onChange={(event) => {
                      setQuantityChange(event.target.value);
                      setError("");
                    }}
                    disabled={submitting || !stock.inventoryTracked}
                    placeholder={
                      movementType === "SPOILAGE" ? "-2.5" : "e.g. 10 or -2.5"
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="adjustmentReason"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Reason
                  </label>

                  <textarea
                    id="adjustmentReason"
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                      setError("");
                    }}
                    disabled={submitting || !stock.inventoryTracked}
                    rows={3}
                    placeholder="Explain why this stock movement is being recorded..."
                    className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-100"
                  />
                </div>
              </>
            ) : null}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                loading || submitting || !stock || !stock.inventoryTracked
              }
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
