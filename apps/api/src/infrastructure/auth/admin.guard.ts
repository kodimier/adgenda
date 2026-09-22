import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { PublicUser } from "@adgenda/shared";

// Roda depois do SessionGuard, que já deixou o usuário da sessão na requisição.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ user?: PublicUser }>();
    if (!request.user?.isAdmin) {
      throw new ForbiddenException("Acesso restrito à administração.");
    }
    return true;
  }
}
