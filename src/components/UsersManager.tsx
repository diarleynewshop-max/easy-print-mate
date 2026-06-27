import { useState } from "react";
import { AppUser } from "@/types/label";
import { ensureDefaultAdmin, createUser, deleteUser } from "@/services/userAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Lock, Trash2, UserPlus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface Props {
  operator: AppUser | null;
}

export function UsersManager({ operator }: Props) {
  const [users, setUsers] = useState<AppUser[]>(() => ensureDefaultAdmin());
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [nivel, setNivel] = useState<"super" | "padrao">("padrao");

  const isSuper = operator?.nivel === "super";

  const refresh = () => setUsers(ensureDefaultAdmin());

  const handleCreate = () => {
    try {
      createUser(nome, senha, nivel);
      setNome("");
      setSenha("");
      setNivel("padrao");
      refresh();
      toast.success("Usuario criado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar usuario");
    }
  };

  const handleDelete = (u: AppUser) => {
    if (!confirm(`Remover o usuario "${u.nome}"?`)) return;
    try {
      deleteUser(u.id);
      refresh();
      toast.success("Usuario removido");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover usuario");
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Usuarios cadastrados</h3>
          <p className="text-xs text-muted-foreground">Usado para registrar quem imprimiu cada etiqueta.</p>
        </div>
        <div className="divide-y">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                {u.nivel === "super" ? <ShieldCheck className="h-4 w-4 text-primary" /> : <span className="h-4 w-4" />}
                <span className="font-medium text-sm">{u.nome}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{u.nivel}</span>
              </div>
              {isSuper && (
                <Button size="sm" variant="ghost" onClick={() => handleDelete(u)} title="Remover usuario">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {isSuper ? (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><UserPlus className="h-4 w-4" /> Novo usuario</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nome</label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do usuario" />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Senha (2 a 10 caracteres)</label>
              <Input value={senha} onChange={(e) => setSenha(e.target.value)} maxLength={10} placeholder="Senha" />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nivel de acesso</label>
              <Select value={nivel} onValueChange={(v) => setNivel(v as "super" | "padrao")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="padrao">Padrao</SelectItem>
                  <SelectItem value="super">Super (pode criar usuarios)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={!nome.trim() || senha.length < 2}>Criar usuario</Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground flex items-center gap-2">
          <Lock className="h-4 w-4" /> Apenas usuarios de nivel super podem criar ou remover usuarios.
        </div>
      )}
    </div>
  );
}
