import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  // Guard a non-positive max, then clamp value into [0, max] so the ARIA value
  // and the visual fill stay consistent at any scale. null/undefined stays
  // indeterminate (Radix omits the value attributes).
  const safeMax = max > 0 ? max : 100;
  const clamped = value == null ? null : Math.min(safeMax, Math.max(0, value));
  const fill = clamped == null ? 0 : (clamped / safeMax) * 100;
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className,
      )}
      value={clamped}
      max={safeMax}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="size-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - fill}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
