import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { access, readFile } from 'fs/promises';
import { join } from 'path';
import { StorageService } from './storage.service';

function config(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as ConfigService;
}

describe('StorageService', () => {
  it('keeps development uploads on local storage', async () => {
    const storage = new StorageService(config({ STORAGE_DRIVER: 'local' }));
    const filename = `${randomUUID()}.webp`;
    const bytes = Buffer.from('image');
    const stored = await storage.store(bytes, filename, 'image/webp');
    const path = join(process.cwd(), 'uploads/ads', filename);
    try {
      expect(stored).toEqual({
        key: filename,
        url: `/uploads/ads/${filename}`,
      });
      await expect(readFile(path)).resolves.toEqual(bytes);
    } finally {
      await storage.remove(filename);
    }
    await expect(access(path)).rejects.toThrow();
  });

  it('stores and deletes S3 objects using safe keys and public retrieval URLs', async () => {
    const commands: unknown[] = [];
    const client = {
      send: (command: unknown) => {
        commands.push(command);
        return Promise.resolve({});
      },
    } as unknown as S3Client;
    const storage = new StorageService(
      config({
        STORAGE_DRIVER: 's3',
        S3_BUCKET: 'marketplace-images',
        S3_REGION: 'ap-southeast-2',
        S3_ACCESS_KEY_ID: 'test-access-key',
        S3_SECRET_ACCESS_KEY: 'test-secret-key',
        S3_PUBLIC_BASE_URL: 'https://cdn.example.test/marketplace',
      }),
    );
    Object.defineProperty(storage, 'client', { value: client });

    const image = Buffer.from('synthetic image bytes');
    const stored = await storage.store(image, 'image.webp', 'image/webp');
    expect(stored).toEqual({
      key: 'ads/image.webp',
      url: 'https://cdn.example.test/marketplace/ads/image.webp',
    });
    expect(commands[0]).toBeInstanceOf(PutObjectCommand);
    expect((commands[0] as PutObjectCommand).input.Body).toEqual(image);
    await storage.remove(stored.key);
    expect(commands[1]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('rejects path-like object names and incomplete S3 configuration', async () => {
    const storage = new StorageService(
      config({
        STORAGE_DRIVER: 's3',
        S3_BUCKET: 'marketplace-images',
        S3_REGION: 'ap-southeast-2',
        S3_ACCESS_KEY_ID: 'test-access-key',
        S3_SECRET_ACCESS_KEY: 'test-secret-key',
        S3_PUBLIC_BASE_URL: 'https://cdn.example.test',
      }),
    );
    await expect(
      storage.store(Buffer.from('test'), '../image.webp', 'image/webp'),
    ).rejects.toThrow('Unsafe image filename');
  });

  it('allows explicitly disabled storage and returns 503 for uploads', async () => {
    const storage = new StorageService(
      config({
        STORAGE_DRIVER: 'disabled',
        STORAGE_ALLOW_DISABLED: 'true',
      }),
    );
    expect(() => storage.ensureAvailable()).toThrow();
    await expect(
      storage.store(Buffer.from('image'), 'image.webp', 'image/webp'),
    ).rejects.toMatchObject({ status: 503 });
    expect(
      () => new StorageService(config({ STORAGE_DRIVER: 'disabled' })),
    ).toThrow('STORAGE_ALLOW_DISABLED=true');
  });

  it('requires persistent S3 storage in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(
        () => new StorageService(config({ STORAGE_DRIVER: 'local' })),
      ).toThrow('Production image storage requires S3');
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
