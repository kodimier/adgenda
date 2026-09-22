import { Module } from "@nestjs/common";
import { AdminService } from "./application/admin.service";
import { AgendaService } from "./application/agenda.service";
import { AuthService } from "./application/auth.service";
import { TripService } from "./application/trip.service";
import { AdminGuard } from "./infrastructure/auth/admin.guard";
import { SessionGuard } from "./infrastructure/auth/session.guard";
import { DatabaseService } from "./infrastructure/database/database.service";
import { BrevoMailAdapter } from "./infrastructure/mail/brevo-mail.adapter";
import { MailPort } from "./infrastructure/mail/mail.port";
import { SmtpMailAdapter } from "./infrastructure/mail/smtp-mail.adapter";
import { AdminController } from "./interfaces/http/admin.controller";
import { AgendaController } from "./interfaces/http/agenda.controller";
import { AuthController } from "./interfaces/http/auth.controller";
import { HealthController } from "./interfaces/http/health.controller";
import { TripController } from "./interfaces/http/trip.controller";

@Module({
  controllers: [HealthController, AuthController, AgendaController, TripController, AdminController],
  providers: [
    DatabaseService,
    AuthService,
    AgendaService,
    TripService,
    AdminService,
    SessionGuard,
    AdminGuard,
    {
      provide: MailPort,
      useFactory: () =>
        process.env.BREVO_API_KEY?.trim() ? new BrevoMailAdapter() : new SmtpMailAdapter(),
    },
  ],
})
export class AppModule {}
