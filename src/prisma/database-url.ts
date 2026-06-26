export function getDatabaseUrl(env = process.env): string {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Add a valid PostgreSQL connection string to .env before starting the API.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      'DATABASE_URL is not a valid PostgreSQL connection string. Expected format: postgresql://user:password@host:port/database',
    );
  }

  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new Error(
      `DATABASE_URL must use the postgresql:// or postgres:// protocol, got ${parsed.protocol}`,
    );
  }

  if (!parsed.username || !parsed.password) {
    throw new Error(
      `DATABASE_URL for ${describeDatabaseTarget(parsed)} must include both username and password.`,
    );
  }

  if (!parsed.pathname || parsed.pathname === '/') {
    throw new Error(
      `DATABASE_URL for ${describeDatabaseTarget(parsed)} must include a database name.`,
    );
  }

  return databaseUrl;
}

export function describeDatabaseUrl(env = process.env): string {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return 'missing DATABASE_URL';
  }

  try {
    return describeDatabaseTarget(new URL(databaseUrl));
  } catch {
    return 'invalid DATABASE_URL';
  }
}

function describeDatabaseTarget(url: URL): string {
  const host = url.hostname || 'unknown-host';
  const port = url.port ? `:${url.port}` : '';
  const database = url.pathname.replace(/^\//, '') || 'unknown-database';
  const user = url.username ? decodeURIComponent(url.username) : 'unknown-user';

  return `${user}@${host}${port}/${database}`;
}
