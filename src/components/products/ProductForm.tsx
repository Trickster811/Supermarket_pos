import { useEffect, useState, type FormEvent } from "react";
import {
  createProduct,
  updateProduct,
  getSkuSuggestion,
  type CreateProductData,
  type Product,
  type SellingMode,
  type UnitOfMeasure,
} from "../../services/product.service";
import { getCategories, type Category } from "../../services/category.service";
import { ScanBarcode } from "lucide-react";
import BarcodeScanner from "./BarcodeScanner";
import { validateBarcode } from "../../utils/barcode";

interface ProductFormProps {
  product: Product | null;
  onCancel: () => void;
  onSaved: () => void;
}

interface FormData {
  sku: string;
  name: string;
  description: string;
  barcode: string;
  pluCode: string;
  sellingMode: SellingMode;
  unitOfMeasure: UnitOfMeasure;
  price: string;
  taxRate: string;
  categoryId: string;
  trackInventory: boolean;
}

const initialForm: FormData = {
  sku: "",
  name: "",
  description: "",
  barcode: "",
  pluCode: "",
  sellingMode: "UNIT",
  unitOfMeasure: "PIECE",
  price: "",
  taxRate: "0",
  categoryId: "",
  trackInventory: true,
};

const unitsByMode: Record<SellingMode, UnitOfMeasure[]> = {
  UNIT: ["PIECE", "PACKET", "BOTTLE", "BOX"],
  WEIGHT: ["KG", "GRAM", "LITRE"],
};

const unitLabels: Record<UnitOfMeasure, string> = {
  PIECE: "Piece",
  PACKET: "Packet",
  BOTTLE: "Bottle",
  BOX: "Box",
  KG: "Kilogram (kg)",
  GRAM: "Gram (g)",
  LITRE: "Litre (L)",
};

export default function ProductForm({
  product,
  onCancel,
  onSaved,
}: ProductFormProps) {
  const [form, setForm] = useState<FormData>(initialForm);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // SKU suggestion state
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [loadingSkuSuggestion, setLoadingSkuSuggestion] = useState(false);
  const [skuSuggestionError, setSkuSuggestionError] = useState("");
  const [regenerateCounter, setRegenerateCounter] = useState(0);

  // Barcode Management
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [barcodeError, setBarcodeError] = useState("");

  const isEditing = product !== null;

  useEffect(() => {
    if (product) {
      setForm({
        sku: product.sku,
        name: product.name,
        description: product.description ?? "",
        barcode: product.barcode ?? "",
        pluCode: product.pluCode ?? "",
        sellingMode: product.sellingMode,
        unitOfMeasure: product.unitOfMeasure,
        price: String(product.price),
        taxRate: String(product.taxRate ?? "0"),
        categoryId: product.categoryId ?? "",
        trackInventory: product.trackInventory,
      });
    } else {
      setForm(initialForm);
    }

    setSkuManuallyEdited(false);
    setSkuSuggestionError("");
    setError("");
  }, [product]);

  useEffect(() => {
    async function loadCategories() {
      try {
        const response = await getCategories({ isActive: "true" });
        setCategories(response.data);
      } catch (err) {
        console.error("Failed to load categories:", err);
        setError("Unable to load categories. Please try again.");
      } finally {
        setLoadingCategories(false);
      }
    }

    loadCategories();
  }, []);

  // Automatically suggest an SKU for new products.
  // Existing products retain their current SKU.
  useEffect(() => {
    if (isEditing || skuManuallyEdited) {
      setLoadingSkuSuggestion(false);
      return;
    }

    const name = form.name.trim();

    if (!name) {
      setLoadingSkuSuggestion(false);
      setSkuSuggestionError("");

      setForm((current) => ({
        ...current,
        sku: "",
      }));

      return;
    }

    let cancelled = false;

    setLoadingSkuSuggestion(true);
    setSkuSuggestionError("");

    const timeoutId = window.setTimeout(async () => {
      try {
        const suggestedSku = await getSkuSuggestion(
          name,
          form.categoryId || null,
        );

        if (!cancelled) {
          setForm((current) => ({
            ...current,
            sku: suggestedSku,
          }));
        }
      } catch (err) {
        console.error("Failed to generate SKU suggestion:", err);

        if (!cancelled) {
          setSkuSuggestionError(
            "Unable to generate an SKU automatically. You can enter one manually.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingSkuSuggestion(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    form.name,
    form.categoryId,
    isEditing,
    skuManuallyEdited,
    regenerateCounter,
  ]);

  const handleBarcodeDetected = (value: string) => {
    setBarcode(value);
    setBarcodeError("");
    setShowBarcodeScanner(false);
  };

  function updateField<K extends keyof FormData>(field: K, value: FormData[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSkuChange(value: string) {
    setSkuManuallyEdited(true);
    setSkuSuggestionError("");
    updateField("sku", value);
  }

  function handleRegenerateSku() {
    setSkuManuallyEdited(false);
    setSkuSuggestionError("");
    setRegenerateCounter((current) => current + 1);
  }

  function handleSellingModeChange(mode: SellingMode) {
    setForm((current) => ({
      ...current,
      sellingMode: mode,
      unitOfMeasure: unitsByMode[mode][0],
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const sku = form.sku.trim();
    const name = form.name.trim();
    const price = form.price.trim();
    const taxRate = form.taxRate.trim();

    if (!sku || !name || !price) {
      setError("SKU, product name, and price are required.");
      return;
    }

    if (loadingSkuSuggestion) {
      setError("Please wait for the SKU suggestion to finish.");
      return;
    }

    if (!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(price)) {
      setError("Enter a valid price with no more than 2 decimal places.");
      return;
    }

    if (Number(price) <= 0) {
      setError("Price must be greater than zero.");
      return;
    }

    if (!/^(100(\.0{1,2})?|([0-9]{1,2})(\.\d{1,2})?)$/.test(taxRate)) {
      setError("Tax rate must be between 0 and 100.");
      return;
    }

    const payload: CreateProductData = {
      sku,
      name,
      description: form.description.trim() || undefined,
      barcode: barcode.trim() || null,
      //   pluCode: form.pluCode.trim() || null,
      sellingMode: form.sellingMode,
      unitOfMeasure: form.unitOfMeasure,
      price,
      taxRate,
      categoryId: form.categoryId || null,
      trackInventory: form.trackInventory,
    };

    try {
      setSubmitting(true);
      const validationError = validateBarcode(barcode);

      if (validationError) {
        setBarcodeError(validationError);
        return;
      }

      setBarcodeError("");

      if (isEditing && product) {
        await updateProduct(product.id, payload);
      } else {
        await createProduct(payload);
      }

      onSaved();
    } catch (err) {
      const responseError = err as {
        response?: {
          data?: {
            message?: string;
          };
        };
      };

      setError(
        responseError.response?.data?.message ??
          `Unable to ${isEditing ? "update" : "create"} product. Please try again.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100";

  const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isEditing ? "Edit Product" : "Add Product"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isEditing
                ? "Update the product information below."
                : "Enter the product information below."}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100"
            disabled={submitting}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 p-6">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Basic information */}
            <section>
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Basic information
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label className="text-sm font-medium text-slate-700">
                      SKU *
                    </label>

                    {!isEditing && (
                      <button
                        type="button"
                        onClick={handleRegenerateSku}
                        disabled={!form.name.trim() || loadingSkuSuggestion}
                        className="text-xs font-medium text-orange-600 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {loadingSkuSuggestion
                          ? "Generating..."
                          : skuManuallyEdited
                            ? "Generate suggestion"
                            : "Regenerate suggestion"}
                      </button>
                    )}
                  </div>

                  <input
                    className={inputClass}
                    value={form.sku}
                    onChange={(e) => handleSkuChange(e.target.value)}
                    placeholder="e.g. BEV-COC-0001"
                    maxLength={50}
                    required
                  />

                  {!isEditing && (
                    <p className="mt-1.5 text-xs text-slate-500">
                      {loadingSkuSuggestion
                        ? "Generating SKU suggestion..."
                        : skuManuallyEdited
                          ? "Manual SKU. Automatic suggestions are disabled."
                          : "Automatically suggested from the product name and category. You can edit it."}
                    </p>
                  )}

                  {skuSuggestionError && !isEditing && (
                    <p className="mt-1.5 text-xs text-red-600">
                      {skuSuggestionError}
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Product name *</label>
                  <input
                    className={inputClass}
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="Product name"
                    maxLength={150}
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className={labelClass}>Description</label>
                  <textarea
                    className={inputClass}
                    value={form.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    placeholder="Optional product description"
                    rows={3}
                    maxLength={1000}
                  />
                </div>

                <div>
                  <label className={labelClass}>Category</label>
                  <select
                    className={inputClass}
                    value={form.categoryId}
                    onChange={(e) => updateField("categoryId", e.target.value)}
                    disabled={loadingCategories}
                  >
                    <option value="">
                      {loadingCategories
                        ? "Loading categories..."
                        : "No category"}
                    </option>

                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <div className="border-t border-slate-100" />

            {/* Selling configuration */}
            <section>
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Selling configuration
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Selling mode *</label>
                  <select
                    className={inputClass}
                    value={form.sellingMode}
                    onChange={(e) =>
                      handleSellingModeChange(e.target.value as SellingMode)
                    }
                  >
                    <option value="UNIT">Unit</option>
                    <option value="WEIGHT">Weight</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Unit of measure *</label>
                  <select
                    className={inputClass}
                    value={form.unitOfMeasure}
                    onChange={(e) =>
                      updateField(
                        "unitOfMeasure",
                        e.target.value as UnitOfMeasure,
                      )
                    }
                  >
                    {unitsByMode[form.sellingMode].map((unit) => (
                      <option key={unit} value={unit}>
                        {unitLabels[unit]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Selling price (FCFA) *</label>
                  <input
                    className={inputClass}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => updateField("price", e.target.value)}
                    placeholder="e.g. 1500"
                    required
                  />
                </div>

                <div>
                  <label className={labelClass}>Tax rate (%)</label>
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.taxRate}
                    onChange={(e) => updateField("taxRate", e.target.value)}
                  />
                </div>
              </div>
            </section>

            <div className="border-t border-slate-100" />

            {/* Identification */}
            <section>
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Identification and inventory
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="barcode"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Barcode
                  </label>

                  <div className="flex gap-2">
                    <input
                      id="barcode"
                      type="text"
                      value={barcode}
                      onChange={(e) => {
                        setBarcode(e.target.value);
                        setBarcodeError("");
                      }}
                      placeholder="Enter or scan barcode"
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2"
                    />

                    <button
                      type="button"
                      onClick={() => setShowBarcodeScanner(true)}
                      className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50"
                      title="Scan barcode"
                    >
                      <ScanBarcode size={18} />
                      <span>Scan</span>
                    </button>
                  </div>

                  {barcodeError && (
                    <p className="mt-1 text-sm text-red-600">{barcodeError}</p>
                  )}

                  <p className="mt-1 text-xs text-gray-500">
                    Standard EAN/UPC codes are checked automatically. Internal
                    codes are also supported.
                  </p>
                </div>

                {form.sellingMode === "WEIGHT" && (
                  <div>
                    <label>PLU Code {"->"}</label>

                    <input
                      type="text"
                      value={
                        product?.pluCode ?? "Automatically assigned when saved"
                      }
                      readOnly
                      disabled
                    />

                    <p className="mt-1.5 text-xs italic text-slate-500">
                      PLU codes are generated automatically for weighed
                      products.
                    </p>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3">
                    <input
                      type="checkbox"
                      checked={form.trackInventory}
                      onChange={(e) =>
                        updateField("trackInventory", e.target.checked)
                      }
                      className="h-4 w-4 accent-orange-500"
                    />

                    <span>
                      <span className="block text-sm font-medium text-slate-800">
                        Track inventory
                      </span>
                      <span className="block text-xs text-slate-500">
                        Enable stock tracking for this product.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </section>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || loadingCategories || loadingSkuSuggestion}
              className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? isEditing
                  ? "Saving..."
                  : "Creating..."
                : isEditing
                  ? "Save Changes"
                  : "Create Product"}
            </button>
          </div>
        </form>
      </div>
      {showBarcodeScanner && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}
    </div>
  );
}
