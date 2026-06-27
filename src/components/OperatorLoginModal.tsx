import { useEffect, useState } from "react";
import { AppUser } from "@/types/label";
import { ensureDefaultAdmin, authenticateUser } from "@/services/userAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AlertTriangle, UserCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onAuth: (user: AppUser) => void;
  onCancel: () => void;
}

export function OperatorLoginModal({ open, onAuth, onCancel }: Props) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [userId, setUserId] = useState("");
  const [senha, setSenha] = useState("");
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!open) return;
    const list = ensureDefaultAdmin();
    setUsers(list);
    setUserId((current) => current || list[0]?.id || "");
    setSenha("");
    setErr(false);
  }, [open]);

  const submit = () => {
    const selected = users.find((u) => u.id === userId);
    if (!selected) return setErr(true);
    const user = authenticateUser(selected.nome, senha);
    if (!user) return setErr(true);
    onAuth(user);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-primary" /> Quem esta imprimindo?
          </DialogTitle>
          <DialogDescription>
            Selecione seu usuario e informe a senha para registrar a impressao.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Usuario</label>
            <Select value={userId} onValueChange={(v) => { setUserId(v); setErr(false); }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o usuario" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Senha</label>
            <Input
              type="password"
              value={senha}
              onChange={(e) => { setSenha(e.target.value); setErr(false); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Senha"
              autoFocus
            />
          </div>
          {err && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Usuario ou senha invalidos
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>Cancelar</Button>
            <Button className="flex-1" onClick={submit}>Entrar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
