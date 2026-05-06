import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { ScanLine } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
}

export const ProductSearch = forwardRef<HTMLInputElement, Props>(({ value, onChange, onSubmit, loading }, ref) => {
  return (
    <div className="relative">
      <ScanLine className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
      <Input
        ref={ref}
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Bipe ou digite o código de barras e pressione Enter..."
        className="h-16 pl-14 text-2xl font-mono tracking-wider"
        disabled={loading}
      />
    </div>
  );
});
ProductSearch.displayName = "ProductSearch";
