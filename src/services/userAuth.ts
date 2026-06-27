import { AppUser, UserLevel } from "@/types/label";
import { storage } from "./storage";

const ADMIN_ID = "admin";

function normalizeName(nome: string) {
  return nome.trim();
}

export function validatePassword(senha: string): string | null {
  if (senha.length < 2) return "Senha deve ter no minimo 2 caracteres";
  if (senha.length > 10) return "Senha deve ter no maximo 10 caracteres";
  return null;
}

export function ensureDefaultAdmin(): AppUser[] {
  const users = storage.getUsers();
  if (users.length > 0) return users;
  const admin: AppUser = {
    id: ADMIN_ID,
    nome: "ADMIN",
    senha: "1148",
    nivel: "super",
    criadoEm: Date.now(),
  };
  storage.saveUsers([admin]);
  return [admin];
}

export function authenticateUser(nome: string, senha: string): AppUser | null {
  const users = ensureDefaultAdmin();
  const target = normalizeName(nome).toUpperCase();
  const user = users.find((u) => u.nome.toUpperCase() === target);
  if (!user || user.senha !== senha) return null;
  return user;
}

export function createUser(nome: string, senha: string, nivel: UserLevel): AppUser {
  const nomeTrim = normalizeName(nome);
  if (!nomeTrim) throw new Error("Informe um nome de usuario");
  const senhaError = validatePassword(senha);
  if (senhaError) throw new Error(senhaError);

  const users = ensureDefaultAdmin();
  if (users.some((u) => u.nome.toUpperCase() === nomeTrim.toUpperCase())) {
    throw new Error("Ja existe um usuario com esse nome");
  }

  const user: AppUser = {
    id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    nome: nomeTrim,
    senha,
    nivel,
    criadoEm: Date.now(),
  };
  storage.saveUsers([...users, user]);
  return user;
}

export function deleteUser(id: string): void {
  const users = ensureDefaultAdmin();
  const target = users.find((u) => u.id === id);
  if (!target) return;
  const remainingSuper = users.filter((u) => u.nivel === "super" && u.id !== id);
  if (target.nivel === "super" && remainingSuper.length === 0) {
    throw new Error("Nao e possivel remover o ultimo usuario com nivel super");
  }
  storage.saveUsers(users.filter((u) => u.id !== id));
}
