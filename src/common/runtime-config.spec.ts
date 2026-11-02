import { getCorsOrigins, getJwtSecret } from './runtime-config';

describe('runtime configuration', () => {
  it('keeps the development signing fallback outside production', () => {
    expect(getJwtSecret({ NODE_ENV: 'development' })).toBe('dev-jwt-secret');
  });

  it('rejects missing or short production signing secrets', () => {
    expect(() => getJwtSecret({ NODE_ENV: 'production' })).toThrow(
      /at least 32 characters/,
    );
    expect(() =>
      getJwtSecret({
        NODE_ENV: 'production',
        JWT_SECRET: 'short',
      }),
    ).toThrow(/at least 32 characters/);
  });

  it('requires a strong key and explicit local CORS in demo mode', () => {
    expect(() => getJwtSecret({ NODE_ENV: 'demo' })).toThrow(
      /at least 32 characters/,
    );
    expect(() => getCorsOrigins({ NODE_ENV: 'demo' })).toThrow(/CORS_ORIGIN/);
    expect(
      getCorsOrigins({
        NODE_ENV: 'demo',
        CORS_ORIGIN: 'http://127.0.0.1:5178',
      }),
    ).toEqual(['http://127.0.0.1:5178']);
    expect(() =>
      getCorsOrigins({ NODE_ENV: 'demo', CORS_ORIGIN: 'http://example.test' }),
    ).toThrow(/loopback/);
  });

  it('requires explicit HTTPS production origins', () => {
    expect(() => getCorsOrigins({ NODE_ENV: 'production' })).toThrow(
      /CORS_ORIGIN/,
    );
    expect(() =>
      getCorsOrigins({
        NODE_ENV: 'production',
        CORS_ORIGIN: 'http://example.test',
      }),
    ).toThrow(/HTTPS/);
    expect(
      getCorsOrigins({
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://example.test,https://admin.example.test',
      }),
    ).toEqual(['https://example.test', 'https://admin.example.test']);
  });
});
