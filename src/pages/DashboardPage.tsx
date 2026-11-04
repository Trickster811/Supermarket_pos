import { ShoppingCart, Package, Users, TrendingUp } from "lucide-react";

const metrics = [
  {
    label: "Today's sales",
    value: "0 XAF",
    description: "Sales recorded today",
    icon: TrendingUp,
  },
  {
    label: "Transactions",
    value: "0",
    description: "Completed transactions",
    icon: ShoppingCart,
  },
  {
    label: "Products",
    value: "0",
    description: "Registered products",
    icon: Package,
  },
  {
    label: "Cashiers",
    value: "0",
    description: "Registered cashiers",
    icon: Users,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          Here's an overview of your supermarket operations.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, description, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{label}</p>
              <div className="rounded-lg bg-orange-50 p-2 text-orange-600">
                <Icon size={18} />
              </div>
            </div>
            <p className="mt-4 text-2xl font-semibold text-slate-900">
              {value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{description}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-800">Recent activity</h2>
        <p className="mt-2 text-sm text-slate-500">
          Sales and operational activity will appear here.
        </p>
        <div className="mt-8 flex min-h-40 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
          No activity to display yet.
        </div>
      </div>
    </div>
  );
}
