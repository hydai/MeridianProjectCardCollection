import type { ReactNode } from "react";

export function AcquisitionActionBar({
  label,
  quantity,
  kinds,
  description,
  children,
}: {
  label: string;
  quantity: number;
  kinds: number;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card shadow-lg"
    >
      <div className="mx-auto flex max-w-[940px] items-center justify-between gap-3 px-7 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:flex-col max-sm:items-stretch max-sm:px-4">
        <div
          className="flex flex-wrap items-baseline gap-x-4 gap-y-1"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="font-medium text-foreground">
            {quantity} 張 · {kinds} 種
          </p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 gap-2 max-sm:*:min-h-11 max-sm:*:flex-1">
          {children}
        </div>
      </div>
    </section>
  );
}
