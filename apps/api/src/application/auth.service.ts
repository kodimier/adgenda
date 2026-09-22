import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, desc, eq, gt, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { UserStatus } from "@adgenda/shared";
import { DatabaseService } from "../infrastructure/database/database.service";
import { MailPort } from "../infrastructure/mail/mail.port";
import {
  emailConfirmations,
  passwordResets,
  sessions,
  users,
} from "../infrastructure/database/schema";
import {
  hashPassword,
  hashToken,
  newId,
  normalizeEmail,
  randomConfirmationCode,
  randomToken,
  tokensEqual,
  verifyPassword,
} from "./crypto";

const SESSION_DAYS = 30;
const CONFIRM_HOURS = 48;
const CONFIRM_RESEND_MS = 45_000;
const CODE_MAX_ATTEMPTS = 5;
const CODE_DAILY_ATTEMPTS = 20;
const CODE_CANDIDATES = 3;
const LINK_INVALID = "Este link expirou ou já foi usado.";
const CODE_INVALID = "Código inválido ou expirado.";
const CODE_LOCKED = "Muitas tentativas com o código. Use o link do e-mail ou peça um novo código mais tarde.";
const MAIL_UNAVAILABLE = "Não foi possível enviar o e-mail agora. Tente de novo em instantes.";
export const SESSION_COOKIE = "adgenda_session";
export const EMAIL_NOT_VERIFIED = "Confirme seu e-mail para entrar.";

function mailHtml(
  name: string,
  intro: string,
  actionLabel: string,
  link: string,
  footnote: string,
  code?: string,
) {
  const codeBlock = code
    ? `<p style="margin:0 0 8px;font-size:16px;color:#123154">Seu código do Adgenda:</p>
        <p style="margin:0 0 20px;font-size:28px;font-weight:700;letter-spacing:6px;font-family:Consolas,Menlo,monospace">${escapeHtml(code)}</p>`
    : "";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;color:#123154;line-height:1.5">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d5e0ec;border-radius:12px">
      <tr><td style="padding:24px 28px">
        <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0b4f8a">Adgenda</p>
        <p style="margin:0 0 16px">Olá, ${escapeHtml(name)}.</p>
        <p style="margin:0 0 20px">${escapeHtml(intro)}</p>
        ${codeBlock}
        <p style="margin:0 0 20px">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:#0b4f8a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600">${escapeHtml(actionLabel)}</a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#4b6480;word-break:break-all">${escapeHtml(link)}</p>
        <p style="margin:16px 0 0;font-size:13px;color:#4b6480">${escapeHtml(footnote)}</p>
        <p style="margin:20px 0 0;font-size:11px;color:#7a8ea3">Desenvolvido por Victor Paschoal (alt: kodimier) kodimier@gmail.com</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function publicAppUrl() {
  const explicit = process.env.APP_PUBLIC_URL?.trim();
  const firstOrigin = (process.env.WEB_ORIGIN ?? "").split(",")[0]?.trim();
  const base = explicit || firstOrigin || "http://localhost:5173";
  return base.replace(/\/$/, "");
}

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly mail: MailPort,
  ) {}

  async onApplicationBootstrap() {
    // Contas anteriores à confirmação por e-mail não têm registro de confirmação.
    try {
      await this.database.db.execute(sql`
        UPDATE users SET email_verified_at = created_at
        WHERE email_verified_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM email_confirmations c WHERE c.user_id = users.id)
      `);
    } catch (error) {
      this.logger.error("Falha ao marcar contas antigas como confirmadas", error);
    }
  }

  async register(input: { name: string; email: string; role: string; password: string }) {
    const email = normalizeEmail(input.email);
    const existing = await this.database.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (existing) {
      throw new ConflictException("Já existe uma conta com este e-mail.");
    }

    const id = newId();
    const name = input.name.trim();
    const passwordHash = await hashPassword(input.password);
    const confirmation = await this.database.db.transaction(async (tx) => {
      await tx.insert(users).values({
        id,
        name,
        email,
        role: input.role.trim(),
        status: "ativo",
        passwordHash,
      });
      return this.createConfirmation(tx, id);
    });
    const mailSent = await this.deliverConfirmation(confirmation, name, email).then(
      () => true,
      () => false,
    );
    return { pendingConfirmation: true as const, mailSent };
  }

  async login(input: { email: string; password: string }) {
    const email = normalizeEmail(input.email);
    const user = await this.database.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!user || user.status === "removido") {
      throw new UnauthorizedException("E-mail ou senha inválidos.");
    }
    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) {
      throw new UnauthorizedException("E-mail ou senha inválidos.");
    }
    // Só depois da senha certa, para não revelar quais e-mails têm conta.
    if (user.status !== "ativo") {
      throw new ForbiddenException("Esta conta está bloqueada. Fale com o T.I.");
    }
    if (!user.emailVerifiedAt) {
      // A falha de envio já fica no log do adapter; a tela de confirmação oferece reenviar.
      await this.sendConfirmationEmail(user.id, user.name, user.email).catch(() => undefined);
      throw new ForbiddenException(EMAIL_NOT_VERIFIED);
    }
    return this.createSession(user.id);
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.database.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }

  async userFromToken(token: string | undefined) {
    if (!token) return null;
    const session = await this.database.db.query.sessions.findFirst({
      where: eq(sessions.tokenHash, hashToken(token)),
    });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      return null;
    }
    const user = await this.database.db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });
    if (!user || user.status !== "ativo" || !user.emailVerifiedAt) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status as UserStatus,
      isAdmin: user.isAdmin,
    };
  }

  async emailTaken(email: string) {
    const existing = await this.database.db.query.users.findFirst({
      where: eq(users.email, normalizeEmail(email)),
    });
    return Boolean(existing);
  }

  async requestPasswordReset(email: string) {
    const user = await this.database.db.query.users.findFirst({
      where: eq(users.email, normalizeEmail(email)),
    });
    if (!user || user.status !== "ativo") {
      return;
    }
    if (!user.emailVerifiedAt) {
      await this.sendConfirmationEmail(user.id, user.name, user.email).catch(() => {
        throw new ServiceUnavailableException(MAIL_UNAVAILABLE);
      });
      return;
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.database.db.insert(passwordResets).values({
      id: newId(),
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
    });

    const link = `${publicAppUrl()}/?reset=${token}`;
    await this.mail
      .send({
        to: user.email,
        subject: "Redefinir senha do Adgenda",
        text: `Olá, ${user.name}.\n\nRecebemos um pedido para redefinir a senha da sua conta no Adgenda.\n\nAbra este link em até 1 hora:\n${link}\n\nSe você não pediu isso, ignore este e-mail.\n\nDesenvolvido por Victor Paschoal (alt: kodimier) kodimier@gmail.com`,
        html: mailHtml(
          user.name,
          "Recebemos um pedido para redefinir a senha da sua conta no Adgenda.",
          "Definir nova senha",
          link,
          "Este link vale por 1 hora. Se você não pediu isso, ignore este e-mail.",
        ),
      })
      .catch(() => {
        throw new ServiceUnavailableException(MAIL_UNAVAILABLE);
      });
  }

  async resetPassword(input: { token: string; password: string }) {
    const token = input.token.trim();
    if (!token || input.password.length < 8) {
      throw new UnauthorizedException("Informe o link válido e uma senha com no mínimo 8 caracteres.");
    }

    const [reset] = await this.database.db
      .select()
      .from(passwordResets)
      .where(and(eq(passwordResets.tokenHash, hashToken(token)), isNull(passwordResets.usedAt)))
      .limit(1);
    if (!reset || reset.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Este link expirou ou já foi usado.");
    }

    await this.database.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.password) })
      .where(eq(users.id, reset.userId));
    await this.database.db
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(eq(passwordResets.id, reset.id));
    await this.database.db.delete(sessions).where(eq(sessions.userId, reset.userId));
    return this.createSession(reset.userId);
  }

  async resendConfirmation(email: string) {
    const user = await this.database.db.query.users.findFirst({
      where: eq(users.email, normalizeEmail(email)),
    });
    if (!user || user.status !== "ativo" || user.emailVerifiedAt) {
      return;
    }
    await this.sendConfirmationEmail(user.id, user.name, user.email).catch(() => {
      throw new ServiceUnavailableException(MAIL_UNAVAILABLE);
    });
  }

  async confirmEmail(token: string) {
    const value = token.trim();
    if (!value) {
      throw new UnauthorizedException(LINK_INVALID);
    }
    const tokenHash = hashToken(value);
    const [confirmation] = await this.database.db
      .select()
      .from(emailConfirmations)
      .where(and(eq(emailConfirmations.tokenHash, tokenHash), isNull(emailConfirmations.usedAt)))
      .limit(1);
    if (confirmation && confirmation.expiresAt.getTime() > Date.now()) {
      return this.consumeConfirmation(confirmation.userId);
    }
    const session = await this.sessionIfAlreadyVerified(tokenHash);
    if (session) return session;
    throw new UnauthorizedException(LINK_INVALID);
  }

  async confirmEmailCode(email: string, code: string) {
    const digits = code.replace(/\D/g, "");
    const user = await this.database.db.query.users.findFirst({
      where: eq(users.email, normalizeEmail(email)),
    });
    if (!user || user.status !== "ativo" || digits.length !== 6) {
      throw new UnauthorizedException(CODE_INVALID);
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [usage] = await this.database.db
      .select({ total: sql<number>`coalesce(sum(${emailConfirmations.attempts}), 0)::int` })
      .from(emailConfirmations)
      .where(and(eq(emailConfirmations.userId, user.id), gte(emailConfirmations.createdAt, since)));
    if ((usage?.total ?? 0) >= CODE_DAILY_ATTEMPTS) {
      throw new HttpException(CODE_LOCKED, HttpStatus.TOO_MANY_REQUESTS);
    }

    // Só os códigos mais recentes valem, e cada palpite gasta uma tentativa de cada um deles.
    const recent = await this.database.db
      .select({ id: emailConfirmations.id })
      .from(emailConfirmations)
      .where(
        and(
          eq(emailConfirmations.userId, user.id),
          isNull(emailConfirmations.usedAt),
          gt(emailConfirmations.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(emailConfirmations.createdAt))
      .limit(CODE_CANDIDATES);
    if (!recent.length) {
      throw new UnauthorizedException(CODE_INVALID);
    }
    const tried = await this.database.db
      .update(emailConfirmations)
      .set({ attempts: sql`${emailConfirmations.attempts} + 1` })
      .where(
        and(
          inArray(
            emailConfirmations.id,
            recent.map((row) => row.id),
          ),
          lt(emailConfirmations.attempts, CODE_MAX_ATTEMPTS),
        ),
      )
      .returning();
    if (!tried.length) {
      throw new HttpException(CODE_LOCKED, HttpStatus.TOO_MANY_REQUESTS);
    }
    const codeHash = hashToken(digits);
    const match = tried.find((row) => row.codeHash && tokensEqual(row.codeHash, codeHash));
    if (!match) {
      throw new UnauthorizedException(CODE_INVALID);
    }
    return this.consumeConfirmation(match.userId);
  }

  private async consumeConfirmation(userId: string) {
    await this.database.db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
    await this.database.db
      .update(emailConfirmations)
      .set({ usedAt: new Date() })
      .where(and(eq(emailConfirmations.userId, userId), isNull(emailConfirmations.usedAt)));
    return this.createSession(userId);
  }

  // Link já consumido (por outro link, pelo código ou por um leitor de e-mail) ainda entra dentro do prazo.
  private async sessionIfAlreadyVerified(tokenHash: string) {
    const [confirmation] = await this.database.db
      .select()
      .from(emailConfirmations)
      .where(eq(emailConfirmations.tokenHash, tokenHash))
      .limit(1);
    if (!confirmation || confirmation.expiresAt.getTime() < Date.now()) return null;
    const user = await this.database.db.query.users.findFirst({
      where: eq(users.id, confirmation.userId),
    });
    if (!user || user.status !== "ativo" || !user.emailVerifiedAt) return null;
    return this.createSession(user.id);
  }

  private async sendConfirmationEmail(userId: string, name: string, email: string) {
    const [latest] = await this.database.db
      .select()
      .from(emailConfirmations)
      .where(eq(emailConfirmations.userId, userId))
      .orderBy(desc(emailConfirmations.createdAt))
      .limit(1);
    const fresh =
      latest &&
      !latest.usedAt &&
      latest.codeHash &&
      latest.attempts < CODE_MAX_ATTEMPTS &&
      latest.expiresAt.getTime() > Date.now() &&
      Date.now() - latest.createdAt.getTime() < CONFIRM_RESEND_MS;
    if (fresh) {
      return;
    }
    const confirmation = await this.createConfirmation(this.database.db, userId);
    await this.deliverConfirmation(confirmation, name, email);
  }

  private async createConfirmation(db: Pick<DatabaseService["db"], "insert">, userId: string) {
    const id = newId();
    const token = randomToken();
    const code = randomConfirmationCode();
    await db.insert(emailConfirmations).values({
      id,
      userId,
      tokenHash: hashToken(token),
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + CONFIRM_HOURS * 60 * 60 * 1000),
    });
    return { id, token, code };
  }

  private async deliverConfirmation(
    confirmation: { id: string; token: string; code: string },
    name: string,
    email: string,
  ) {
    const { token, code } = confirmation;
    const link = `${publicAppUrl()}/?confirm=${token}`;
    try {
      await this.mail.send({
        to: email,
        subject: "Confirme seu e-mail no Adgenda",
        text: `Olá, ${name}.\n\nSeu código do Adgenda: ${code}\n\nEle vale por ${CONFIRM_HOURS} horas.\n\nPara confirmar, abra este link (isso já entra no Adgenda):\n${link}\n\nSe preferir, digite o código ${code} na tela de confirmação.\n\nSe você não criou esta conta, ignore este e-mail.\n\nDesenvolvido por Victor Paschoal (alt: kodimier) kodimier@gmail.com`,
        html: mailHtml(
          name,
          `Seu código do Adgenda é ${code}. Ele vale por ${CONFIRM_HOURS} horas. O botão abaixo já confirma e entra.`,
          "Confirmar e entrar",
          link,
          "Se você não criou esta conta, ignore este e-mail.",
          code,
        ),
      });
    } catch (error) {
      // Expira o registro para liberar o reenvio sem apagar o histórico de confirmação do usuário.
      await this.database.db
        .update(emailConfirmations)
        .set({ expiresAt: new Date() })
        .where(eq(emailConfirmations.id, confirmation.id));
      throw error;
    }
  }

  private async createSession(userId: string) {
    const token = randomToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
    await this.database.db.insert(sessions).values({
      id: newId(),
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    });
    const user = await this.userFromToken(token);
    if (!user) throw new UnauthorizedException();
    return { token, user, expiresAt };
  }
}

export function cookieHasToken(value: string | undefined, token: string) {
  return Boolean(value && tokensEqual(hashToken(value), hashToken(token)));
}
