import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const BRAND_COLOR = '#e7242e';
const BRAND_NAME = 'NewZealankans Marketplace';

function layout(title: string, bodyHtml: string, siteUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f5f7;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#17212b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:${BRAND_COLOR};border-radius:10px 10px 0 0;padding:24px 32px;">
              <a href="${siteUrl}" style="color:#fff;font-size:22px;font-weight:900;text-decoration:none;">
                NZ &nbsp; ${BRAND_NAME}
              </a>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#fff;padding:36px 32px;border-left:1px solid #dce3e8;border-right:1px solid #dce3e8;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border:1px solid #dce3e8;border-top:0;border-radius:0 0 10px 10px;padding:20px 32px;text-align:center;color:#697987;font-size:13px;">
              &copy; ${new Date().getFullYear()} ${BRAND_NAME} &mdash; New Zealand
              <br /><br />
              <a href="${siteUrl}" style="color:${BRAND_COLOR};text-decoration:none;font-weight:700;">Visit Marketplace</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function btn(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:${BRAND_COLOR};color:#fff;font-weight:900;font-size:15px;border-radius:8px;text-decoration:none;">${label}</a>`;
}

function heading(text: string): string {
  return `<h2 style="margin:0 0 16px;color:#10212d;font-size:26px;line-height:1.1;">${text}</h2>`;
}

function para(text: string): string {
  return `<p style="margin:0 0 14px;color:#4f6070;line-height:1.6;font-size:15px;">${text}</p>`;
}

function adBox(title: string): string {
  return `<div style="margin:20px 0;padding:16px 20px;background:#f8f9fb;border:1px solid #dce3e8;border-radius:8px;font-weight:700;color:#17212b;">${title}</div>`;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter?: nodemailer.Transporter;
  private readonly siteUrl: string;

  constructor(private readonly config: ConfigService) {
    this.siteUrl = this.config.get<string>('PUBLIC_SITE_URL') ?? 'https://newzealankans.nz';

    const host = this.config.get<string>('SMTP_HOST');
    const port = this.config.get<number>('SMTP_PORT');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (host && port && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }
  }

  async send(payload: EmailPayload) {
    if (!this.transporter) {
      this.logger.log(
        `SMTP not configured. Stub email to ${payload.to}: ${payload.subject}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from:
        this.config.get<string>('SMTP_FROM') ??
        `${BRAND_NAME} <no-reply@newzealankans.nz>`,
      ...payload,
    });
  }

  sendVerification(to: string, token: string) {
    const verifyUrl = `${this.siteUrl}/verify-email?token=${token}`;
    return this.send({
      to,
      subject: `Verify your ${BRAND_NAME} account`,
      text: `Welcome! Verify your email here: ${verifyUrl}`,
      html: layout(
        'Verify your email',
        heading('Verify your email address') +
          para(`Welcome to ${BRAND_NAME}! Please click the button below to verify your email address and activate your account.`) +
          btn('Verify Email', verifyUrl) +
          para(`<br/>If you didn't create an account, you can safely ignore this email.`),
        this.siteUrl,
      ),
    });
  }

  sendPasswordReset(to: string, token: string) {
    const resetUrl = `${this.siteUrl}/reset-password?token=${token}`;
    return this.send({
      to,
      subject: `Reset your ${BRAND_NAME} password`,
      text: `Reset your password here (expires in 1 hour): ${resetUrl}`,
      html: layout(
        'Reset your password',
        heading('Reset your password') +
          para('We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.') +
          btn('Reset Password', resetUrl) +
          para(`<br/>If you didn't request a password reset, you can safely ignore this email.`),
        this.siteUrl,
      ),
    });
  }

  sendAdSubmitted(to: string, title: string) {
    return this.send({
      to,
      subject: 'Your ad has been submitted for review',
      text: `"${title}" is pending admin approval and will be reviewed shortly.`,
      html: layout(
        'Ad Submitted',
        heading('Ad submitted for review') +
          para('Thank you for posting on NewZealankans Marketplace. Your listing has been received and is now pending admin review.') +
          adBox(title) +
          para('You will receive another email once your ad is approved or if any changes are needed.') +
          btn('View My Ads', `${this.siteUrl}/my-ads`),
        this.siteUrl,
      ),
    });
  }

  sendAdApproved(to: string, title: string) {
    return this.send({
      to,
      subject: '🎉 Your ad is now live!',
      text: `"${title}" has been approved and is now live on NewZealankans Marketplace.`,
      html: layout(
        'Ad Approved',
        heading('Your ad is live! 🎉') +
          para('Great news — your listing has been approved by our team and is now visible to buyers on NewZealankans Marketplace.') +
          adBox(title) +
          btn('View Marketplace', `${this.siteUrl}/search`),
        this.siteUrl,
      ),
    });
  }

  sendAdRejected(to: string, title: string, reason?: string) {
    return this.send({
      to,
      subject: 'Your ad was not approved',
      text: `"${title}" was not approved.${reason ? ` Reason: ${reason}` : ''}`,
      html: layout(
        'Ad Not Approved',
        heading('Your ad was not approved') +
          adBox(title) +
          (reason
            ? para(`<strong>Reason:</strong> ${reason}`)
            : para('Our team reviewed your listing and it did not meet our guidelines at this time.')) +
          para('You are welcome to edit your listing and resubmit it for review.') +
          btn('Edit My Ads', `${this.siteUrl}/my-ads`),
        this.siteUrl,
      ),
    });
  }

  sendAdExpired(to: string, title: string) {
    return this.send({
      to,
      subject: 'Your ad has expired',
      text: `"${title}" has expired and is no longer visible on the marketplace.`,
      html: layout(
        'Ad Expired',
        heading('Your ad has expired') +
          adBox(title) +
          para('Your listing has reached its expiry date and is no longer visible to buyers. You can repost it to get it back on the marketplace.') +
          btn('Post a New Ad', `${this.siteUrl}/post-ad`),
        this.siteUrl,
      ),
    });
  }

  sendAdminContactNotification(to: string, subject: string) {
    return this.send({
      to,
      subject: 'New contact form submission',
      text: `A new contact submission was received: ${subject}`,
      html: layout(
        'New Contact Submission',
        heading('New contact form submission') +
          para(`A new message has been submitted via the contact form.`) +
          adBox(subject) +
          btn('View in Admin', `${this.siteUrl}/admin`),
        this.siteUrl,
      ),
    });
  }
}
