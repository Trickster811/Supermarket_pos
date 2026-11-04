import { useEffect, useState } from "react";
import {
  getProduct,
  type ProductDetails,
} from "../../services/product.service";

interface ProductDetailsModalProps {
  productId: string;
  onClose: () => void;
  onEdit: (product: ProductDetails) => void;
}

export default function ProductDetailsModal({
  productId,
  onClose,
  onEdit,
}: ProductDetailsModalProps) {
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProduct() {
      try {
        setLoading(true);
        setError("");

        const response = await getProduct(productId);

        if (active) {
          setProduct(response);
        }
      } catch (err) {
        console.error("Failed to load product details:", err);

        if (active) {
          setError("Unable to load product details. Please try again.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProduct();

    return () => {
      active = false;
    };
  }, [productId]);

  function formatCurrency(value: string) {
    return `${Number(value).toLocaleString("fr-FR")} FCFA`;
  }

  function Detail({ label, value }: { label: string; value: string }) {
    return (
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p className="mt-1 break-words text-sm font-medium text-slate-800">
          {value}
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Product Details
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Complete product information
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading product details...
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Close
            </button>
          </div>
        ) : product ? (
          <>
            <div className="space-y-6 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-slate-800">
                    {product.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    SKU: {product.sku}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    product.isActive
                      ? "bg-green-50 text-green-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {product.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              <section>
                <h4 className="mb-3 text-sm font-semibold text-slate-700">
                  General Information
                </h4>

                <div className="grid grid-cols-1 gap-5 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                  <Detail label="Product Name" value={product.name} />
                  <Detail label="SKU" value={product.sku} />
                  <Detail
                    label="Category"
                    value={product.category?.name || "Uncategorized"}
                  />
                  <Detail label="Selling Mode" value={product.sellingMode} />
                  <Detail
                    label="Unit of Measure"
                    value={product.unitOfMeasure}
                  />
                  <Detail
                    label="Description"
                    value={product.description || "No description"}
                  />
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-semibold text-slate-700">
                  Identification
                </h4>

                <div className="grid grid-cols-1 gap-5 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                  <Detail
                    label="Barcode"
                    value={product.barcode || "Not assigned"}
                  />
                  <Detail
                    label="PLU Code"
                    value={product.pluCode || "Not assigned"}
                  />
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-semibold text-slate-700">
                  Pricing
                </h4>

                <div className="grid grid-cols-1 gap-5 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                  <Detail
                    label="Selling Price"
                    value={formatCurrency(product.price)}
                  />
                  <Detail
                    label="Tax Rate"
                    value={`${Number(product.taxRate)}%`}
                  />
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-semibold text-slate-700">
                  Inventory
                </h4>

                <div className="grid grid-cols-1 gap-5 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                  <Detail
                    label="Inventory Tracking"
                    value={product.trackInventory ? "Enabled" : "Disabled"}
                  />

                  {product.trackInventory && (
                    <>
                      <Detail
                        label="Current Stock"
                        value={`${Number(
                          product.inventory?.quantity ?? 0,
                        ).toLocaleString("fr-FR")} ${product.unitOfMeasure}`}
                      />

                      <Detail
                        label="Last Stock Update"
                        value={
                          product.inventory?.updatedAt
                            ? new Date(
                                product.inventory.updatedAt,
                              ).toLocaleString()
                            : "No stock update"
                        }
                      />
                    </>
                  )}
                </div>
              </section>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => onEdit(product)}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
              >
                Edit Product
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
