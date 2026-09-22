import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService, SESSION_COOKIE } from "../../application/auth.service";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    const user = await this.auth.userFromToken(token);
    if (!user) throw new UnauthorizedException("Sessão inválida.");
    request.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<{ user: unknown }>();
  return request.user;
});
