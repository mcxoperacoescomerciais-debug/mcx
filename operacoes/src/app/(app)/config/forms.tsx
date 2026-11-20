"use client";
import { useState } from "react";
import { createUserAction, saveCategoryAction, updateUserAction } from "@/app/actions";
import { useRun } from "@/components/use-run";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/domain";

export function CategoryRow({ category }: { category: { id: string; name: string; active: boolean } }) {
  const { run, pending, message } = useRun();
  const [name, setName] = useState(category.name);
  const [active, setActive] = useState(category.active);
  return (
    <li className="card space-y-2 p-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveCategoryAction(category.id, { name, active }));
        }}
      >
        <label className="sr-only" htmlFor={`cat-${category.id}`}>Nome da categoria</label>
        <input id={`cat-${category.id}`} className="field min-w-0 flex-1" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" className="size-4" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativa
        </label>
        <button className="btn-ghost" disabled={pending}>Salvar</button>
      </form>
      {message}
    </li>
  );
}

export function NewCategory() {
  const { run, pending, message } = useRun();
  const [name, setName] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveCategoryAction(null, { name }), () => setName(""));
      }}
    >
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="cat-new">Nova categoria</label>
        <input id="cat-new" className="field" placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        <button className="btn-primary shrink-0" disabled={pending}>Criar</button>
      </div>
      {message}
    </form>
  );
}

export function UserRow({ user, self }: { user: { id: string; name: string; username: string; role: Role; status: "active" | "inactive"; lastLogin: string | null; mustChangePassword: boolean }; self: boolean }) {
  const { run, pending, message } = useRun();
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [password, setPassword] = useState("");
  return (
    <li className="card space-y-3 p-4">
      <div>
        <p className="font-semibold text-ink">{user.name} <span className="font-normal text-muted">· {user.username}{self ? " (você)" : ""}</span></p>
        <p className="text-xs text-muted">
          {user.lastLogin ? `Último acesso: ${user.lastLogin}` : "Ainda não entrou"}
          {user.mustChangePassword && " · precisa trocar a senha no próximo acesso"}
        </p>
      </div>
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateUserAction(user.id, { role, status, resetPassword: password || undefined }), () => setPassword(""));
        }}
      >
        <div>
          <label className="label" htmlFor={`u-role-${user.id}`}>Papel</label>
          <select id={`u-role-${user.id}`} className="field" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={self}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`u-status-${user.id}`}>Acesso</label>
          <select id={`u-status-${user.id}`} className="field" value={status} onChange={(e) => setStatus(e.target.value as "active" | "inactive")} disabled={self}>
            <option value="active">Ativo</option>
            <option value="inactive">Desativado</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`u-pass-${user.id}`}>Redefinir senha (opcional)</label>
          <input id={`u-pass-${user.id}`} type="password" autoComplete="new-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
        </div>
        <button className="btn-ghost" disabled={pending}>Salvar</button>
      </form>
      {message}
    </li>
  );
}

export function NewUser() {
  const { run, pending, message } = useRun();
  const empty = { name: "", username: "", role: "operacional" as Role, password: "" };
  const [f, setF] = useState(empty);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createUserAction(f), () => setF(empty));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="nu-name">Nome</label>
          <input id="nu-name" className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} />
        </div>
        <div>
          <label className="label" htmlFor="nu-user">Usuário (para entrar)</label>
          <input id="nu-user" className="field" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required minLength={3} />
        </div>
        <div>
          <label className="label" htmlFor="nu-role">Papel</label>
          <select id="nu-role" className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="nu-pass">Senha inicial</label>
          <input id="nu-pass" type="password" autoComplete="new-password" className="field" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={6} />
        </div>
      </div>
      <p className="text-xs text-muted">A pessoa troca a senha no primeiro acesso.</p>
      {message}
      <button className="btn-primary" disabled={pending}>Cadastrar</button>
    </form>
  );
}
