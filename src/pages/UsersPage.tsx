import { useCallback, useEffect, useState } from "react";
import {
  createUser,
  getUsers,
  resetUserPassword,
  updateUser,
  type User,
  type UserRole,
} from "../services/users.service";

const PAGE_SIZE = 20;

function formatDate(date: string) {
  return new Date(date).toLocaleString();
}

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

function RoleBadge({ role }: { role: UserRole }) {
  const styles: Record<UserRole, string> = {
    ADMIN: "bg-purple-100 text-purple-700",
    MANAGER: "bg-blue-100 text-blue-700",
    CASHIER: "bg-orange-100 text-orange-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles[role]}`}
    >
      {role}
    </span>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [roleInput, setRoleInput] = useState("");
  const [statusInput, setStatusInput] = useState("");

  const [filters, setFilters] = useState<{
    search?: string;
    role?: UserRole;
    isActive?: boolean;
  }>({});

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [newUser, setNewUser] = useState({
    fullName: "",
    username: "",
    password: "",
    role: "CASHIER" as UserRole,
  });

  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const [editForm, setEditForm] = useState({
    fullName: "",
    role: "CASHIER" as UserRole,
  });

  const [passwordForm, setPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setEditForm({
      fullName: user.fullName,
      role: user.role,
    });
    setActionError("");
    setActionSuccess("");
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedUser) return;

    if (editForm.fullName.trim().length < 2) {
      setActionError("Full name must contain at least 2 characters.");
      return;
    }

    try {
      setUpdating(true);
      setActionError("");

      await updateUser(selectedUser.id, {
        fullName: editForm.fullName.trim(),
        role: editForm.role,
      });

      setShowEditModal(false);
      setActionSuccess("User updated successfully.");

      await loadUsers();
    } catch (err: any) {
      console.error("Could not update user:", err);
      setActionError(err?.response?.data?.message || "Could not update user.");
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    const action = user.isActive ? "deactivate" : "activate";

    if (
      !window.confirm(`Are you sure you want to ${action} ${user.fullName}?`)
    ) {
      return;
    }

    try {
      setActionError("");
      setActionSuccess("");

      await updateUser(user.id, {
        isActive: !user.isActive,
      });

      setActionSuccess(`${user.fullName} has been ${action}d successfully.`);

      await loadUsers();
    } catch (err: any) {
      console.error("Could not change user status:", err);
      setActionError(
        err?.response?.data?.message || "Could not change user status.",
      );
    }
  };

  const openPasswordModal = (user: User) => {
    setSelectedUser(user);
    setPasswordForm({
      newPassword: "",
      confirmPassword: "",
    });
    setActionError("");
    setShowPasswordModal(true);
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedUser) return;

    if (
      passwordForm.newPassword.length < 12 ||
      passwordForm.newPassword.length > 200
    ) {
      setActionError("Password must contain between 12 and 200 characters.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setActionError("Passwords do not match.");
      return;
    }

    try {
      setUpdating(true);
      setActionError("");

      await resetUserPassword(selectedUser.id, passwordForm.newPassword);

      setShowPasswordModal(false);
      setActionSuccess(
        `Password reset successfully for ${selectedUser.fullName}.`,
      );
    } catch (err: any) {
      console.error("Could not reset password:", err);
      setActionError(
        err?.response?.data?.message || "Could not reset password.",
      );
    } finally {
      setUpdating(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setCreateError("");

    if (
      newUser.fullName.trim().length < 2 ||
      newUser.fullName.trim().length > 150
    ) {
      setCreateError("Full name must contain between 2 and 150 characters.");
      return;
    }

    if (
      newUser.username.trim().length < 3 ||
      newUser.username.trim().length > 100
    ) {
      setCreateError("Username must contain between 3 and 100 characters.");
      return;
    }

    if (newUser.password.length < 12 || newUser.password.length > 200) {
      setCreateError("Password must contain between 12 and 200 characters.");
      return;
    }

    try {
      setCreating(true);

      await createUser({
        fullName: newUser.fullName.trim(),
        username: newUser.username.trim().toLowerCase(),
        password: newUser.password,
        role: newUser.role,
      });

      setShowCreateModal(false);
      setNewUser({
        fullName: "",
        username: "",
        password: "",
        role: "CASHIER",
      });

      setPage(1);
      await loadUsers();
    } catch (err: any) {
      console.error("Could not create user:", err);

      const status = err?.response?.status;

      if (status === 409) {
        setCreateError("This username is already in use.");
      } else if (status === 400) {
        setCreateError(
          err?.response?.data?.message ||
            "Please check the submitted information.",
        );
      } else {
        setCreateError("Could not create user. Please try again.");
      }
    } finally {
      setCreating(false);
    }
  };

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await getUsers({
        ...filters,
        page,
        limit: PAGE_SIZE,
      });

      setUsers(response.users);
      setTotal(response.pagination.total);
      setTotalPages(response.pagination.totalPages);
    } catch (err) {
      console.error("Could not load users:", err);
      setError("Could not load users. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const applyFilters = () => {
    setFilters({
      search: searchInput.trim() || undefined,
      role: (roleInput as UserRole) || undefined,
      isActive: statusInput === "" ? undefined : statusInput === "true",
    });

    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput("");
    setRoleInput("");
    setStatusInput("");
    setFilters({});
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Users</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage system users, roles, and account status.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setCreateError("");
            setShowCreateModal(true);
          }}
          className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-600"
        >
          + Add User
        </button>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-500">Total matching users</p>
        <p className="mt-1 text-2xl font-bold text-slate-800">{total}</p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Search
            </label>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="Name or username..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Role
            </label>
            <select
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="CASHIER">Cashier</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Account Status
            </label>
            <select
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">All Statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            Apply Filters
          </button>

          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear Filters
          </button>

          <button
            type="button"
            onClick={() => void loadUsers()}
            className="ml-auto rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Users table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Full Name</th>
                <th className="px-5 py-3 font-semibold">Username</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Created At</th>
                <th className="px-5 py-3 font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    Loading users...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-red-600"
                  >
                    {error}
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-800">
                      {user.fullName}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {user.username}
                    </td>
                    <td className="px-5 py-4">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge isActive={user.isActive} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(user)}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                            user.isActive
                              ? "bg-red-50 text-red-600 hover:bg-red-100"
                              : "bg-green-50 text-green-700 hover:bg-green-100"
                          }`}
                        >
                          {user.isActive ? "Deactivate" : "Activate"}
                        </button>

                        <button
                          type="button"
                          onClick={() => openPasswordModal(user)}
                          className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Reset Password
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
          <p className="text-sm text-slate-500">
            Page {page} of {Math.max(totalPages, 1)} · {total} users
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>

            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  Add New User
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create a new system account.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
                className="text-xl text-slate-400 hover:text-slate-700"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={150}
                  value={newUser.fullName}
                  onChange={(e) =>
                    setNewUser({ ...newUser, fullName: e.target.value })
                  }
                  placeholder="Enter full name"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Username
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={100}
                  value={newUser.username}
                  onChange={(e) =>
                    setNewUser({ ...newUser, username: e.target.value })
                  }
                  placeholder="Enter username"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Password
                </label>

                <div className="flex gap-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={12}
                    maxLength={200}
                    value={newUser.password}
                    onChange={(e) =>
                      setNewUser({ ...newUser, password: e.target.value })
                    }
                    placeholder="Minimum 12 characters"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Role
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser({
                      ...newUser,
                      role: e.target.value as UserRole,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                >
                  <option value="CASHIER">Cashier</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              {createError && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-800">
                Edit User
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Update {selectedUser.username}'s account information.
              </p>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Full Name
                </label>
                <input
                  required
                  minLength={2}
                  maxLength={150}
                  value={editForm.fullName}
                  onChange={(e) =>
                    setEditForm({ ...editForm, fullName: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Username
                </label>
                <input
                  value={selectedUser.username}
                  disabled
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Username cannot be changed.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Role
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      role: e.target.value as UserRole,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                >
                  <option value="CASHIER">Cashier</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              {actionError && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {actionError}
                </p>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => setShowEditModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={updating}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {updating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-800">
                Reset Password
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Set a new password for {selectedUser.username}.
              </p>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={200}
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      newPassword: e.target.value,
                    })
                  }
                  placeholder="Minimum 12 characters"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={200}
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      confirmPassword: e.target.value,
                    })
                  }
                  placeholder="Re-enter new password"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              {actionError && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {actionError}
                </p>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => setShowPasswordModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={updating}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {updating ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {actionSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {actionSuccess}
          <button
            type="button"
            onClick={() => setActionSuccess("")}
            className="ml-3 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
