import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function AppModal({ open, onOpenChange, title, description, children, footer, className }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-3xl max-h-[90vh] overflow-y-auto", className)}>
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle className="text-xl">{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        {children}
        {footer && <DialogFooter className="flex-row gap-2 sm:justify-end">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
