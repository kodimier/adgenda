import { Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { MailPort, type MailMessage } from "./mail.port";

@Injectable()
export class SmtpMailAdapter extends MailPort {
  private readonly logger = new Logger(SmtpMailAdapter.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    super();
    this.from = process.env.MAIL_FROM ?? "adgenda@localhost";
    const user = process.env.MAIL_USER?.trim();
    const pass = process.env.MAIL_PASS?.trim();
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST ?? "localhost",
      port: Number(process.env.MAIL_PORT ?? 1025),
      secure: process.env.MAIL_SECURE === "true",
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      this.logger.error(`Falha ao enviar e-mail para ${message.to}`, error);
      throw error;
    }
  }
}
