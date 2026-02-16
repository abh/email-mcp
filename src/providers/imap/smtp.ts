import nodemailer from 'nodemailer';
import type { SendEmailParams } from '../provider.js';
import type { PasswordCredentials } from '../../models/types.js';

export function createSmtpTransport(email: string, creds: PasswordCredentials) {
  return nodemailer.createTransport({
    host: creds.smtpHost || creds.host.replace('imap', 'smtp'),
    port: creds.smtpPort || 587,
    secure: creds.smtpPort === 465,
    auth: { user: email, pass: creds.password },
  });
}

export async function sendViaSmtp(
  transport: ReturnType<typeof nodemailer.createTransport>,
  from: string,
  params: SendEmailParams
): Promise<string> {
  const result = await transport.sendMail({
    from,
    to: params.to.map((c) => (c.name ? `"${c.name}" <${c.email}>` : c.email)).join(', '),
    cc: params.cc?.map((c) => c.email).join(', '),
    bcc: params.bcc?.map((c) => c.email).join(', '),
    subject: params.subject,
    text: params.body.text,
    html: params.body.html,
    inReplyTo: params.inReplyTo,
    references: params.references?.join(' '),
    attachments: params.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  return result.messageId;
}
