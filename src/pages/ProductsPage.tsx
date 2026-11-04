import { useEffect, useState } from "react";
import {
  getProducts,
  updateProductStatus,
  archiveProduct,
  restoreProduct,
  type Product,
} from "../services/product.service";
import { getCategories, type Category } from "../services/category.service";
import ProductForm from "../components/products/ProductForm";
import ProductDetailsModal from "../components/products/ProductDetailsModal";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [statusActionError, setStatusActionError] = useState("");
  const [archiveActionError, setArchiveActionError] = useState("");

  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [updatingArchiveId, setUpdatingArchiveId] = useState<string | null>(
    null,
  );

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSellingMode, setSelectedSellingMode] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const [showArchived, setShowArchived] = useState(false);

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);

  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [viewingProductId, setViewingProductId] = useState<string | null>(null);

  useEffect(() => {
    async function loadProducts() {
      try {
        setLoading(true);
        setError("");

        const response = await getProducts({
          search: search.trim() || undefined,
          categoryId: selectedCategory || undefined,
          sellingMode: selectedSellingMode
            ? (selectedSellingMode as "UNIT" | "WEIGHT")
            : undefined,
          isActive:
            !showArchived && selectedStatus
              ? (selectedStatus as "true" | "false")
              : undefined,
          isArchived: showArchived ? "true" : "false",
          page,
          limit,
        });

        setProducts(response.data);
        setTotalPages(response.pagination.totalPages);
        setTotalProducts(response.pagination.total);
      } catch (err) {
        console.error("Failed to load products:", err);
        setError("Unable to load products. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, [
    search,
    selectedCategory,
    selectedSellingMode,
    selectedStatus,
    showArchived,
    page,
    limit,
    refreshKey,
  ]);

  useEffect(() => {
    async function loadCategories() {
      try {
        const response = await getCategories({ isActive: "true" });
        setCategories(response.data);
      } catch (err) {
        console.error("Failed to load categories:", err);
      }
    }

    loadCategories();
  }, []);

  function switchProductView(archived: boolean) {
    setShowArchived(archived);
    setSelectedStatus("");
    setPage(1);
    setStatusActionError("");
    setArchiveActionError("");
  }

  function openCreateForm() {
    setEditingProduct(null);
    setShowProductForm(true);
  }

  function openEditForm(product: Product) {
    setEditingProduct(product);
    setShowProductForm(true);
  }

  function closeProductForm() {
    setShowProductForm(false);
    setEditingProduct(null);
  }

  function handleProductSaved() {
    closeProductForm();
    setPage(1);
    setRefreshKey((current) => current + 1);
  }

  function openProductDetails(product: Product) {
    setViewingProductId(product.id);
  }

  async function handleStatusChange(product: Product) {
    const nextStatus = !product.isActive;
    const action = nextStatus ? "activate" : "deactivate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} "${product.name}"?`,
    );

    if (!confirmed) return;

    try {
      setUpdatingStatusId(product.id);
      setStatusActionError("");

      await updateProductStatus(product.id, nextStatus);

      setRefreshKey((current) => current + 1);
    } catch (err) {
      console.error("Failed to update product status:", err);

      const responseError = err as {
        response?: {
          data?: {
            message?: string;
          };
        };
      };

      setStatusActionError(
        responseError.response?.data?.message ??
          `Unable to ${action} product. Please try again.`,
      );
    } finally {
      setUpdatingStatusId(null);
    }
  }

  async function handleArchive(product: Product) {
    const confirmed = window.confirm(
      `Are you sure you want to archive "${product.name}"?\n\n` +
        "The product will no longer be available for new sales. " +
        "Its existing sales and inventory history will be preserved.",
    );

    if (!confirmed) return;

    try {
      setUpdatingArchiveId(product.id);
      setArchiveActionError("");

      await archiveProduct(product.id);

      setRefreshKey((current) => current + 1);
    } catch (err) {
      console.error("Failed to archive product:", err);

      const responseError = err as {
        response?: {
          data?: {
            message?: string;
          };
        };
      };

      setArchiveActionError(
        responseError.response?.data?.message ??
          "Unable to archive product. Please try again.",
      );
    } finally {
      setUpdatingArchiveId(null);
    }
  }

  async function handleRestore(product: Product) {
    const confirmed = window.confirm(
      `Are you sure you want to restore "${product.name}"?\n\n` +
        "The product will return to the active products list. " +
        "Its activation status will remain unchanged.",
    );

    if (!confirmed) return;

    try {
      setUpdatingArchiveId(product.id);
      setArchiveActionError("");

      await restoreProduct(product.id);

      setRefreshKey((current) => current + 1);
    } catch (err) {
      console.error("Failed to restore product:", err);

      const responseError = err as {
        response?: {
          data?: {
            message?: string;
          };
        };
      };

      setArchiveActionError(
        responseError.response?.data?.message ??
          "Unable to restore product. Please try again.",
      );
    } finally {
      setUpdatingArchiveId(null);
    }
  }

  const startRecord = totalProducts === 0 ? 0 : (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, totalProducts);

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Products</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your supermarket products.
          </p>
        </div>

        {!showArchived && (
          <button
            onClick={openCreateForm}
            className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-orange-600"
          >
            + Add Product
          </button>
        )}
      </div>

      {/* Active / Archived switch */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => switchProductView(false)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            !showArchived
              ? "bg-orange-500 text-white"
              : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Active products
        </button>

        <button
          type="button"
          onClick={() => switchProductView(true)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            showArchived
              ? "bg-orange-500 text-white"
              : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Archived products
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] max-w-md flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, SKU, barcode or PLU..."
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-orange-500"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          value={selectedSellingMode}
          onChange={(e) => {
            setSelectedSellingMode(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-orange-500"
        >
          <option value="">All selling modes</option>
          <option value="UNIT">Unit</option>
          <option value="WEIGHT">Weight</option>
        </select>

        {!showArchived && (
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-orange-500"
          >
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        )}
      </div>

      <p className="text-sm text-slate-500">
        {categories.length} active categories available
        {" · "}
        {totalProducts} {showArchived ? "archived" : "active-list"} products
      </p>

      {/* Action errors */}
      {statusActionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {statusActionError}
        </div>
      )}

      {archiveActionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {archiveActionError}
        </div>
      )}

      {/* Products table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading products...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600">{error}</div>
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {showArchived
              ? "No archived products found."
              : "No products found."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">Product</th>
                  <th className="px-5 py-4 font-medium">SKU</th>
                  <th className="px-5 py-4 font-medium">Category</th>
                  <th className="px-5 py-4 font-medium">Type</th>
                  <th className="px-5 py-4 text-right font-medium">Price</th>
                  <th className="px-5 py-4 text-center font-medium">Status</th>
                  <th className="px-5 py-4 text-center font-medium">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {products.map((product) => {
                  const updatingStatus = updatingStatusId === product.id;
                  const updatingArchive = updatingArchiveId === product.id;
                  const anyActionRunning =
                    updatingStatusId !== null || updatingArchiveId !== null;

                  return (
                    <tr key={product.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-800">
                          {product.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {product.barcode || "No barcode"}
                        </div>
                        {showArchived && product.archivedAt && (
                          <div className="mt-1 text-xs text-slate-400">
                            Archived on{" "}
                            {new Date(product.archivedAt).toLocaleDateString(
                              "fr-FR",
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {product.sku}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {product.category?.name || "Uncategorized"}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {product.sellingMode}
                      </td>

                      <td className="px-5 py-4 text-right font-medium text-slate-800">
                        {Number(product.price).toLocaleString("fr-FR")} FCFA
                      </td>

                      <td className="px-5 py-4 text-center">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            showArchived
                              ? "bg-orange-50 text-orange-700"
                              : product.isActive
                                ? "bg-green-50 text-green-700"
                                : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {showArchived
                            ? "Archived"
                            : product.isActive
                              ? "Active"
                              : "Inactive"}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openProductDetails(product)}
                            disabled={anyActionRunning}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            View
                          </button>

                          {!showArchived ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditForm(product)}
                                disabled={anyActionRunning}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-orange-400 hover:bg-orange-50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => handleStatusChange(product)}
                                disabled={anyActionRunning}
                                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                  product.isActive
                                    ? "border-red-200 text-red-600 hover:bg-red-50"
                                    : "border-green-200 text-green-700 hover:bg-green-50"
                                }`}
                              >
                                {updatingStatus
                                  ? "Updating..."
                                  : product.isActive
                                    ? "Deactivate"
                                    : "Activate"}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleArchive(product)}
                                disabled={anyActionRunning}
                                className="rounded-lg border border-orange-200 px-3 py-1.5 text-sm font-medium text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {updatingArchive ? "Archiving..." : "Archive"}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRestore(product)}
                              disabled={anyActionRunning}
                              className="rounded-lg border border-green-200 px-3 py-1.5 text-sm font-medium text-green-700 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingArchive ? "Restoring..." : "Restore"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <p className="text-sm text-slate-500">
            Showing {startRecord}–{endRecord} of {totalProducts} records
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={loading || page <= 1 || totalProducts === 0}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>

            <span className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>

            <button
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={loading || page >= totalPages || totalProducts === 0}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Product details */}
      {viewingProductId && (
        <ProductDetailsModal
          productId={viewingProductId}
          onClose={() => setViewingProductId(null)}
          onEdit={(product) => {
            setViewingProductId(null);
            openEditForm(product);
          }}
        />
      )}

      {/* Create / edit product */}
      {showProductForm && (
        <ProductForm
          product={editingProduct}
          onCancel={closeProductForm}
          onSaved={handleProductSaved}
        />
      )}
    </div>
  );
}
