import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { PublicUser } from "@adgenda/shared";
import { TripService } from "../../application/trip.service";
import { CurrentUser, SessionGuard } from "../../infrastructure/auth/session.guard";

@Controller()
@UseGuards(SessionGuard)
export class TripController {
  constructor(private readonly trips: TripService) {}

  @Get("agendas/:id/trips")
  list(
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    if (!from || !to) throw new BadRequestException("Informe o período.");
    return this.trips.list(user.id, id, from, to);
  }

  @Post("agendas/:id/trips")
  create(
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() body: TripBody,
  ) {
    return this.trips.create(user, id, this.parseTrip(body));
  }

  @Patch("trips/:id")
  update(
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() body: TripBody,
  ) {
    return this.trips.update(user, id, this.parseTrip(body));
  }

  @Post("trips/:id/cancel")
  cancel(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return this.trips.cancel(user, id);
  }

  @Delete("trips/:id")
  remove(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return this.trips.remove(user, id);
  }

  @Get("agendas/:id/history")
  history(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return this.trips.history(user.id, id);
  }

  @Get("notifications")
  notifications(@CurrentUser() user: PublicUser) {
    return this.trips.notifications(user.id);
  }

  @Post("notifications/:id/read")
  markRead(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return this.trips.markRead(user.id, id);
  }

  @Post("notifications/read-all")
  markAllRead(@CurrentUser() user: PublicUser) {
    return this.trips.markAllRead(user.id);
  }

  private parseTrip(body: TripBody) {
    if (
      !body.client?.trim() ||
      !body.destination?.trim() ||
      !body.objective?.trim() ||
      !body.startDate ||
      !body.time ||
      !body.endDate
    ) {
      throw new BadRequestException("Preencha cliente, destino, objetivo, ida, horário e volta.");
    }
    return {
      client: body.client,
      destination: body.destination,
      objective: body.objective,
      startDate: body.startDate,
      time: body.time,
      endDate: body.endDate,
    };
  }
}

type TripBody = {
  client?: string;
  destination?: string;
  objective?: string;
  startDate?: string;
  time?: string;
  endDate?: string;
};
