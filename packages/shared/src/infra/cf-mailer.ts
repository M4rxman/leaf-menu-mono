import type { Mailer } from '../domain/ports.ts'

/** The slice of Cloudflare's `send_email` binding we call (docs: Email Service, Workers API). */
export interface SendEmailLike {
  send(message: { to: string, from: { email: string, name: string }, subject: string, text: string }): Promise<unknown>
}

export class CloudflareMailer implements Mailer {
  private readonly binding: SendEmailLike
  private readonly from: string

  constructor(binding: SendEmailLike, from: string) {
    this.binding = binding
    this.from = from
  }

  async send(m: { to: string, subject: string, text: string }) {
    await this.binding.send({ to: m.to, from: { email: this.from, name: 'Chilly Menu' }, subject: m.subject, text: m.text })
  }
}

/** Local development only (MAIL_LOG=1): prints the message instead of sending it. Never used when the text could reach a real log. */
export class ConsoleMailer implements Mailer {
  async send(m: { to: string, subject: string, text: string }) {
    console.log(`[mail] to=${m.to} subject=${m.subject}\n${m.text}`)
  }
}
