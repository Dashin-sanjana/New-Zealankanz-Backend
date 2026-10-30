import { AdStatus } from '@prisma/client';
import { AdService } from './ad.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notification/notification.service';

describe('AdService public response projection', () => {
  const publicListing = {
    id: 'public-ad-1',
    title: 'Example listing',
    contactName: 'Public seller',
    contactEmail: 'seller@example.test',
    contactPhone: '0210000000',
  };

  function setup() {
    const prisma = {
      ad: {
        findMany: jest.fn().mockResolvedValue([publicListing]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(publicListing),
      },
    };
    const service = new AdService(
      prisma as unknown as PrismaService,
      {} as EmailService,
      {} as NotificationService,
    );
    return { prisma, service };
  }

  function firstCallArgument(mock: jest.Mock): unknown {
    const calls = mock.mock.calls as unknown as unknown[][];
    return calls.at(0)?.[0];
  }

  it('excludes nested user data from public list responses and preserves public contact fields', async () => {
    const { prisma, service } = setup();

    const result = await service.publicList({});

    const listArgs = firstCallArgument(prisma.ad.findMany) as {
      where?: Record<string, unknown>;
      include?: Record<string, unknown>;
    };
    expect(listArgs.where).toEqual({ status: AdStatus.APPROVED });
    expect(listArgs.include).not.toHaveProperty('user');
    expect(result.data[0]).not.toHaveProperty('user');
    expect(result.data[0]).toMatchObject({
      contactName: publicListing.contactName,
      contactEmail: publicListing.contactEmail,
      contactPhone: publicListing.contactPhone,
    });
  });

  it('excludes nested user data from public detail responses', async () => {
    const { prisma, service } = setup();

    const result = await service.publicBySlug('example-listing');

    const detailArgs = firstCallArgument(prisma.ad.findFirst) as {
      where?: Record<string, unknown>;
      include?: Record<string, unknown>;
    };
    expect(detailArgs.where).toEqual({
      slug: 'example-listing',
      status: AdStatus.APPROVED,
    });
    expect(detailArgs.include).not.toHaveProperty('user');
    expect(result).not.toHaveProperty('user');
  });

  it('keeps the nested account email available to authenticated admin workflows', async () => {
    const { prisma, service } = setup();

    await service.adminList({});

    const adminArgs = firstCallArgument(prisma.ad.findMany) as {
      include?: { user?: { select?: Record<string, unknown> } };
    };
    expect(adminArgs.include?.user?.select).toEqual({
      id: true,
      name: true,
      email: true,
    });
  });
});
