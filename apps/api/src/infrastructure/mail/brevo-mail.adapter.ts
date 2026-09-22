import { Injectable, Logger } from "@nestjs/common";
import { MailPort, type MailMessage } from "./mail.port";

function parseFrom(raw: string): { name: string; email: string } {
  const match = raw.match(/^\s*(.+?)\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { name: "Adgenda", email: raw.trim() };
}

@Injectable()
export class BrevoMailAdapter extends MailPort {
  private readonly logger = new Logger(BrevoMailAdapter.name);
  private readonly apiKey: string;
  private readonly sender: { name: string; email: string };

  constructor() {
    super();
    this.apiKey = process.env.BREVO_API_KEY?.trim() ?? "";
    this.sender = parseFrom(process.env.MAIL_FROM ?? "Adgenda <noreply@localhost>");
  }

  async send(message: MailMessage): Promise<void> {
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": this.apiKey,
        },
        body: JSON.stringify({
          sender: this.sender,
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          ...(message.html ? { htmlContent: message.html } : {}),
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Brevo ${response.status}: ${detail}`);
      }
    } catch (error) {
      this.logger.error(`Falha ao enviar e-mail para ${message.to}`, error);
      throw error;
    }
  }
}
