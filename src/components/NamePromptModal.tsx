import { useEffect, useRef, useState } from "react";
import { storage } from "@/services/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { UserCircle2, Plus, X } from "lucide-react";

interface Props {
  open: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function NamePromptModal({ open, onConfirm, onCancel }: Props) {
  const [names, setNames] = useState<string[]>([]);
  const [novo, setNovo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setNames(storage.getNames());
    setNovo("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const pick = (name: string) => {
    const next = storage.addName(name);
    setNames(next);
    onConfirm(name.trim());
  };

  const addNovo = () => {
    const clean = novo.trim();
    if (!clean) return;
    pick(clean);
  };

  const remove = (name: string) => {
    setNames(storage.removeName(name));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-primary" /> Quem esta imprimindo?
          </DialogTitle>
          <DialogDescription>
            Escolha um nome da lista ou digite um novo. Ele fica salvo para a proxima vez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNovo()}
              placeholder="Digite um nome novo"
            />
            <Button onClick={addNovo} disabled={!novo.trim()}>
              <Plus className="h-4 w-4" /> Usar
            </Button>
          </div>

          {names.length > 0 && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Nomes salvos
              </label>
              <div className="mt-1.5 max-h-60 space-y-1.5 overflow-auto pr-1">
                {names.map((name) => (
                  <div key={name} className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 justify-start h-10 text-sm"
                      onClick={() => pick(name)}
                    >
                      <UserCircle2 className="h-4 w-4 text-muted-foreground" /> {name}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(name)}
                      title="Remover da lista"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {names.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhum nome salvo ainda. Digite o primeiro nome acima.
            </p>
          )}

          <Button variant="ghost" className="w-full" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
