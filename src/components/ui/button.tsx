import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Hearth buttons. Colors come from the --button-* tokens in globals.css (see
// docs/design/hearth/theme.css). Every variant has a fill or a border, so no
// action renders as floating text; button-styling.test.ts enforces that
// tappable elements use this component or buttonVariants().
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-1.5 border-[1.5px] border-transparent font-bold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-button-primary text-button-primary-foreground hover:bg-button-primary/90",
        secondary:
          "bg-button-secondary text-button-secondary-foreground hover:bg-button-secondary/80",
        outline:
          "border-button-outline-border bg-button-outline text-button-outline-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "border-button-destructive-border bg-button-destructive text-button-destructive-foreground hover:bg-destructive/10 focus-visible:border-destructive focus-visible:ring-destructive/20",
        success: "bg-button-success text-button-success-foreground hover:bg-button-success/90",
        neutral:
          "bg-button-neutral text-button-neutral-foreground hover:text-strong aria-expanded:text-strong",
      },
      size: {
        default: "min-h-tap rounded-input px-4 text-sm",
        block: "min-h-tap w-full rounded-input px-4 py-3.5 text-base",
        // Pills and icon chips sit visually smaller than a tap target; the
        // ::after overlay stretches their hit area to 44px.
        pill: "rounded-full px-3.5 py-1.5 text-sm after:absolute after:inset-x-0 after:-inset-y-1.5",
        icon: "size-9 rounded-full after:absolute after:-inset-1 [&_svg:not([class*='size-'])]:size-[18px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
