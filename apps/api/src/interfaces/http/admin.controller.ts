import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { USER_STATUSES, type PublicUser } from "@adgenda/shared";
import { AdminService, type AdminUserFilter } from "../../application/admin.service";
import { AdminGuard } from "../../infrastructure/auth/admin.guard";
import { CurrentUser, SessionGuard } from "../../infrastructure/auth/session.guard";

const FILTERS: readonly string[] = ["todos", "admin", ...USER_STATUSES];

@Controller("admin")
@UseGuards(SessionGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("users")
  list(@Query("q") query?: string, @Query("filter") filter?: string) {
    const value = filter && FILTERS.includes(filter) ? (filter as AdminUserFilter) : "todos";
    return this.admin.listUsers(query ?? "", value);
  }

  @Patch("users/:id")
  update(
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() body: { name?: string; email?: string; role?: string },
  ) {
    return this.admin.update(user, id, body);
  }

  @Post("users/:id/block")
  block(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return this.admin.setBlocked(user, id, true);
  }

  @Post("users/:id/unblock")
  unblock(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return this.admin.setBlocked(user, id, false);
  }

  @Post("users/:id/admin")
  setAdmin(@CurrentUser() user: PublicUser, @Param("id") id: string, @Body() body: { isAdmin?: boolean }) {
    if (typeof body.isAdmin !== "boolean") {
      throw new BadRequestException("Informe se a conta é administradora.");
    }
    return this.admin.setAdmin(user, id, body.isAdmin);
  }

  @Post("users/:id/confirm-email")
  confirmEmail(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return this.admin.confirmEmail(user, id);
  }

  @Post("users/:id/password-reset")
  passwordReset(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return this.admin.sendPasswordReset(user, id);
  }

  @Delete("users/:id")
  remove(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return this.admin.remove(user, id);
  }

  @Get("audit")
  audit() {
    return this.admin.audit();
  }
}
