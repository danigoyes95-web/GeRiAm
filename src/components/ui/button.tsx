import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background,color,border,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-[#04121a] hover:bg-accent-strong shadow-[0_0_0_1px_rgba(34,211,238,.4),0_8px_24px_-12px_rgba(34,211,238,.6)]",
        secondary: "bg-surface-2 text-fg border border-border hover:bg-surface-hover hover:border-border-strong",
        ghost: "text-fg-muted hover:text-fg hover:bg-surface-2",
        outline: "border border-border-strong text-fg hover:bg-surface-2",
        danger: "bg-lvl-roja text-white hover:brightness-110",
        warning: "bg-lvl-naranja text-[#1a0c02] hover:brightness-110",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-4",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
export { buttonVariants };
