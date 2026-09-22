import { Body, Controller, Get, Post, Query, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService, SESSION_COOKIE } from "../../application/auth.service";
import { CurrentUser, SessionGuard } from "../../infrastructure/auth/session.guard";
import type { PublicUser } from "@adgenda/shared";
import type { CookieOptions } from "express";

function cookieOptions(request: Request): CookieOptions {
  const proto = String(request.headers["x-forwarded-proto"] ?? "")
    .split(",")[0]
    ?.trim();
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
  };
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  async register(
    @Body() body: { name?: string; email?: string; role?: string; password?: string },
  ) {
    this.assertCredentials(body);
    if (!body.name?.trim() || !body.role?.trim()) {
      throw new UnauthorizedException("Informe nome e cargo.");
    }
    return this.auth.register({
      name: body.name,
      email: body.email!,
      role: body.role,
      password: body.password!,
    });
  }

  @Post("login")
  async login(
    @Body() body: { email?: string; password?: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertCredentials(body);
    const session = await this.auth.login({ email: body.email!, password: body.password! });
    this.setCookie(request, response, session.token, session.expiresAt);
    return session.user;
  }

  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    await this.auth.logout(token);
    response.clearCookie(SESSION_COOKIE, cookieOptions(request));
    return { ok: true };
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: PublicUser) {
    return user;
  }

  @Get("email-taken")
  async emailTaken(@Query("email") email: string) {
    return { taken: email ? await this.auth.emailTaken(email) : false };
  }

  @Post("forgot-password")
  async forgotPassword(@Body() body: { email?: string }) {
    if (body.email?.trim()) {
      await this.auth.requestPasswordReset(body.email);
    }
    return { ok: true };
  }

  @Post("reset-password")
  async resetPassword(
    @Body() body: { token?: string; password?: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!body.token?.trim() || !body.password || body.password.length < 8) {
      throw new UnauthorizedException("Informe o link válido e uma senha com no mínimo 8 caracteres.");
    }
    const session = await this.auth.resetPassword({
      token: body.token,
      password: body.password,
    });
    this.setCookie(request, response, session.token, session.expiresAt);
    return session.user;
  }

  @Post("resend-confirmation")
  async resendConfirmation(@Body() body: { email?: string }) {
    if (body.email?.trim()) {
      await this.auth.resendConfirmation(body.email);
    }
    return { ok: true };
  }

  @Post("confirm-email")
  async confirmEmail(
    @Body() body: { token?: string; email?: string; code?: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = body.code?.trim()
      ? await this.auth.confirmEmailCode(body.email ?? "", body.code)
      : await this.auth.confirmEmail(body.token ?? "");
    this.setCookie(request, response, session.token, session.expiresAt);
    return session.user;
  }

  private assertCredentials(body: { email?: string; password?: string }) {
    if (!body.email?.trim() || !body.password || body.password.length < 8) {
      throw new UnauthorizedException("E-mail e senha (mínimo 8 caracteres) são obrigatórios.");
    }
  }

  private setCookie(request: Request, response: Response, token: string, expiresAt: Date) {
    response.cookie(SESSION_COOKIE, token, {
      ...cookieOptions(request),
      expires: expiresAt,
    });
  }
}
