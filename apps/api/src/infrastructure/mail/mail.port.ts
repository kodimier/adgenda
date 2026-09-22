export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export abstract class MailPort {
  abstract send(message: MailMessage): Promise<void>;
}
