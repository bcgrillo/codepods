import { Separator } from "react-resizable-panels"
import { cn } from "@/lib/utils"

export { Group as ResizablePanelGroup, Panel as ResizablePanel, usePanelRef, useDefaultLayout } from "react-resizable-panels"

export function ResizableHandle({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn(
        "group relative flex w-px items-center justify-center bg-border transition-colors hover:bg-primary/40",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-1.5 after:-translate-x-1/2 hover:after:bg-primary/10",
        className
      )}
      {...props}
    />
  )
}
