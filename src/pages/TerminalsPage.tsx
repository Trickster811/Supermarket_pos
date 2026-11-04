import { useCallback, useEffect, useState } from "react";
import {
  generateTerminalPairingCode,
  getTerminalList,
  unpairTerminal,
  updateTerminal,
  updateTerminalStatus,
  type PairingCodeResponse,
  type TerminalListItem,
} from "../services/terminals.service";

const PAGE_SIZE = 20;

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export default function TerminalsPage() {
  const [terminals, setTerminals] = useState<TerminalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unpairLoading, setUnpairLoading] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [statusInput, setStatusInput] = useState("all");

  const [search, setSearch] = useState("");
  const [isActive, setIsActive] = useState<boolean | undefined>(undefined);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const [selectedTerminal, setSelectedTerminal] =
    useState<TerminalListItem | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const [editError, setEditError] = useState("");
  const [pairingTerminal, setPairingTerminal] =
    useState<TerminalListItem | null>(null);

  const [pairingDetails, setPairingDetails] =
    useState<PairingCodeResponse | null>(null);

  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState("");

  const [editForm, setEditForm] = useState({
    name: "",
    terminalCode: "",
  });

  async function handleUnpairTerminal(terminal: TerminalListItem) {
    const confirmed = window.confirm(
      `Are you sure you want to unpair "${terminal.name}"? The device will need to pair again before using this terminal.`,
    );

    if (!confirmed) return;

    try {
      setUnpairLoading(terminal.id);
      setActionError("");
      setActionSuccess("");

      const response = await unpairTerminal(terminal.id);

      setActionSuccess(
        response.message ||
          `Terminal "${terminal.name}" successfully unpaired.`,
      );

      await loadTerminals();
    } catch (err: any) {
      setActionError(
        err?.response?.data?.message || "Failed to unpair terminal.",
      );
    } finally {
      setUnpairLoading(null);
    }
  }

  async function handleGeneratePairingCode(terminal: TerminalListItem) {
    setPairingTerminal(terminal);
    setPairingDetails(null);
    setPairingError("");
    setPairingLoading(true);

    try {
      const response = await generateTerminalPairingCode(terminal.id);
      setPairingDetails(response);
    } catch (err: any) {
      setPairingError(
        err?.response?.data?.message || "Failed to generate pairing code.",
      );
    } finally {
      setPairingLoading(false);
    }
  }

  function openEditModal(terminal: TerminalListItem) {
    setSelectedTerminal(terminal);

    setEditForm({
      name: terminal.name,
      terminalCode: terminal.terminalCode,
    });

    setEditError("");
    setActionError("");
    setActionSuccess("");

    setShowEditModal(true);
  }

  async function handleUpdateTerminal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedTerminal) return;

    const name = editForm.name.trim();
    const terminalCode = editForm.terminalCode.trim();

    if (!name || !terminalCode) {
      setEditError("Terminal name and code are required.");
      return;
    }

    try {
      setEditLoading(true);
      setEditError("");

      await updateTerminal(selectedTerminal.id, {
        name,
        terminalCode,
      });

      setShowEditModal(false);
      setSelectedTerminal(null);

      setActionSuccess(`Terminal "${name}" updated successfully.`);

      await loadTerminals();
    } catch (err: any) {
      setEditError(
        err?.response?.data?.message || "Failed to update terminal.",
      );
    } finally {
      setEditLoading(false);
    }
  }

  async function handleToggleStatus(terminal: TerminalListItem) {
    const nextStatus = !terminal.isActive;
    const action = nextStatus ? "activate" : "deactivate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} terminal "${terminal.name}"?`,
    );

    if (!confirmed) return;

    try {
      setActionLoading(terminal.id);
      setActionError("");
      setActionSuccess("");

      await updateTerminalStatus(terminal.id, nextStatus);

      setActionSuccess(
        `Terminal "${terminal.name}" successfully ${nextStatus ? "activated" : "deactivated"}.`,
      );

      await loadTerminals();
    } catch (err: any) {
      setActionError(
        err?.response?.data?.message || "Failed to update terminal status.",
      );
    } finally {
      setActionLoading(null);
    }
  }

  const loadTerminals = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await getTerminalList({
        search: search || undefined,
        isActive,
        page,
        limit: PAGE_SIZE,
      });

      setTerminals(response.data);
      setTotal(response.pagination.total);
      setTotalPages(response.pagination.totalPages);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to load terminals.");
    } finally {
      setLoading(false);
    }
  }, [search, isActive, page]);

  useEffect(() => {
    void loadTerminals();
  }, [loadTerminals]);

  function applyFilters() {
    setSearch(searchInput.trim());
    setIsActive(
      statusInput === "all"
        ? undefined
        : statusInput === "active"
          ? true
          : false,
    );
    setPage(1);
  }

  function clearFilters() {
    setSearchInput("");
    setStatusInput("all");
    setSearch("");
    setIsActive(undefined);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Terminals</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage registered POS terminals.
          </p>
        </div>

        <button
          onClick={() => void loadTerminals()}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
              placeholder="Terminal code or name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Status
            </label>
            <select
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={applyFilters}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Apply
            </button>
            <button
              onClick={clearFilters}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">
              Registered terminals
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {total} terminal(s) found
            </p>
          </div>
        </div>

        {error && (
          <div className="m-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {actionError && (
          <div className="m-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {actionSuccess && (
          <div className="m-5 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
            {actionSuccess}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Terminal code</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    Loading terminals...
                  </td>
                </tr>
              ) : terminals.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    No terminals found.
                  </td>
                </tr>
              ) : (
                terminals.map((terminal) => (
                  <tr key={terminal.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-900">
                      {terminal.terminalCode}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {terminal.name}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge isActive={terminal.isActive} />
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {terminal.createdAt
                        ? new Date(terminal.createdAt).toLocaleDateString()
                        : "—"}
                    </td>

                    <td className="px-5 py-4">
                      <button
                        onClick={() => openEditModal(terminal)}
                        className="mr-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleToggleStatus(terminal)}
                        disabled={actionLoading === terminal.id}
                        className={`mr-2 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                          terminal.isActive
                            ? "bg-red-50 text-red-700 hover:bg-red-100"
                            : "bg-green-50 text-green-700 hover:bg-green-100"
                        }`}
                      >
                        {actionLoading === terminal.id
                          ? "Updating..."
                          : terminal.isActive
                            ? "Deactivate"
                            : "Activate"}
                      </button>
                      <button
                        onClick={() => void handleGeneratePairingCode(terminal)}
                        disabled={pairingLoading}
                        className="mr-2 rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                      >
                        Generate Pairing Code
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Page {page} of {Math.max(totalPages, 1)}
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || loading}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40"
            >
              Previous
            </button>

            <button
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={page >= totalPages || loading}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Edit terminal
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Update the terminal's name and registration code.
            </p>

            <form onSubmit={handleUpdateTerminal} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Terminal name
                </label>

                <input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((current) => ({
                      ...current,
                      name: e.target.value,
                    }))
                  }
                  required
                  maxLength={100}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Terminal code
                </label>

                <input
                  value={editForm.terminalCode}
                  onChange={(e) =>
                    setEditForm((current) => ({
                      ...current,
                      terminalCode: e.target.value,
                    }))
                  }
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              {editError && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {editError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  disabled={editLoading}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={editLoading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {editLoading ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pairingTerminal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Terminal pairing
              </h2>

              <button
                onClick={() => {
                  setPairingTerminal(null);
                  setPairingDetails(null);
                  setPairingError("");
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              Terminal: {pairingTerminal.name}
            </p>

            {pairingLoading && (
              <div className="py-8 text-center text-sm text-slate-500">
                Generating pairing code...
              </div>
            )}

            {pairingError && (
              <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {pairingError}
              </div>
            )}

            {pairingDetails && (
              <div className="mt-5 space-y-4">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase text-slate-500">
                    Terminal code
                  </p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {pairingDetails.terminalCode}
                  </p>
                </div>

                <div className="rounded-lg border border-purple-200 bg-purple-50 p-5 text-center">
                  <p className="text-xs font-medium uppercase text-purple-700">
                    Six-digit pairing code
                  </p>

                  <p className="mt-3 text-4xl font-bold tracking-[0.3em] text-purple-900">
                    {pairingDetails.pairingCode}
                  </p>

                  <button
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        pairingDetails.pairingCode,
                      )
                    }
                    className="mt-3 rounded-lg border border-purple-300 px-3 py-1.5 text-xs font-medium text-purple-800 hover:bg-purple-100"
                  >
                    Copy pairing code
                  </button>
                </div>

                <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="font-medium">Expiration</p>
                  <p className="mt-1">
                    {new Date(pairingDetails.expiresAt).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs">
                    This code expires after 10 minutes. Generate a new code if
                    it expires before pairing.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => {
                  setPairingTerminal(null);
                  setPairingDetails(null);
                  setPairingError("");
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
