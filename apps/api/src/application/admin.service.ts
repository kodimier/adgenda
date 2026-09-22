import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import type { AdminAction, AdminAuditEntry, AdminUser, PublicUser, UserStatus } from "@adgenda/shared";
import { DatabaseService } from "../infrastructure/database/database.service";
import {
  adminAudit,
  agendas,
  emailConfirmations,
  invites,
  participations,
  passwordResets,
  sessions,
  users,
} from "../infrastructure/database/schema";
import { AuthService } from "./auth.service";
import { hashPassword, newId, normalizeEmail, randomToken } from "./crypto";

type Db = DatabaseService["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type AdminUserFilter = "todos" | UserStatus | "admin";

@Injectable()
export class AdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService,
  ) {}

  // Os primeiros administradores vêm do ambiente; os demais são promovidos pelo painel.
  async onApplicationBootstrap() {
    const emails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean);
    if (!emails.length) return;
    try {
      await this.database.db
        .update(users)
        .set({ isAdmin: true })
        .where(and(inArray(users.email, emails), ne(users.status, "removido")));
    } catch (error) {
      this.logger.error("Falha ao aplicar ADMIN_EMAILS", error);
    }
  }

  listUsers(query: string, filter: AdminUserFilter) {
    const term = query.trim();
    const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    return this.queryUsers(
      and(
        term ? or(ilike(users.name, pattern), ilike(users.email, pattern), ilike(users.role, pattern)) : undefined,
        filter === "admin"
          ? eq(users.isAdmin, true)
          : filter === "todos"
            ? ne(users.status, "removido")
            : eq(users.status, filter),
      ),
    );
  }

  private async queryUsers(where: SQL | undefined): Promise<AdminUser[]> {
    const agendaCount = this.database.db
      .select({
        userId: participations.userId,
        total: sql<number>`count(*)::int`.as("total"),
      })
      .from(participations)
      .where(eq(participations.status, "ativa"))
      .groupBy(participations.userId)
      .as("agenda_count");
    const lastAccess = this.database.db
      .select({
        userId: sessions.userId,
        at: sql<Date>`max(${sessions.createdAt})`.as("at"),
      })
      .from(sessions)
      .groupBy(sessions.userId)
      .as("last_access");

    const rows = await this.database.db
      .select({
        user: users,
        agendas: agendaCount.total,
        lastAccessAt: lastAccess.at,
      })
      .from(users)
      .leftJoin(agendaCount, eq(agendaCount.userId, users.id))
      .leftJoin(lastAccess, eq(lastAccess.userId, users.id))
      .where(where)
      .orderBy(asc(users.name))
      .limit(500);

    return rows.map(({ user, agendas: total, lastAccessAt }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status as UserStatus,
      isAdmin: user.isAdmin,
      emailVerified: Boolean(user.emailVerifiedAt),
      agendas: total ?? 0,
      createdAt: user.createdAt.toISOString(),
      lastAccessAt: lastAccessAt ? new Date(lastAccessAt).toISOString() : null,
    }));
  }

  async audit(limit = 100): Promise<AdminAuditEntry[]> {
    const rows = await this.database.db
      .select()
      .from(adminAudit)
      .orderBy(desc(adminAudit.createdAt))
      .limit(limit);
    return rows.map((entry) => ({
      id: entry.id,
      actorName: entry.actorName,
      targetName: entry.targetName,
      action: entry.action as AdminAction,
      details: entry.details,
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  async update(actor: PublicUser, userId: string, input: { name?: string; email?: string; role?: string }) {
    const target = await this.requireUser(userId);
    const changes: string[] = [];
    const patch: Partial<typeof users.$inferInsert> = {};

    const name = input.name?.trim();
    if (name !== undefined && name !== target.name) {
      if (!name) throw new BadRequestException("Informe o nome.");
      patch.name = name;
      changes.push(`nome: ${target.name} → ${name}`);
    }
    const role = input.role?.trim();
    if (role !== undefined && role !== target.role) {
      if (!role) throw new BadRequestException("Informe o cargo.");
      patch.role = role;
      changes.push(`cargo: ${target.role} → ${role}`);
    }
    const email = input.email === undefined ? undefined : normalizeEmail(input.email);
    if (email !== undefined && email !== target.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException("E-mail inválido.");
      const taken = await this.database.db.query.users.findFirst({ where: eq(users.email, email) });
      if (taken) throw new ConflictException("Já existe uma conta com este e-mail.");
      patch.email = email;
      changes.push(`e-mail: ${target.email} → ${email}`);
    }
    if (!changes.length) return this.findUser(userId);

    await this.database.db.transaction(async (tx) => {
      await tx.update(users).set(patch).where(eq(users.id, userId));
      await this.log(tx, actor, target, "conta_alterada", changes.join("; "));
    });
    return this.findUser(userId);
  }

  async setBlocked(actor: PublicUser, userId: string, blocked: boolean) {
    this.assertNotSelf(actor, userId, blocked ? "bloquear" : "desbloquear");
    const target = await this.requireUser(userId);
    const status = blocked ? "inativo" : "ativo";
    if (target.status === status) return this.findUser(userId);

    await this.database.db.transaction(async (tx) => {
      await tx.update(users).set({ status }).where(eq(users.id, userId));
      if (blocked) await tx.delete(sessions).where(eq(sessions.userId, userId));
      await this.log(tx, actor, target, blocked ? "conta_bloqueada" : "conta_desbloqueada", null);
    });
    return this.findUser(userId);
  }

  async setAdmin(actor: PublicUser, userId: string, isAdmin: boolean) {
    this.assertNotSelf(actor, userId, "alterar o próprio acesso de administrador");
    const target = await this.requireUser(userId);
    if (target.isAdmin === isAdmin) return this.findUser(userId);

    await this.database.db.transaction(async (tx) => {
      await tx.update(users).set({ isAdmin }).where(eq(users.id, userId));
      await this.log(tx, actor, target, isAdmin ? "admin_concedido" : "admin_revogado", null);
    });
    return this.findUser(userId);
  }

  async confirmEmail(actor: PublicUser, userId: string) {
    const target = await this.requireUser(userId);
    if (target.emailVerifiedAt) return this.findUser(userId);

    await this.database.db.transaction(async (tx) => {
      await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
      await tx.update(emailConfirmations).set({ usedAt: new Date() }).where(eq(emailConfirmations.userId, userId));
      await this.log(tx, actor, target, "email_confirmado", null);
    });
    return this.findUser(userId);
  }

  async sendPasswordReset(actor: PublicUser, userId: string) {
    const target = await this.requireUser(userId);
    if (target.status !== "ativo") {
      throw new ConflictException("Desbloqueie a conta antes de enviar a redefinição de senha.");
    }
    if (!target.emailVerifiedAt) {
      throw new ConflictException("Confirme o e-mail da conta antes de enviar a redefinição de senha.");
    }
    await this.auth.requestPasswordReset(target.email);
    await this.log(this.database.db, actor, target, "senha_redefinicao_enviada", target.email);
    return { ok: true };
  }

  // Colaborador desligado: a conta é anonimizada para preservar o histórico das agendas compartilhadas.
  async remove(actor: PublicUser, userId: string) {
    this.assertNotSelf(actor, userId, "remover a própria conta");
    const target = await this.requireUser(userId);

    await this.database.db.transaction(async (tx) => {
      await this.handOverAgendas(tx, userId);
      await tx
        .update(participations)
        .set({ status: "removida" })
        .where(eq(participations.userId, userId));
      await tx
        .update(invites)
        .set({ status: "recusado" })
        .where(
          and(
            eq(invites.status, "pendente"),
            or(eq(invites.invitedUserId, userId), eq(invites.invitedById, userId)),
          ),
        );
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx.delete(passwordResets).where(eq(passwordResets.userId, userId));
      await tx.delete(emailConfirmations).where(eq(emailConfirmations.userId, userId));
      await tx
        .update(users)
        .set({
          name: "Conta removida",
          email: `removido-${userId}@adgenda.invalid`,
          role: "",
          status: "removido",
          isAdmin: false,
          passwordHash: await hashPassword(randomToken()),
        })
        .where(eq(users.id, userId));
      await this.log(tx, actor, target, "conta_removida", target.email);
    });
    return { ok: true };
  }

  // Agenda sem outro administrador passa para o integrante mais antigo; sem integrantes, é arquivada.
  private async handOverAgendas(tx: Tx, userId: string) {
    const owned = await tx
      .select({ agendaId: participations.agendaId })
      .from(participations)
      .where(
        and(
          eq(participations.userId, userId),
          eq(participations.status, "ativa"),
          eq(participations.type, "administrador"),
        ),
      );

    for (const { agendaId } of owned) {
      const others = await tx
        .select({ id: participations.id, type: participations.type })
        .from(participations)
        .where(
          and(
            eq(participations.agendaId, agendaId),
            eq(participations.status, "ativa"),
            ne(participations.userId, userId),
          ),
        )
        .orderBy(asc(participations.joinedAt));
      if (others.some((row) => row.type === "administrador")) continue;
      if (others[0]) {
        await tx.update(participations).set({ type: "administrador" }).where(eq(participations.id, others[0].id));
      } else {
        await tx.update(agendas).set({ status: "arquivada" }).where(eq(agendas.id, agendaId));
      }
    }
  }

  private assertNotSelf(actor: PublicUser, userId: string, what: string) {
    if (actor.id === userId) {
      throw new ForbiddenException(`Você não pode ${what} pelo painel.`);
    }
  }

  private async requireUser(userId: string) {
    const user = await this.database.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user || user.status === "removido") {
      throw new NotFoundException("Conta não encontrada.");
    }
    return user;
  }

  private async findUser(userId: string) {
    const [user] = await this.queryUsers(eq(users.id, userId));
    if (!user) throw new NotFoundException("Conta não encontrada.");
    return user;
  }

  private async log(
    db: Db | Tx,
    actor: PublicUser,
    target: { id: string; name: string },
    action: AdminAction,
    details: string | null,
  ) {
    await db.insert(adminAudit).values({
      id: newId(),
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      action,
      details,
    });
  }
}
