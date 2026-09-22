import type {
  AgendaSummary,
  AppNotification,
  HistoryEntry,
  Invite,
  InviteCandidate,
  Member,
  PublicUser,
  Trip,
} from "@adgenda/shared";

const API = "/api/v1";

export type SessionUser = PublicUser;

function asError(error: unknown) {
  if (error instanceof TypeError) {
    return new Error("Não foi possível falar com o servidor. Atualize a página e tente de novo.");
  }
  return error instanceof Error ? error : new Error("Não foi possível concluir a operação.");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      credentials: "include",
      signal: options.signal ?? AbortSignal.timeout(25_000),
    });
  } catch (error) {
    throw asError(error);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(payload.message)
      ? payload.message[0]
      : payload.message;
    throw new Error(message || "Não foi possível concluir a operação.");
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function me() {
  return request<SessionUser>("/auth/me");
}

export function registerAccount(input: {
  name: string;
  email: string;
  role: string;
  password: string;
}) {
  return request<{ pendingConfirmation: boolean; mailSent: boolean }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loginAccount(input: { email: string; password: string }) {
  return request<SessionUser>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logoutAccount() {
  return request<{ ok: boolean }>("/auth/logout", { method: "POST" });
}

export function emailTaken(email: string) {
  return request<{ taken: boolean }>(`/auth/email-taken?email=${encodeURIComponent(email)}`);
}

export function requestPasswordReset(email: string) {
  return request<{ ok: boolean }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(input: { token: string; password: string }) {
  return request<SessionUser>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function resendConfirmation(email: string) {
  return request<{ ok: boolean }>("/auth/resend-confirmation", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function confirmEmail(token: string) {
  return request<SessionUser>("/auth/confirm-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function confirmEmailCode(email: string, code: string) {
  return request<SessionUser>("/auth/confirm-email", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export function listAgendas() {
  return request<AgendaSummary[]>("/agendas");
}

export function createAgenda(name: string) {
  return request<AgendaSummary>("/agendas", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function listMembers(agendaId: string) {
  return request<Member[]>(`/agendas/${agendaId}/members`);
}

export function inviteSuggestions(agendaId: string, query: string, signal?: AbortSignal) {
  return request<InviteCandidate[]>(
    `/agendas/${agendaId}/invite-suggestions?q=${encodeURIComponent(query)}`,
    { signal },
  );
}

export function inviteMember(agendaId: string, email: string) {
  return request<{ id: string; status: string }>(`/agendas/${agendaId}/invites`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function listInvites() {
  return request<Invite[]>("/invites");
}

export function acceptInvite(id: string) {
  return request<AgendaSummary>(`/invites/${id}/accept`, { method: "POST" });
}

export function listTrips(agendaId: string, from: string, to: string) {
  return request<Trip[]>(`/agendas/${agendaId}/trips?from=${from}&to=${to}`);
}

export function createTrip(
  agendaId: string,
  input: {
    client: string;
    destination: string;
    objective: string;
    startDate: string;
    time: string;
    endDate: string;
  },
) {
  return request<Trip>(`/agendas/${agendaId}/trips`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTrip(
  tripId: string,
  input: {
    client: string;
    destination: string;
    objective: string;
    startDate: string;
    time: string;
    endDate: string;
  },
) {
  return request<Trip>(`/trips/${tripId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function cancelTrip(tripId: string) {
  return request<Trip>(`/trips/${tripId}/cancel`, { method: "POST" });
}

export function removeTrip(tripId: string) {
  return request<void>(`/trips/${tripId}`, { method: "DELETE" });
}

export function listHistory(agendaId: string) {
  return request<HistoryEntry[]>(`/agendas/${agendaId}/history`);
}

export function listNotifications() {
  return request<AppNotification[]>("/notifications");
}

export function markNotificationRead(id: string) {
  return request<void>(`/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead() {
  return request<void>("/notifications/read-all", { method: "POST" });
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
