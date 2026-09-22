export const PERIOD_VIEWS = [
  "semana",
  "mes",
  "trimestre",
  "semestre",
  "ano",
] as const;
export type PeriodView = (typeof PERIOD_VIEWS)[number];

export const PARTICIPATION_TYPES = ["administrador", "integrante"] as const;
export type ParticipationType = (typeof PARTICIPATION_TYPES)[number];

export const USER_STATUSES = ["ativo", "inativo", "removido"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const AGENDA_STATUSES = ["ativa", "arquivada"] as const;
export type AgendaStatus = (typeof AGENDA_STATUSES)[number];

export const TRIP_STATUSES = ["confirmada", "cancelada", "removida"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const INVITE_STATUSES = ["pendente", "aceito", "recusado"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export const HISTORY_ACTIONS = [
  "viagem_criada",
  "viagem_alterada",
  "viagem_removida",
  "viagem_cancelada",
] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: UserStatus;
  isAdmin: boolean;
};

export type AgendaSummary = {
  id: string;
  name: string;
  status: AgendaStatus;
  createdAt: string;
  participationType: ParticipationType;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  participationType: ParticipationType;
  joinedAt: string;
};

export type Trip = {
  id: string;
  agendaId: string;
  ownerId: string;
  ownerName: string;
  role: string;
  client: string;
  destination: string;
  objective: string;
  startDate: string;
  time: string;
  endDate: string;
  createdAt: string;
  createdById: string;
  status: TripStatus;
};

export type HistoryEntry = {
  id: string;
  agendaId: string;
  actorId: string;
  actorName: string;
  action: HistoryAction;
  tripId: string | null;
  description: string;
  changes: string[] | null;
  createdAt: string;
};

export type AppNotification = {
  id: string;
  agendaId: string;
  agendaName: string;
  historyId: string;
  type: HistoryAction;
  actorName: string;
  summary: string;
  createdAt: string;
  readAt: string | null;
};

export type InviteCandidate = {
  id: string;
  name: string;
  email: string;
  role: string;
  pendingInvite: boolean;
};

export type Invite = {
  id: string;
  agendaId: string;
  agendaName: string;
  invitedEmail: string;
  invitedByName: string;
  status: InviteStatus;
  createdAt: string;
  acceptedAt: string | null;
};

export const ADMIN_ACTIONS = [
  "conta_alterada",
  "conta_bloqueada",
  "conta_desbloqueada",
  "conta_removida",
  "email_confirmado",
  "senha_redefinicao_enviada",
  "admin_concedido",
  "admin_revogado",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: UserStatus;
  isAdmin: boolean;
  emailVerified: boolean;
  agendas: number;
  createdAt: string;
  lastAccessAt: string | null;
};

export type AdminAuditEntry = {
  id: string;
  actorName: string;
  targetName: string;
  action: AdminAction;
  details: string | null;
  createdAt: string;
};
