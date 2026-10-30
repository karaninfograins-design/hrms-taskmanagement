import type { ReactNode } from "react";

type DashboardWelcomeProps = {
  name?: string;
  eyebrow?: string;
  subtitle?: string;
  role?: string;
  actions?: ReactNode;
  className?: string;
};

export function DashboardWelcome({
  name = "User",
  eyebrow = "SYSTEM ADMINISTRATION",
  subtitle = "Create administrator accounts and prepare the workspace for your team.",
  role,
  actions,
  className = "",
}: DashboardWelcomeProps) {
  const firstName = name ? name.split(" ")[0] : "User";

  return (
    <div
      className={`welcome flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-6 ${className}`}
      id="overview"
    >
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-[10px] sm:text-xs font-extrabold uppercase tracking-widest text-orange-600 mb-1">
          {eyebrow}
        </p>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 break-words leading-tight">
          Welcome back, {firstName}.
        </h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl font-medium leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      {(role || actions) && (
        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto flex-wrap">
          {role && (
            <span className="px-3 py-1 rounded-lg bg-orange-50 text-orange-700 font-extrabold text-[11px] sm:text-xs border border-orange-200 uppercase tracking-wider">
              {role.replace(/_/g, " ")}
            </span>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
