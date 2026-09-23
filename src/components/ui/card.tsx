import * as React from "react";
import { cn } from "./utils";
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => <div ref={ref} className={cn("research-card rounded-xl border", className)} {...props} />);
Card.displayName = "Card";
