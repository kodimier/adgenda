import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { PublicUser } from "@adgenda/shared";
import { AgendaService } from "../../application/agenda.service";
import { CurrentUser, SessionGuard } from "../../infrastructure/auth/session.guard";

@Controller()
@UseGuards(SessionGuard)
export class AgendaController {
  constructor(private readonly agendas: AgendaService) {}

  @Get("agendas")
  list(@CurrentUser() user: PublicUser) {
    return this.agendas.listForUser(user.id);
  }

  @Post("agendas")
  create(@CurrentUser() user: PublicUser, @Body() body: { name?: string }) {
    if (!body.name?.trim()) {
      throw new BadRequestException("Informe o nome da agenda.");
    }
    return this.agendas.create(user, body.name);
  }

  @Get("agendas/:id/members")
  members(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return this.agendas.members(user.id, id);
  }

  @Get("agendas/:id/invite-suggestions")
  inviteSuggestions(
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Query("q") query?: string,
  ) {
    return this.agendas.inviteSuggestions(user.id, id, query ?? "");
  }

  @Post("agendas/:id/invites")
  invite(
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() body: { email?: string },
  ) {
    if (!body.email?.trim()) {
      throw new BadRequestException("Informe o e-mail do convidado.");
    }
    return this.agendas.invite(user, id, body.email);
  }

  @Get("invites")
  myInvites(@CurrentUser() user: PublicUser) {
    return this.agendas.myInvites(user.id);
  }

  @Post("invites/:id/accept")
  accept(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return this.agendas.acceptInvite(user, id);
  }
}
