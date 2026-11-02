import { EmailService } from './email.service';
import type { ConfigService } from '@nestjs/config';

function config(values: Record<string, string>) {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

function jsonMail(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object')
    throw new Error('Missing test email.');
  const message = (result as Record<string, unknown>).message;
  if (typeof message !== 'string')
    throw new Error('Missing serialized test email.');
  const parsed: unknown = JSON.parse(message);
  if (!parsed || typeof parsed !== 'object')
    throw new Error('Invalid serialized test email.');
  return parsed as Record<string, unknown>;
}

describe('EmailService', () => {
  it('returns an explicit unavailable response when SMTP is not configured', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const service = new EmailService({ get: () => undefined } as never);
      expect(service.isAvailable).toBe(false);
      expect(() =>
        service.sendVerification('member@example.test', 'token'),
      ).toThrow('Email delivery is temporarily unavailable.');
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('delivers verification, reset, and enquiry messages through test transport', async () => {
    const service = new EmailService(
      config({
        EMAIL_TEST_TRANSPORT: 'json',
        PUBLIC_SITE_URL: 'http://localhost:5173',
      }),
    );

    const verification = await service.sendVerification(
      'buyer@example.test',
      'v-token',
    );
    const reset = await service.sendPasswordReset(
      'buyer@example.test',
      'r-token',
    );
    const enquiry = await service.sendListingEnquiry({
      to: 'seller@example.test',
      senderName: '<Buyer>',
      senderEmail: 'buyer@example.test',
      adTitle: 'Listing\r\nBcc: attacker@example.test',
      message: '<script>alert(1)</script>',
    });

    expect(jsonMail(verification).html).toContain('v-token');
    expect(jsonMail(reset).text).toContain('expires in 1 hour');
    expect(enquiry).toBe(true);
  });

  it('refuses to enable the JSON transport outside tests', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(
        () =>
          new EmailService(
            config({
              EMAIL_TEST_TRANSPORT: 'json',
              PUBLIC_SITE_URL: 'https://example.test',
            }),
          ),
      ).toThrow('available only in test mode');
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
