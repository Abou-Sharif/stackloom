import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function AppModal({ open, onOpenChange, title, description, children, footer, className }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md gap-3 p-4", className)}>
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle className="text-base">{title}</DialogTitle>}
            {description && <DialogDescription className="text-xs">{description}</DialogDescription>}
          </DialogHeader>
        )}
        <div className="text-sm">{children}</div>
        {footer && <DialogFooter className="gap-2 sm:gap-0">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
