import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AgendaSummary,
  AppNotification,
  HistoryEntry,
  Invite,
  InviteCandidate,
  Member,
  PeriodView,
  Trip,
} from "@adgenda/shared";
import { PERIOD_VIEWS } from "@adgenda/shared";
import { AuthScreen } from "./AuthScreen";
import {
  acceptInvite,
  cancelTrip as cancelTripRequest,
  createAgenda,
  createTrip,
  initialsOf,
  inviteMember,
  inviteSuggestions,
  listAgendas,
  listHistory,
  listInvites,
  listMembers,
  listNotifications,
  listTrips,
  logoutAccount,
  markAllNotificationsRead,
  markNotificationRead,
  me,
  removeTrip,
  updateTrip,
  type SessionUser,
} from "./api";
import {
  WEEKDAYS,
  monthCells,
  monthsInRange,
  periodRange,
  shiftPeriod,
  weekCells,
} from "./dates";

const PERIOD_LABEL: Record<PeriodView, string> = {
  semana: "Semana",
  mes: "Mês",
  trimestre: "Trimestre",
  semestre: "Semestre",
  ano: "Ano",
};

const fieldClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition duration-200 focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">
        Carregando Adgenda…
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={setUser} />;
  }

  return (
    <Agenda
      user={user}
      onLogout={async () => {
        await logoutAccount().catch(() => undefined);
        setUser(null);
      }}
    />
  );
}

function Agenda({
  user,
  onLogout,
}: {
  user: SessionUser;
  onLogout: () => void;
}) {
  const [agendas, setAgendas] = useState<AgendaSummary[]>([]);
  const [agendaId, setAgendaId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [period, setPeriod] = useState<PeriodView>("mes");
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [composer, setComposer] = useState<"create" | "edit" | "agenda" | "invite" | null>(null);
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const range = useMemo(() => periodRange(period, cursor), [period, cursor]);
  const agenda = agendas.find((item) => item.id === agendaId) ?? null;
  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) ?? null;
  const isAdmin = agenda?.participationType === "administrador";
  const unread = notifications.filter((item) => !item.readAt).length;

  const reloadAgendas = useCallback(async (preferredId?: string | null) => {
    const items = await listAgendas();
    setAgendas(items);
    setAgendaId((current) => preferredId ?? current ?? items[0]?.id ?? null);
  }, []);

  const reloadBoard = useCallback(async () => {
    if (!agendaId) {
      setMembers([]);
      setTrips([]);
      setHistory([]);
      return;
    }
    const [memberRows, tripRows, historyRows] = await Promise.all([
      listMembers(agendaId),
      listTrips(agendaId, range.from, range.to),
      listHistory(agendaId),
    ]);
    setMembers(memberRows);
    setTrips(tripRows);
    setHistory(historyRows);
  }, [agendaId, range.from, range.to]);

  const reloadInbox = useCallback(async () => {
    const [inviteRows, notificationRows] = await Promise.all([listInvites(), listNotifications()]);
    setInvites(inviteRows);
    setNotifications(notificationRows);
  }, []);

  useEffect(() => {
    void reloadAgendas().catch((error) => setToast(error.message));
    void reloadInbox().catch((error) => setToast(error.message));
  }, [reloadAgendas, reloadInbox]);

  useEffect(() => {
    void reloadBoard().catch((error) => setToast(error.message));
  }, [reloadBoard]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedTripId(null);
        setComposer(null);
        setNotificationsOpen(false);
        setHistoryOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!notificationsOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (notificationsRef.current?.contains(event.target as Node)) return;
      setNotificationsOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [notificationsOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function tripsOn(iso: string) {
    return trips.filter((trip) => trip.startDate <= iso && trip.endDate >= iso);
  }

  function canMutate(trip: Trip) {
    return isAdmin || trip.ownerId === user.id;
  }

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface">
        <div className="px-5 py-5">
          <p className="text-lg font-semibold tracking-tight">Adgenda</p>
          <p className="mt-1 text-xs text-muted">Agenda de viagens corporativas</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-auto px-3">
          {agendas.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAgendaId(item.id)}
              className={`w-full rounded-lg px-3 py-2.5 text-left transition duration-200 ease-[var(--ease-out-soft)] ${
                item.id === agenda?.id ? "bg-accent-soft text-accent" : "text-ink/80 hover:bg-surface-muted"
              }`}
            >
              <span className="block text-sm font-medium">{item.name}</span>
              <span className="text-[11px] capitalize text-muted">{item.participationType}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setComposer("agenda")}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-accent hover:bg-accent-soft"
          >
            Nova agenda
          </button>
        </nav>
        <div className="border-t border-line px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Integrantes</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {members.map((member) => (
              <span
                key={member.id}
                title={`${member.name} · ${member.role}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-ink text-[11px] font-semibold text-white"
              >
                {initialsOf(member.name)}
              </span>
            ))}
          </div>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setComposer("invite")}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2.5 text-sm font-medium text-accent transition duration-200 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:border-accent hover:shadow-sm active:translate-y-0 active:scale-[0.98]"
            >
              <span aria-hidden className="text-base leading-none">+</span>
              Convidar integrante
            </button>
          ) : null}
          <p className="mt-4 text-sm font-medium">{user.name}</p>
          <p className="text-xs text-muted">{user.role}</p>
          <button type="button" onClick={onLogout} className="mt-3 text-xs text-muted transition hover:text-accent">
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-50 flex items-center gap-3 border-b border-line bg-surface/90 px-6 py-3 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{agenda?.name ?? "Nenhuma agenda"}</p>
            <p className="text-xs capitalize text-muted">{range.title}</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className="rounded-full border border-line px-2 py-1 text-sm" onClick={() => setCursor(shiftPeriod(period, cursor, -1))}>
              ‹
            </button>
            <button type="button" className="rounded-full border border-line px-2 py-1 text-sm" onClick={() => setCursor(new Date())}>
              Hoje
            </button>
            <button type="button" className="rounded-full border border-line px-2 py-1 text-sm" onClick={() => setCursor(shiftPeriod(period, cursor, 1))}>
              ›
            </button>
          </div>
          <div className="relative flex rounded-full bg-surface-muted p-1">
            {PERIOD_VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setPeriod(view)}
                className={`relative rounded-full px-3 py-1.5 text-xs font-medium capitalize transition duration-200 ${
                  period === view ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {PERIOD_LABEL[view]}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setHistoryOpen(true)} className="rounded-full border border-line px-3 py-1.5 text-sm">
            Histórico
          </button>
          <div className="relative z-50" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              className="relative rounded-full border border-line px-3 py-1.5 text-sm transition hover:border-accent"
            >
              Notificações
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] text-white">
                  {unread}
                </span>
              ) : null}
            </button>
            <div
              className={`absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-xl border border-line bg-surface p-2 shadow-xl transition duration-200 ${
                notificationsOpen ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-1 scale-95 opacity-0"
              }`}
            >
              {notifications.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted">Nenhuma notificação.</p>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={async () => {
                      await markNotificationRead(item.id);
                      setAgendaId(item.agendaId);
                      setNotificationsOpen(false);
                      await reloadInbox();
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-surface-muted"
                  >
                    <p className="text-sm font-medium">{item.summary.split("\n")[0]}</p>
                    <p className="text-xs text-muted">{item.agendaName}</p>
                    <p className="text-[11px] text-muted">{item.summary.split("\n").slice(1).join(" · ")}</p>
                  </button>
                ))
              )}
              {unread > 0 ? (
                <button
                  type="button"
                  className="mt-1 w-full rounded-lg px-3 py-2 text-left text-xs text-accent"
                  onClick={async () => {
                    await markAllNotificationsRead();
                    await reloadInbox();
                  }}
                >
                  Marcar todas como lidas
                </button>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            disabled={!agenda}
            onClick={() => {
              setDraftDate(null);
              setComposer("create");
            }}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 active:scale-95 disabled:opacity-50"
          >
            Nova viagem
          </button>
        </header>

        <main className="relative z-0 flex-1 overflow-auto p-6">
          {invites.length > 0 ? (
            <div className="mb-4 space-y-2">
              {invites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                  <p className="text-sm">
                    {invite.invitedByName} convidou você para <strong>{invite.agendaName}</strong>
                  </p>
                  <button
                    type="button"
                    className="rounded-full bg-accent px-3 py-1.5 text-sm text-white"
                    onClick={async () => {
                      const accepted = await acceptInvite(invite.id);
                      await reloadAgendas(accepted.id);
                      await reloadInbox();
                      setToast("Você entrou na agenda");
                    }}
                  >
                    Aceitar
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {!agenda ? (
            <div className="rounded-2xl border border-line bg-surface p-10 text-center">
              <p className="text-lg font-medium">Crie sua primeira agenda</p>
              <p className="mt-2 text-sm text-muted">Quem cria a agenda torna-se administrador e pode convidar integrantes.</p>
              <button type="button" onClick={() => setComposer("agenda")} className="mt-5 rounded-full bg-accent px-4 py-2 text-sm text-white">
                Nova agenda
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm" style={{ animation: "toast-in 220ms var(--ease-out-soft)" }}>
              {period === "mes" || period === "semana" ? (
                <CalendarGrid
                  cells={period === "semana" ? weekCells(cursor) : monthCells(cursor)}
                  compact={period === "semana"}
                  tripsOn={tripsOn}
                  selectedTripId={selectedTripId}
                  onSelect={setSelectedTripId}
                  onCreateOn={(iso) => {
                    setDraftDate(iso);
                    setComposer("create");
                  }}
                />
              ) : (
                <Overview months={monthsInRange(range.from, range.to)} tripsOn={tripsOn} onSelect={setSelectedTripId} />
              )}
            </div>
          )}
          <p className="mt-4 text-center text-[11px] text-muted">
            Desenvolvido por Victor Paschoal (alt: kodimier) kodimier@gmail.com
            <br />
            Adgenda — software livre sob GNU Affero GPL v3.
          </p>
        </main>
      </div>

      <Drawer open={Boolean(selectedTrip)} onClose={() => setSelectedTripId(null)}>
        {selectedTrip ? (
          <>
            <div className="flex items-start justify-between border-b border-line px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Detalhe da viagem</p>
                <h2 className="mt-1 text-lg font-semibold">{selectedTrip.ownerName}</h2>
                <p className="text-sm text-muted">{selectedTrip.role}</p>
              </div>
              <button type="button" onClick={() => setSelectedTripId(null)} className="text-sm text-muted hover:text-ink">
                Fechar
              </button>
            </div>
            <dl className="flex-1 space-y-4 px-6 py-5 text-sm">
              <Field label="Cliente" value={selectedTrip.client} />
              <Field label="Destino" value={selectedTrip.destination} />
              <Field label="Objetivo" value={selectedTrip.objective} />
              <Field label="Ida" value={`${formatBr(selectedTrip.startDate)} — ${selectedTrip.time}`} />
              <Field label="Volta" value={formatBr(selectedTrip.endDate)} />
            </dl>
            {canMutate(selectedTrip) ? (
              <div className="flex gap-3 border-t border-line px-6 py-4">
                <button type="button" className="flex-1 rounded-lg border border-line py-2 text-sm" onClick={() => setComposer("edit")}>
                  Alterar
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-ink py-2 text-sm text-white"
                  onClick={async () => {
                    await cancelTripRequest(selectedTrip.id);
                    setSelectedTripId(null);
                    await reloadBoard();
                    await reloadInbox();
                    setToast("Viagem cancelada");
                  }}
                >
                  Cancelar viagem
                </button>
                {isAdmin || selectedTrip.ownerId === user.id ? (
                  <button
                    type="button"
                    className="rounded-lg border border-line px-3 py-2 text-sm"
                    onClick={async () => {
                      await removeTrip(selectedTrip.id);
                      setSelectedTripId(null);
                      await reloadBoard();
                      await reloadInbox();
                      setToast("Viagem removida");
                    }}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="border-t border-line px-6 py-4 text-sm text-muted">Você pode visualizar, mas não alterar esta viagem.</p>
            )}
          </>
        ) : null}
      </Drawer>

      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)}>
        <div className="border-b border-line px-6 py-5">
          <p className="text-xs uppercase tracking-wide text-muted">Histórico</p>
          <h2 className="mt-1 text-lg font-semibold">{agenda?.name}</h2>
        </div>
        <div className="flex-1 space-y-3 overflow-auto px-6 py-5 text-sm">
          {history.length === 0 ? <p className="text-muted">Nenhum registro ainda.</p> : null}
          {history.map((entry) => (
            <article key={entry.id} className="rounded-lg border border-line px-3 py-2">
              <p>{entry.description}</p>
            </article>
          ))}
        </div>
      </Drawer>

      {composer === "create" || composer === "edit" ? (
        <TripForm
          trip={composer === "edit" ? selectedTrip : null}
          initialDate={composer === "create" ? draftDate : null}
          onClose={() => setComposer(null)}
          onSubmit={async (input) => {
            if (!agenda) return;
            if (composer === "edit" && selectedTrip) await updateTrip(selectedTrip.id, input);
            else await createTrip(agenda.id, input);
            setComposer(null);
            setSelectedTripId(null);
            await reloadBoard();
            await reloadInbox();
            setToast(composer === "edit" ? "Viagem atualizada" : "Viagem registrada na agenda");
          }}
        />
      ) : null}

      {composer === "agenda" ? (
        <SimpleForm
          title="Nova agenda"
          label="Nome da agenda"
          onClose={() => setComposer(null)}
          onSubmit={async (name) => {
            const created = await createAgenda(name);
            await reloadAgendas(created.id);
            setComposer(null);
            setToast("Agenda criada. Você é o administrador.");
          }}
        />
      ) : null}

      {composer === "invite" && agenda ? (
        <InviteForm
          agendaId={agenda.id}
          onClose={() => setComposer(null)}
          onInvite={async (email, name) => {
            await inviteMember(agenda.id, email);
            setComposer(null);
            setToast(name ? `Convite enviado para ${name}.` : "Convite enviado.");
          }}
        />
      ) : null}

      {toast ? (
        <div className="toast-in fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function Drawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div
        className={`fixed inset-0 z-[60] bg-ink/20 transition duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col border-l border-line bg-surface transition duration-200 ease-[var(--ease-out-soft)] ${
          open ? "translate-x-0 shadow-2xl" : "translate-x-full"
        }`}
      >
        {children}
      </aside>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function CalendarGrid({
  cells,
  compact,
  tripsOn,
  selectedTripId,
  onSelect,
  onCreateOn,
}: {
  cells: { iso: string; day: number; inMonth: boolean }[];
  compact: boolean;
  tripsOn: (iso: string) => Trip[];
  selectedTripId: string | null;
  onSelect: (id: string) => void;
  onCreateOn: (iso: string) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line bg-surface-muted">
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-3 py-2 text-xs font-medium text-muted">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell) => (
          <div
            key={cell.iso}
            role="button"
            tabIndex={0}
            title="Clique para adicionar uma viagem neste dia"
            onClick={() => onCreateOn(cell.iso)}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onCreateOn(cell.iso);
              }
            }}
            className={`group relative min-h-28 cursor-pointer border-b border-r border-line p-2 outline-none transition-colors duration-200 hover:bg-accent-soft/40 focus-visible:bg-accent-soft/40 ${compact ? "min-h-96" : ""} ${cell.inMonth ? "" : "bg-surface-muted/50"}`}
          >
            <div className="flex items-center justify-between">
              <p className={`text-xs ${cell.inMonth ? "text-muted" : "text-muted/50"}`}>{cell.day}</p>
              <span
                aria-hidden
                className="inline-flex h-5 w-5 scale-75 items-center justify-center rounded-full bg-accent text-xs leading-none text-white opacity-0 transition duration-200 ease-[var(--ease-out-soft)] group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"
              >
                +
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {tripsOn(cell.iso).map((trip) => (
                <button
                  key={`${trip.id}-${cell.iso}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(trip.id);
                  }}
                  className={`block w-full truncate rounded-md px-2 py-1 text-left text-[11px] transition duration-200 hover:-translate-y-0.5 hover:shadow-sm ${
                    selectedTripId === trip.id ? "bg-accent text-white pulse-once" : "bg-accent-soft text-accent"
                  }`}
                  title={`${trip.ownerName} · ${trip.role} · ${trip.time}`}
                >
                  {trip.client} · {trip.destination}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Overview({
  months,
  tripsOn,
  onSelect,
}: {
  months: { label: string; year: number; month: number }[];
  tripsOn: (iso: string) => Trip[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 p-5 sm:grid-cols-3">
      {months.map((item) => {
        const days = new Date(item.year, item.month + 1, 0).getDate();
        return (
          <section key={item.label} className="rounded-xl border border-line p-4">
            <h3 className="text-sm font-medium capitalize">{item.label}</h3>
            <div className="mt-3 flex flex-wrap gap-1">
              {Array.from({ length: days }, (_, index) => {
                const iso = `${item.year}-${String(item.month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
                const dayTrips = tripsOn(iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      if (dayTrips[0]) onSelect(dayTrips[0].id);
                    }}
                    className={`h-6 w-6 rounded-full text-[10px] transition ${dayTrips.length > 0 ? "bg-accent text-white" : "bg-surface-muted text-muted"}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TripForm({
  trip,
  initialDate,
  onClose,
  onSubmit,
}: {
  trip: Trip | null;
  initialDate?: string | null;
  onClose: () => void;
  onSubmit: (input: {
    client: string;
    destination: string;
    objective: string;
    startDate: string;
    time: string;
    endDate: string;
  }) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await onSubmit({
              client: String(form.get("client")),
              destination: String(form.get("destination")),
              objective: String(form.get("objective")),
              startDate: String(form.get("startDate")),
              time: String(form.get("time")),
              endDate: String(form.get("endDate")),
            });
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
          }
        }}
      >
        <h2 className="text-lg font-semibold">{trip ? "Alterar viagem" : "Nova viagem"}</h2>
        <input className={fieldClass} name="client" placeholder="Cliente" defaultValue={trip?.client} required />
        <input className={fieldClass} name="destination" placeholder="Destino" defaultValue={trip?.destination} required />
        <input className={fieldClass} name="objective" placeholder="Objetivo" defaultValue={trip?.objective} required />
        <div className="grid grid-cols-3 gap-3">
          <input className={fieldClass} name="startDate" type="date" defaultValue={trip?.startDate ?? initialDate ?? undefined} required />
          <input className={fieldClass} name="time" type="time" defaultValue={trip?.time} required />
          <input className={fieldClass} name="endDate" type="date" defaultValue={trip?.endDate ?? initialDate ?? undefined} required />
        </div>
        {error ? <p className="text-sm text-accent">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm">
            Fechar
          </button>
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm text-white">
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SimpleForm({
  title,
  label,
  type = "text",
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  type?: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const value = String(new FormData(event.currentTarget).get("value") ?? "");
          try {
            await onSubmit(value);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
          }
        }}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">{label}</span>
          <input className={fieldClass} name="value" type={type} required />
        </label>
        {error ? <p className="text-sm text-accent">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm">
            Fechar
          </button>
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm text-white">
            Confirmar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InviteForm({
  agendaId,
  onClose,
  onInvite,
}: {
  agendaId: string;
  onClose: () => void;
  onInvite: (email: string, name?: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InviteCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const term = query.trim();
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(term);

  useEffect(() => {
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      inviteSuggestions(agendaId, term, controller.signal)
        .then((rows) => {
          setResults(rows);
          setActive(Math.max(0, rows.findIndex((row) => !row.pendingInvite)));
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha na busca.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [agendaId, term]);

  async function send(email: string, name?: string) {
    setError(null);
    setSending(email);
    try {
      await onInvite(email, name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível convidar.");
    } finally {
      setSending(null);
    }
  }

  function pick(candidate: InviteCandidate | undefined) {
    if (!candidate || candidate.pendingInvite || sending) return;
    void send(candidate.email, candidate.name);
  }

  return (
    <Modal onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (results[active]) pick(results[active]);
          else if (looksLikeEmail) void send(term);
        }}
      >
        <h2 className="text-lg font-semibold">Convidar integrante</h2>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nome ou e-mail de quem já tem conta</span>
          <div className="relative">
            <input
              className={fieldClass}
              value={query}
              autoFocus
              autoComplete="off"
              placeholder="Ex.: Maria, silva, maria@empresa.com"
              onChange={(event) => {
                setQuery(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (!results.length) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((index) => (index + 1) % results.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((index) => (index - 1 + results.length) % results.length);
                }
              }}
            />
            {searching ? (
              <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-accent-soft border-t-accent" />
            ) : null}
          </div>
        </label>

        <ul className="max-h-72 space-y-1 overflow-auto" role="listbox">
          {results.map((candidate, index) => (
            <li key={candidate.id} className="suggestion-in" style={{ animationDelay: `${index * 30}ms` }}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                disabled={candidate.pendingInvite || Boolean(sending)}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(candidate)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition duration-200 ease-[var(--ease-out-soft)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ${
                  index === active && !candidate.pendingInvite
                    ? "border-accent bg-accent-soft shadow-sm"
                    : "border-line hover:border-accent/40 hover:bg-surface-muted"
                }`}
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                  {initialsOf(candidate.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    <Highlight text={candidate.name} term={term} />
                  </span>
                  <span className="block truncate text-xs text-muted">
                    <Highlight text={candidate.email} term={term} />
                  </span>
                  <span className="block truncate text-[11px] text-muted">{candidate.role}</span>
                </span>
                <span className="shrink-0 text-xs font-medium text-accent">
                  {candidate.pendingInvite ? "Convite pendente" : sending === candidate.email ? "Enviando…" : "Convidar"}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {term.length >= 2 && !searching && results.length === 0 ? (
          <p className="suggestion-in rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted">
            {looksLikeEmail
              ? "Nenhuma conta sugerida. Pressione Enter para convidar este e-mail."
              : "Ninguém encontrado. A pessoa precisa ter conta confirmada no Adgenda."}
          </p>
        ) : null}
        {term.length === 1 ? <p className="text-xs text-muted">Digite pelo menos 2 letras.</p> : null}
        {error ? <p className="form-error rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm transition hover:bg-surface-muted">
            Fechar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Highlight({ text, term }: { text: string; term: string }) {
  const index = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-accent-glow px-0.5 text-ink">{text.slice(index, index + term.length)}</mark>
      {text.slice(index + term.length)}
    </>
  );
}

function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function formatBr(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}
