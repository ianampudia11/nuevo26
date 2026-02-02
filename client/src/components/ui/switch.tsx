import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { Zap, FlashlightOff } from "lucide-react"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
    variant?: "default" | "brand"
  }
>(({ className, variant = "default", ...props }, ref) => (
  <SwitchPrimitives.Root
    data-radix-switch-root
    className={cn(
      "inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-0 transition-all duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 shadow-sm",
      variant === "brand"
        ? "data-[state=unchecked]:bg-purple-200 dark:data-[state=unchecked]:bg-purple-900/30 data-[state=checked]:bg-green-500 dark:data-[state=checked]:bg-green-600"
        : "data-[state=checked]:bg-green-500 dark:data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-purple-200 dark:data-[state=unchecked]:bg-purple-900/30",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none flex items-center justify-center h-6 w-6 rounded-full bg-white shadow-md ring-0 transition-all duration-300 ease-in-out data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5"
      )}
    >
      <Zap data-switch-icon="on" className="h-3.5 w-3.5 text-primary dark:text-primary" fill="currentColor" />
      <FlashlightOff data-switch-icon="off" className="h-3.5 w-3.5 text-purple-400 dark:text-purple-300" strokeWidth={2} />
    </SwitchPrimitives.Thumb>
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
