import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { basename, join, resolve } from 'path';

type StoredImage = { key: string; url: string };

@Injectable()
export class StorageService {
  private readonly driver: 'local' | 's3' | 'disabled';
  private readonly client?: S3Client;
  private readonly bucket?: string;
  private readonly publicBaseUrl?: URL;

  constructor(private readonly config: ConfigService) {
    const driver =
      this.config.get<string>('STORAGE_DRIVER') ??
      (process.env.NODE_ENV === 'production' ? 's3' : 'local');
    if (driver !== 'local' && driver !== 's3' && driver !== 'disabled') {
      throw new Error('STORAGE_DRIVER must be local, s3, or disabled.');
    }
    if (
      driver === 'disabled' &&
      this.config.get<string>('STORAGE_ALLOW_DISABLED') !== 'true'
    ) {
      throw new Error(
        'STORAGE_DRIVER=disabled requires STORAGE_ALLOW_DISABLED=true.',
      );
    }
    if (process.env.NODE_ENV === 'production' && driver === 'local') {
      throw new Error(
        'Production image storage requires S3 or explicitly allowed disabled storage.',
      );
    }
    this.driver = driver;
    if (driver !== 's3') return;

    this.bucket = this.config.get<string>('S3_BUCKET');
    const region = this.config.get<string>('S3_REGION');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    const publicUrl = this.config.get<string>('S3_PUBLIC_BASE_URL');
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    if (
      !this.bucket ||
      !region ||
      !accessKeyId ||
      !secretAccessKey ||
      !publicUrl
    ) {
      throw new Error(
        'S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_PUBLIC_BASE_URL are required when STORAGE_DRIVER=s3.',
      );
    }
    try {
      this.publicBaseUrl = new URL(
        publicUrl.endsWith('/') ? publicUrl : `${publicUrl}/`,
      );
    } catch {
      throw new Error('S3_PUBLIC_BASE_URL must be a valid absolute URL.');
    }
    if (
      !['http:', 'https:'].includes(this.publicBaseUrl.protocol) ||
      (process.env.NODE_ENV === 'production' &&
        this.publicBaseUrl.protocol !== 'https:')
    ) {
      throw new Error('S3_PUBLIC_BASE_URL must use HTTPS in production.');
    }
    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async store(
    image: Buffer,
    filename: string,
    contentType: string,
  ): Promise<StoredImage> {
    this.ensureAvailable();
    const safeName = basename(filename);
    if (
      !safeName ||
      safeName !== filename ||
      !/^[a-zA-Z0-9._-]+$/.test(safeName)
    ) {
      throw new Error('Unsafe image filename.');
    }
    if (this.driver === 'local') {
      const directory = resolve(process.cwd(), 'uploads/ads');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, safeName), image, { flag: 'wx' });
      return { key: safeName, url: `/uploads/ads/${safeName}` };
    }

    const key = `ads/${safeName}`;
    await this.client!.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: image,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { key, url: new URL(key, this.publicBaseUrl).toString() };
  }

  async remove(key: string): Promise<void> {
    this.ensureAvailable();
    if (this.driver === 'local') {
      const root = resolve(process.cwd(), 'uploads/ads');
      const path = resolve(root, basename(key));
      if (path.startsWith(`${root}/`))
        await unlink(path).catch(() => undefined);
      return;
    }
    if (!key.startsWith('ads/') || key.includes('..')) return;
    await this.client!.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  ensureAvailable(): void {
    if (this.driver === 'disabled') {
      throw new ServiceUnavailableException(
        'Image uploads are temporarily unavailable.',
      );
    }
  }
}
