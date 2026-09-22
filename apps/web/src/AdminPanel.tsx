import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AdminAction, AdminAuditEntry, AdminUser } from "@adgenda/shared";
import {
  adminAudit,
  adminConfirmEmail,
  adminRemoveUser,
  adminSendPasswordReset,
  adminSetAdmin,
  adminSetBlocked,
  adminUpdateUser,
  adminUsers,
  initialsOf,
  type AdminFilter,
  type SessionUser,
} from "./api";
import { FOCUS_RING, Modal, fieldClass } from "./ui";

const FILTERS: { value: AdminFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativos" },
  { value: "inativo", label: "Bloqueados" },
  { value: "admin", label: "Administradores" },
  { value: "removido", label: "Removidos" },
];

const ACTION_LABEL: Record<AdminAction, string> = {
  conta_alterada: "alterou os dados de",
  conta_bloqueada: "bloqueou",
  conta_desbloqueada: "desbloqueou",
  conta_removida: "removeu a conta de",
  email_confirmado: "confirmou o e-mail de",
  senha_redefinicao_enviada: "enviou redefinição de senha para",
  admin_concedido: "deu acesso de administrador a",
  admin_revogado: "tirou o acesso de administrador de",
};

function formatDateTime(iso: string | null) {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : "Não foi possível concluir a operação.";
}

export function AdminPanel({
  user,
  onMenu,
  onBack,
  onToast,
}: {
  user: SessionUser;
  onMenu: () => void;
  onBack: () => void;
  onToast: (message: string) => void;
}) {
  const [tab, setTab] = useState<"contas" | "registro">("contas");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AdminFilter>("todos");
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [audit, setAudit] = useState<AdminAuditEntry[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setRows(await adminUsers(query.trim(), filter, signal));
        setError(null);
      } catch (cause) {
        if (!signal?.aborted) setError(messageOf(cause));
      }
    },
    [query, filter],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void reload(controller.signal), query ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [reload, query]);

  useEffect(() => {
    if (tab !== "registro") return;
    adminAudit().then(setAudit, (cause) => setError(messageOf(cause)));
  }, [tab]);

  const selected = rows?.find((row) => row.id === selectedId) ?? null;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b border-line bg-surface/90 px-3 py-2 backdrop-blur md:gap-3 md:px-6 md:py-3">
        <button
          type="button"
          aria-label="Abrir menu"
          onClick={onMenu}
          className={`-ml-1 rounded-full p-2 text-ink transition hover:bg-surface-muted active:scale-90 lg:hidden ${FOCUS_RING}`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">Administração</p>
          <p className="truncate text-xs text-muted">Contas de acesso ao Adgenda</p>
        </div>
        <div role="tablist" aria-label="Seção" className="flex rounded-full bg-surface-muted p-1">
          {(["contas", "registro"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition duration-200 active:scale-95 ${FOCUS_RING} ${
                tab === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {value === "contas" ? "Contas" : "Registro"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onBack}
          className={`rounded-full border border-line px-3 py-1.5 text-sm transition hover:border-accent hover:bg-accent-soft hover:text-accent active:scale-95 ${FOCUS_RING}`}
        >
          Voltar à agenda
        </button>
      </header>

      <main className="relative z-0 flex-1 overflow-auto p-3 md:p-6">
        {error ? <p className="mb-3 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p> : null}

        {tab === "contas" ? (
          <section className="space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nome, e-mail ou cargo"
                aria-label="Buscar contas"
                className={`${fieldClass} md:max-w-sm`}
              />
              <div className="no-scrollbar flex gap-1 overflow-x-auto">
                {FILTERS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilter(item.value)}
                    aria-pressed={filter === item.value}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${FOCUS_RING} ${
                      filter === item.value
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line text-muted hover:border-accent/50 hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
              <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_5rem_9rem] gap-3 border-b border-line bg-surface-muted px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted md:grid">
                <span>Conta</span>
                <span>Cargo</span>
                <span className="text-right">Agendas</span>
                <span>Último acesso</span>
              </div>
              {rows === null ? (
                <p className="px-4 py-8 text-center text-sm text-muted">Carregando contas…</p>
              ) : rows.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">Nenhuma conta encontrada.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-muted md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_5rem_9rem] ${FOCUS_RING}`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${
                              row.status === "ativo" ? "bg-ink" : "bg-muted"
                            }`}
                          >
                            {initialsOf(row.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-sm font-medium">{row.name}</span>
                              <UserBadges row={row} />
                            </span>
                            <span className="block truncate text-xs text-muted">{row.email}</span>
                          </span>
                        </span>
                        <span className="truncate text-sm text-muted md:text-ink">
                          <span className="md:hidden">{row.agendas} ag.</span>
                          <span className="hidden md:inline">{row.role || "—"}</span>
                        </span>
                        <span className="hidden text-right text-sm tabular-nums md:block">{row.agendas}</span>
                        <span className="hidden text-sm text-muted md:block">{formatDateTime(row.lastAccessAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {rows && rows.length >= 500 ? (
              <p className="text-xs text-muted">Mostrando as primeiras 500 contas. Refine a busca para ver as demais.</p>
            ) : null}
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            {audit === null ? (
              <p className="px-4 py-8 text-center text-sm text-muted">Carregando registro…</p>
            ) : audit.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">Nenhuma ação administrativa registrada.</p>
            ) : (
              <ul className="divide-y divide-line">
                {audit.map((entry) => (
                  <li key={entry.id} className="px-4 py-3 text-sm">
                    <p>
                      <strong className="font-medium">{entry.actorName}</strong> {ACTION_LABEL[entry.action] ?? entry.action}{" "}
                      <strong className="font-medium">{entry.targetName}</strong>
                    </p>
                    {entry.details ? <p className="mt-0.5 break-words text-xs text-muted">{entry.details}</p> : null}
                    <p className="mt-0.5 text-[11px] text-muted">{formatDateTime(entry.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      {selected ? (
        <UserDetail
          key={selected.id}
          row={selected}
          self={selected.id === user.id}
          onClose={() => setSelectedId(null)}
          onChanged={async (message, closeAfter) => {
            onToast(message);
            if (closeAfter) setSelectedId(null);
            setAudit(null);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function UserBadges({ row }: { row: AdminUser }) {
  return (
    <>
      {row.isAdmin ? <Badge tone="accent">Admin</Badge> : null}
      {row.status === "inativo" ? <Badge tone="warn">Bloqueada</Badge> : null}
      {row.status === "removido" ? <Badge tone="muted">Removida</Badge> : null}
      {row.status !== "removido" && !row.emailVerified ? <Badge tone="muted">E-mail pendente</Badge> : null}
    </>
  );
}

function Badge({ tone, children }: { tone: "accent" | "warn" | "muted"; children: ReactNode }) {
  const toneClass =
    tone === "accent"
      ? "bg-accent-soft text-accent"
      : tone === "warn"
        ? "bg-amber-100 text-amber-800"
        : "bg-surface-muted text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClass}`}>{children}</span>;
}

function UserDetail({
  row,
  self,
  onClose,
  onChanged,
}: {
  row: AdminUser;
  self: boolean;
  onClose: () => void;
  onChanged: (message: string, closeAfter?: boolean) => Promise<void>;
}) {
  const [form, setForm] = useState({ name: row.name, email: row.email, role: row.role });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeText, setRemoveText] = useState("");
  const removed = row.status === "removido";
  const dirty = form.name !== row.name || form.email !== row.email || form.role !== row.role;

  async function run(key: string, action: () => Promise<unknown>, message: string, closeAfter = false) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await onChanged(message, closeAfter);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
          {initialsOf(row.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{row.name}</h2>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <UserBadges row={row} />
            {self ? <Badge tone="muted">Você</Badge> : null}
          </div>
        </div>
        <button type="button" aria-label="Fechar" onClick={onClose} className="-mr-2 rounded-full px-2 py-1 text-xl leading-none text-muted hover:text-ink">
          ×
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-muted p-3 text-xs">
        <div>
          <dt className="text-muted">Criada em</dt>
          <dd className="mt-0.5 font-medium">{formatDateTime(row.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">Último acesso</dt>
          <dd className="mt-0.5 font-medium">{formatDateTime(row.lastAccessAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">Agendas</dt>
          <dd className="mt-0.5 font-medium">{row.agendas}</dd>
        </div>
      </dl>

      {removed ? (
        <p className="mt-4 text-sm text-muted">Esta conta foi removida. Os dados pessoais foram apagados e o acesso não pode ser restaurado.</p>
      ) : (
        <>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run("save", () => adminUpdateUser(row.id, form), "Dados da conta atualizados.");
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Nome</span>
              <input className={fieldClass} value={form.name} required onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">E-mail</span>
              <input className={fieldClass} type="email" value={form.email} required onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Cargo</span>
              <input className={fieldClass} value={form.role} required onChange={(event) => setForm({ ...form, role: event.target.value })} />
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!dirty || busy !== null}
                className="rounded-lg bg-accent px-4 py-2 text-sm text-white transition hover:brightness-110 active:scale-95 disabled:opacity-40"
              >
                {busy === "save" ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </form>

          <div className="mt-5 space-y-2 border-t border-line pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Acesso</p>
            {!row.emailVerified ? (
              <ActionRow
                label="E-mail não confirmado"
                action="Confirmar"
                hint="Libera o acesso de quem não recebeu o e-mail de confirmação."
                busy={busy === "confirm"}
                disabled={busy !== null}
                onClick={() => run("confirm", () => adminConfirmEmail(row.id), "E-mail confirmado.")}
              />
            ) : null}
            <ActionRow
              label="Redefinição de senha"
              action="Enviar link"
              hint="A pessoa recebe um link por e-mail para criar uma nova senha."
              busy={busy === "reset"}
              disabled={busy !== null || row.status !== "ativo" || !row.emailVerified}
              onClick={() => run("reset", () => adminSendPasswordReset(row.id), `Link de redefinição enviado para ${row.email}.`)}
            />
            <ActionRow
              label={row.isAdmin ? "Administrador" : "Usuário comum"}
              action={row.isAdmin ? "Tirar admin" : "Tornar admin"}
              hint={self ? "Você não pode alterar o próprio acesso." : "Administradores acessam este painel."}
              busy={busy === "admin"}
              disabled={busy !== null || self}
              onClick={() =>
                run("admin", () => adminSetAdmin(row.id, !row.isAdmin), row.isAdmin ? "Acesso de administrador removido." : "Conta agora é administradora.")
              }
            />
            <ActionRow
              label={row.status === "inativo" ? "Conta bloqueada" : "Conta ativa"}
              action={row.status === "inativo" ? "Desbloquear" : "Bloquear"}
              hint={
                self
                  ? "Você não pode bloquear a própria conta."
                  : row.status === "inativo"
                    ? "A pessoa volta a conseguir entrar."
                    : "Encerra as sessões abertas e impede novos acessos. Pode ser desfeito."
              }
              tone={row.status === "inativo" ? "default" : "warn"}
              busy={busy === "block"}
              disabled={busy !== null || self}
              onClick={() =>
                run("block", () => adminSetBlocked(row.id, row.status !== "inativo"), row.status === "inativo" ? "Conta desbloqueada." : "Conta bloqueada.")
              }
            />
          </div>

          {!self ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50/60 p-3">
              <p className="text-sm font-medium text-red-800">Remover conta (colaborador desligado)</p>
              <p className="mt-1 text-xs text-red-800/80">
                Apaga nome, e-mail e senha e encerra o acesso. As viagens continuam no histórico como “Conta removida”. Agendas em que a pessoa era a
                única administradora passam para o integrante mais antigo ou são arquivadas. Não pode ser desfeito.
              </p>
              {confirmRemove ? (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs text-red-800">
                    Digite <strong className="select-all">{row.email}</strong> para confirmar
                    <input
                      autoFocus
                      className={`${fieldClass} mt-1 border-red-200 focus:border-red-500 focus:ring-red-100`}
                      value={removeText}
                      onChange={(event) => setRemoveText(event.target.value)}
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setConfirmRemove(false)} className="rounded-lg px-3 py-2 text-sm">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={removeText.trim().toLowerCase() !== row.email || busy !== null}
                      onClick={() => run("remove", () => adminRemoveUser(row.id), `Conta de ${row.name} removida.`, true)}
                      className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 active:scale-95 disabled:opacity-40"
                    >
                      {busy === "remove" ? "Removendo…" : "Remover definitivamente"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className="mt-3 rounded-lg border border-red-300 bg-surface px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 active:scale-95"
                >
                  Remover conta…
                </button>
              )}
            </div>
          ) : null}
        </>
      )}

      {error ? <p className="form-error mt-3 text-sm text-red-700">{error}</p> : null}
    </Modal>
  );
}

function ActionRow({
  label,
  action,
  hint,
  tone = "default",
  busy,
  disabled,
  onClick,
}: {
  label: string;
  action: string;
  hint: string;
  tone?: "default" | "warn";
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 disabled:opacity-40 ${FOCUS_RING} ${
          tone === "warn"
            ? "border-amber-300 text-amber-800 hover:bg-amber-50"
            : "border-line hover:border-accent hover:bg-accent-soft hover:text-accent"
        }`}
      >
        {busy ? "…" : action}
      </button>
    </div>
  );
}
