import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gte, lte, ne } from "drizzle-orm";
import type { HistoryAction, PublicUser, TripStatus } from "@adgenda/shared";
import { DatabaseService } from "../infrastructure/database/database.service";
import {
  agendas,
  history,
  notifications,
  participations,
  trips,
  users,
} from "../infrastructure/database/schema";
import { AgendaService } from "./agenda.service";
import { asDateString, asTimeString, formatDate, formatDateTime, newId } from "./crypto";

type TripInput = {
  client: string;
  destination: string;
  objective: string;
  startDate: string;
  time: string;
  endDate: string;
};

const CHANGE_LABEL: Record<string, string> = {
  client: "mudança de cliente",
  destination: "mudança de destino",
  objective: "mudança de objetivo",
  startDate: "mudança de dia",
  time: "mudança de horário",
  endDate: "mudança de volta",
};

@Injectable()
export class TripService {
  constructor(
    private readonly database: DatabaseService,
    private readonly agendas: AgendaService,
  ) {}

  async list(userId: string, agendaId: string, from: string, to: string) {
    await this.agendas.requireMember(userId, agendaId);
    const rows = await this.database.db
      .select({ trip: trips, owner: users })
      .from(trips)
      .innerJoin(users, eq(trips.ownerId, users.id))
      .where(
        and(
          eq(trips.agendaId, agendaId),
          eq(trips.status, "confirmada"),
          lte(trips.startDate, to),
          gte(trips.endDate, from),
        ),
      )
      .orderBy(trips.startDate, trips.time);

    return rows.map(({ trip, owner }) => this.serialize(trip, owner.name));
  }

  async create(actor: PublicUser, agendaId: string, input: TripInput) {
    await this.agendas.requireMember(actor.id, agendaId);
    const id = newId();
    const [trip] = await this.database.db
      .insert(trips)
      .values({
        id,
        agendaId,
        ownerId: actor.id,
        role: actor.role,
        client: input.client.trim(),
        destination: input.destination.trim(),
        objective: input.objective.trim(),
        startDate: input.startDate,
        time: input.time,
        endDate: input.endDate,
        createdById: actor.id,
        status: "confirmada",
      })
      .returning();

    await this.record(actor, trip, "viagem_criada");
    return this.serialize(trip, actor.name);
  }

  async update(actor: PublicUser, tripId: string, input: TripInput) {
    const current = await this.loadWritable(actor, tripId);
    const changes: string[] = [];
    const next = {
      client: input.client.trim(),
      destination: input.destination.trim(),
      objective: input.objective.trim(),
      startDate: input.startDate,
      time: asTimeString(input.time),
      endDate: input.endDate,
    };
    for (const key of Object.keys(CHANGE_LABEL) as (keyof typeof next)[]) {
      const before = key === "time" ? asTimeString(String(current.trip[key])) : String(current.trip[key]);
      if (before !== next[key]) changes.push(CHANGE_LABEL[key]);
    }
    if (changes.length === 0) {
      return this.serialize(current.trip, current.owner.name);
    }

    const [trip] = await this.database.db
      .update(trips)
      .set(next)
      .where(eq(trips.id, tripId))
      .returning();
    await this.record(actor, trip, "viagem_alterada", changes);
    return this.serialize(trip, current.owner.name);
  }

  async cancel(actor: PublicUser, tripId: string) {
    return this.close(actor, tripId, "cancelada", "viagem_cancelada");
  }

  async remove(actor: PublicUser, tripId: string) {
    return this.close(actor, tripId, "removida", "viagem_removida");
  }

  async history(userId: string, agendaId: string) {
    await this.agendas.requireMember(userId, agendaId);
    const rows = await this.database.db
      .select({ entry: history, actor: users })
      .from(history)
      .innerJoin(users, eq(history.actorId, users.id))
      .where(eq(history.agendaId, agendaId))
      .orderBy(desc(history.createdAt));

    return rows.map(({ entry, actor }) => ({
      id: entry.id,
      agendaId: entry.agendaId,
      actorId: actor.id,
      actorName: actor.name,
      action: entry.action as HistoryAction,
      tripId: entry.tripId,
      description: entry.description,
      changes: entry.changes,
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  async notifications(userId: string) {
    const rows = await this.database.db
      .select({
        notification: notifications,
        agenda: agendas,
        actor: users,
      })
      .from(notifications)
      .innerJoin(agendas, eq(notifications.agendaId, agendas.id))
      .innerJoin(users, eq(notifications.actorId, users.id))
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));

    return rows.map(({ notification, agenda, actor }) => ({
      id: notification.id,
      agendaId: agenda.id,
      agendaName: agenda.name,
      historyId: notification.historyId,
      type: notification.type as HistoryAction,
      actorName: actor.name,
      summary: notification.summary,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt?.toISOString() ?? null,
    }));
  }

  async markRead(userId: string, notificationId: string) {
    await this.database.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  }

  async markAllRead(userId: string) {
    await this.database.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId)));
  }

  private async close(
    actor: PublicUser,
    tripId: string,
    status: TripStatus,
    action: HistoryAction,
  ) {
    const current = await this.loadWritable(actor, tripId);
    const [trip] = await this.database.db
      .update(trips)
      .set({ status })
      .where(eq(trips.id, tripId))
      .returning();
    await this.record(actor, trip, action);
    return this.serialize(trip, current.owner.name);
  }

  private async loadWritable(actor: PublicUser, tripId: string) {
    const row = await this.database.db
      .select({ trip: trips, owner: users })
      .from(trips)
      .innerJoin(users, eq(trips.ownerId, users.id))
      .where(eq(trips.id, tripId))
      .then((items) => items[0]);
    if (!row) throw new NotFoundException("Viagem não encontrada.");
    const membership = await this.agendas.requireMember(actor.id, row.trip.agendaId);
    const isAdmin = membership.participation.type === "administrador";
    const isOwner = row.trip.ownerId === actor.id;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException("Você só pode alterar as próprias viagens.");
    }
    if (row.trip.status !== "confirmada") {
      throw new ForbiddenException("Esta viagem já foi encerrada.");
    }
    return row;
  }

  private async record(
    actor: PublicUser,
    trip: typeof trips.$inferSelect,
    action: HistoryAction,
    changes: string[] | null = null,
  ) {
    const now = new Date();
    const stamp = formatDateTime(now);
    const tripLabel = `${trip.client} — ${trip.objective} — ${formatDate(asDateString(trip.startDate))}`;
    const actionLabel =
      action === "viagem_criada"
        ? "adicionou uma nova viagem à agenda"
        : action === "viagem_alterada"
          ? "alterou detalhes da viagem na agenda"
          : action === "viagem_cancelada"
            ? "cancelou uma viagem da agenda"
            : "removeu uma viagem da agenda";
    const changeSuffix = changes?.length ? ` — ${changes.join(", ")}` : "";
    const description = `${actor.name} ${actionLabel} > ${tripLabel} — ${stamp}${changeSuffix}`;
    const summary =
      action === "viagem_criada"
        ? `${actor.name} adicionou uma nova viagem`
        : action === "viagem_alterada"
          ? `${actor.name} alterou uma viagem`
          : action === "viagem_cancelada"
            ? `${actor.name} cancelou uma viagem`
            : `${actor.name} removeu uma viagem`;

    const historyId = newId();
    const members = await this.database.db
      .select({ userId: participations.userId })
      .from(participations)
      .where(
        and(
          eq(participations.agendaId, trip.agendaId),
          eq(participations.status, "ativa"),
          ne(participations.userId, actor.id),
        ),
      );

    await this.database.db.transaction(async (tx) => {
      await tx.insert(history).values({
        id: historyId,
        agendaId: trip.agendaId,
        actorId: actor.id,
        action,
        tripId: trip.id,
        description,
        changes,
      });
      if (members.length > 0) {
        await tx.insert(notifications).values(
          members.map((member) => ({
            id: newId(),
            userId: member.userId,
            agendaId: trip.agendaId,
            historyId,
            type: action,
            actorId: actor.id,
            summary: [summary, tripLabel, ...(changes ?? [])].join("\n"),
          })),
        );
      }
    });
  }

  private serialize(trip: typeof trips.$inferSelect, ownerName: string) {
    return {
      id: trip.id,
      agendaId: trip.agendaId,
      ownerId: trip.ownerId,
      ownerName,
      role: trip.role,
      client: trip.client,
      destination: trip.destination,
      objective: trip.objective,
      startDate: asDateString(trip.startDate),
      time: asTimeString(String(trip.time)),
      endDate: asDateString(trip.endDate),
      createdAt: trip.createdAt.toISOString(),
      createdById: trip.createdById,
      status: trip.status as TripStatus,
    };
  }
}
