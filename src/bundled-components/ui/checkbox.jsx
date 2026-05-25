import * as React from "react"
import { cn } from "@/lib/utils"

export function Checkbox({ className, checked = false, onCheckedChange, ...props }) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      className={cn(
        "peer flex items-center justify-center rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 h-4 w-4 shrink-0",
        checked ? "bg-primary text-primary-foreground" : "bg-background",
        className
      )}
      onClick={(e) => { e.preventDefault(); onCheckedChange?.(!checked); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCheckedChange?.(!checked); } }}
      {...props}
    >
      {checked && <div className="h-4 w-4 rounded-sm bg-current" />}
    </div>
  )
}
