export function getJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET;
  if (
    !secret &&
    (!env.NODE_ENV || ['development', 'test'].includes(env.NODE_ENV))
  ) {
    return 'dev-jwt-secret';
  }
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be configured with at least 32 characters.',
    );
  }
  return secret;
}

export function getCorsOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] | true {
  const configured = env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (env.NODE_ENV === 'demo') {
    if (!configured?.length) {
      throw new Error('CORS_ORIGIN must be configured in demo mode.');
    }
    for (const origin of configured) {
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error('CORS_ORIGIN must contain valid origins.');
      }
      const localHttp =
        parsed.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
      if (
        parsed.origin !== origin ||
        (parsed.protocol !== 'https:' && !localHttp)
      ) {
        throw new Error(
          'Demo CORS origins must use HTTPS or local loopback HTTP.',
        );
      }
    }
    return configured;
  }
  if (env.NODE_ENV !== 'production')
    return configured?.length ? configured : true;
  if (!configured?.length)
    throw new Error('CORS_ORIGIN must be configured in production.');
  for (const origin of configured) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('CORS_ORIGIN must contain valid origins.');
    }
    if (parsed.protocol !== 'https:' || parsed.origin !== origin) {
      throw new Error('Production CORS_ORIGIN entries must be HTTPS origins.');
    }
  }
  return configured;
}
