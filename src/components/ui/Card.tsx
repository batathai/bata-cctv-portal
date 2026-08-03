import type { HTMLAttributes } from "react";
import clsx from "clsx";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/10 rounded-card shadow-card",
        className
      )}
      {...rest}
    />
  );
}

export function SectionTitle({ children, icon: Icon }: { children: React.ReactNode; icon?: any }) {
  return (
    <div className="flex items-center gap-2 font-display font-semibold text-sm text-ink dark:text-white mb-3">
      {Icon && <Icon size={15} className="text-brand" />}
      {children}
    </div>
  );
}
