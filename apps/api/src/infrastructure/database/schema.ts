import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("ativo"),
    isAdmin: boolean("is_admin").notNull().default(false),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResets = pgTable("password_resets", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailConfirmations = pgTable("email_confirmations", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  codeHash: text("code_hash"),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agendas = pgTable("agendas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull().default("ativa"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const participations = pgTable(
  "participations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    agendaId: text("agenda_id")
      .notNull()
      .references(() => agendas.id),
    type: text("type").notNull(),
    status: text("status").notNull().default("ativa"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("participations_user_agenda").on(table.userId, table.agendaId)],
);

export const invites = pgTable("invites", {
  id: text("id").primaryKey(),
  agendaId: text("agenda_id")
    .notNull()
    .references(() => agendas.id),
  invitedUserId: text("invited_user_id")
    .notNull()
    .references(() => users.id),
  invitedById: text("invited_by_id")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull().default("pendente"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

export const trips = pgTable("trips", {
  id: text("id").primaryKey(),
  agendaId: text("agenda_id")
    .notNull()
    .references(() => agendas.id),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  role: text("role").notNull(),
  client: text("client").notNull(),
  destination: text("destination").notNull(),
  objective: text("objective").notNull(),
  startDate: date("start_date").notNull(),
  time: time("time").notNull(),
  endDate: date("end_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull().default("confirmada"),
});

export const history = pgTable("history", {
  id: text("id").primaryKey(),
  agendaId: text("agenda_id")
    .notNull()
    .references(() => agendas.id),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  tripId: text("trip_id"),
  description: text("description").notNull(),
  changes: jsonb("changes").$type<string[] | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  agendaId: text("agenda_id")
    .notNull()
    .references(() => agendas.id),
  historyId: text("history_id")
    .notNull()
    .references(() => history.id),
  type: text("type").notNull(),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
});

export const adminAudit = pgTable("admin_audit", {
  id: text("id").primaryKey(),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id),
  actorName: text("actor_name").notNull(),
  targetId: text("target_id")
    .notNull()
    .references(() => users.id),
  // Nomes gravados na hora da ação: a conta pode ser renomeada ou anonimizada depois.
  targetName: text("target_name").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
