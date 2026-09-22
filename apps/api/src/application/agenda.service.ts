import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, ilike, isNotNull, notInArray, or } from "drizzle-orm";
import type { PublicUser } from "@adgenda/shared";
import { DatabaseService } from "../infrastructure/database/database.service";
import {
  agendas,
  invites,
  participations,
  users,
} from "../infrastructure/database/schema";
import { MailPort } from "../infrastructure/mail/mail.port";
import { newId, normalizeEmail } from "./crypto";

@Injectable()
export class AgendaService {
  private readonly logger = new Logger(AgendaService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly mail: MailPort,
  ) {}

  async create(user: PublicUser, name: string) {
    const agendaId = newId();
    await this.database.db.transaction(async (tx) => {
      await tx.insert(agendas).values({
        id: agendaId,
        name: name.trim(),
        createdById: user.id,
        status: "ativa",
      });
      await tx.insert(participations).values({
        id: newId(),
        userId: user.id,
        agendaId,
        type: "administrador",
        status: "ativa",
      });
    });
    return this.getForUser(user.id, agendaId);
  }

  async listForUser(userId: string) {
    const rows = await this.database.db
      .select({
        agenda: agendas,
        participation: participations,
      })
      .from(participations)
      .innerJoin(agendas, eq(participations.agendaId, agendas.id))
      .where(and(eq(participations.userId, userId), eq(participations.status, "ativa")))
      .orderBy(desc(agendas.createdAt));

    return rows.map(({ agenda, participation }) => ({
      id: agenda.id,
      name: agenda.name,
      status: agenda.status as "ativa" | "arquivada",
      createdAt: agenda.createdAt.toISOString(),
      participationType: participation.type as "administrador" | "integrante",
    }));
  }

  async members(userId: string, agendaId: string) {
    await this.requireMember(userId, agendaId);
    const rows = await this.database.db
      .select({
        participation: participations,
        user: users,
      })
      .from(participations)
      .innerJoin(users, eq(participations.userId, users.id))
      .where(and(eq(participations.agendaId, agendaId), eq(participations.status, "ativa")));

    return rows.map(({ participation, user }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      participationType: participation.type as "administrador" | "integrante",
      joinedAt: participation.joinedAt.toISOString(),
    }));
  }

  async inviteSuggestions(actorId: string, agendaId: string, query: string) {
    await this.requireAdmin(actorId, agendaId);
    const term = query.trim();
    if (term.length < 2) return [];
    const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

    const memberIds = this.database.db
      .select({ id: participations.userId })
      .from(participations)
      .where(and(eq(participations.agendaId, agendaId), eq(participations.status, "ativa")));
    const rows = await this.database.db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(
        and(
          eq(users.status, "ativo"),
          isNotNull(users.emailVerifiedAt),
          notInArray(users.id, memberIds),
          or(ilike(users.name, pattern), ilike(users.email, pattern)),
        ),
      )
      .orderBy(asc(users.name))
      .limit(8);
    if (!rows.length) return [];

    const pending = await this.database.db
      .select({ userId: invites.invitedUserId })
      .from(invites)
      .where(and(eq(invites.agendaId, agendaId), eq(invites.status, "pendente")));
    const pendingIds = new Set(pending.map((row) => row.userId));
    return rows.map((row) => ({ ...row, pendingInvite: pendingIds.has(row.id) }));
  }

  async invite(actor: PublicUser, agendaId: string, email: string) {
    const membership = await this.requireAdmin(actor.id, agendaId);
    const invited = await this.database.db.query.users.findFirst({
      where: eq(users.email, normalizeEmail(email)),
    });
    if (!invited) {
      throw new NotFoundException("Não há usuário cadastrado com este e-mail.");
    }
    if (invited.id === actor.id) {
      throw new ConflictException("Você já participa desta agenda.");
    }
    const already = await this.database.db.query.participations.findFirst({
      where: and(
        eq(participations.userId, invited.id),
        eq(participations.agendaId, agendaId),
        eq(participations.status, "ativa"),
      ),
    });
    if (already) {
      throw new ConflictException("Este usuário já integra a agenda.");
    }
    const pending = await this.database.db.query.invites.findFirst({
      where: and(
        eq(invites.invitedUserId, invited.id),
        eq(invites.agendaId, agendaId),
        eq(invites.status, "pendente"),
      ),
    });
    if (pending) {
      throw new ConflictException("Já existe um convite pendente para este e-mail.");
    }

    const agenda = membership.agenda;
    const inviteId = newId();
    await this.database.db.insert(invites).values({
      id: inviteId,
      agendaId,
      invitedUserId: invited.id,
      invitedById: actor.id,
      status: "pendente",
    });

    // O convite já aparece no sistema para o convidado; o e-mail é só um aviso.
    await this.mail
      .send({
        to: invited.email,
        subject: `Convite para a agenda ${agenda.name}`,
        text: `${actor.name} convidou você para participar da agenda "${agenda.name}" no Adgenda.\n\nAcesse o sistema, entre com sua conta e aceite o convite.\n\nDesenvolvido por Victor Paschoal (alt: kodimier) kodimier@gmail.com`,
      })
      .catch((error) => this.logger.warn(`Convite ${inviteId} criado sem e-mail: ${String(error)}`));

    return { id: inviteId, status: "pendente" as const };
  }

  async myInvites(userId: string) {
    const rows = await this.database.db
      .select({
        invite: invites,
        agenda: agendas,
        invitedBy: users,
      })
      .from(invites)
      .innerJoin(agendas, eq(invites.agendaId, agendas.id))
      .innerJoin(users, eq(invites.invitedById, users.id))
      .where(and(eq(invites.invitedUserId, userId), eq(invites.status, "pendente")))
      .orderBy(desc(invites.createdAt));

    return rows.map(({ invite, agenda, invitedBy }) => ({
      id: invite.id,
      agendaId: agenda.id,
      agendaName: agenda.name,
      invitedEmail: "",
      invitedByName: invitedBy.name,
      status: "pendente" as const,
      createdAt: invite.createdAt.toISOString(),
      acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    }));
  }

  async acceptInvite(user: PublicUser, inviteId: string) {
    const invite = await this.database.db.query.invites.findFirst({
      where: eq(invites.id, inviteId),
    });
    if (!invite || invite.invitedUserId !== user.id) {
      throw new NotFoundException("Convite não encontrado.");
    }
    if (invite.status !== "pendente") {
      throw new ConflictException("Este convite já foi respondido.");
    }

    await this.database.db.transaction(async (tx) => {
      await tx
        .update(invites)
        .set({ status: "aceito", acceptedAt: new Date() })
        .where(eq(invites.id, inviteId));
      await tx.insert(participations).values({
        id: newId(),
        userId: user.id,
        agendaId: invite.agendaId,
        type: "integrante",
        status: "ativa",
      });
    });

    return this.getForUser(user.id, invite.agendaId);
  }

  async requireMember(userId: string, agendaId: string) {
    const row = await this.database.db
      .select({
        participation: participations,
        agenda: agendas,
      })
      .from(participations)
      .innerJoin(agendas, eq(participations.agendaId, agendas.id))
      .where(
        and(
          eq(participations.userId, userId),
          eq(participations.agendaId, agendaId),
          eq(participations.status, "ativa"),
        ),
      )
      .then((items) => items[0]);
    if (!row) throw new ForbiddenException("Você não participa desta agenda.");
    return row;
  }

  async requireAdmin(userId: string, agendaId: string) {
    const row = await this.requireMember(userId, agendaId);
    if (row.participation.type !== "administrador") {
      throw new ForbiddenException("Apenas o administrador gerencia integrantes.");
    }
    return row;
  }

  private async getForUser(userId: string, agendaId: string) {
    const items = await this.listForUser(userId);
    const agenda = items.find((item) => item.id === agendaId);
    if (!agenda) throw new NotFoundException("Agenda não encontrada.");
    return agenda;
  }
}
