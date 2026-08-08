import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const port = Number(process.env.TEST_GOOGLE_PORT ?? 4010);
const issuer = `http://127.0.0.1:${port}`;
const clientId = 'settleflow-e2e-client';
const clientSecret = 'settleflow-e2e-secret';
const keyId = 'settleflow-e2e-key';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const publicJwk = await exportJWK(publicKey);
const authorizations = new Map<
  string,
  { clientId: string; codeChallenge: string; nonce: string; redirectUri: string }
>();

function json(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(value));
}

async function body(request: IncomingMessage): Promise<string> {
  request.setEncoding('utf8');
  let value = '';
  for await (const chunk of request) {
    if (typeof chunk !== 'string') throw new TypeError('Expected a UTF-8 request body.');
    value += chunk;
  }
  return value;
}

function redirect(response: ServerResponse, location: string): void {
  response.statusCode = 302;
  response.setHeader('location', location);
  response.end();
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', issuer);

  if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
    json(response, 200, {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'email', 'profile'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      code_challenge_methods_supported: ['S256'],
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/jwks') {
    json(response, 200, { keys: [{ ...publicJwk, alg: 'RS256', kid: keyId, use: 'sig' }] });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    const nonce = url.searchParams.get('nonce');
    const codeChallenge = url.searchParams.get('code_challenge');
    const requestedClientId = url.searchParams.get('client_id');
    if (!redirectUri || !state || !nonce || !codeChallenge || requestedClientId !== clientId) {
      json(response, 400, { error: 'invalid_request' });
      return;
    }

    const code = randomBytes(24).toString('base64url');
    authorizations.set(code, {
      clientId: requestedClientId,
      codeChallenge,
      nonce,
      redirectUri,
    });
    const callback = new URL(redirectUri);
    callback.searchParams.set('code', code);
    callback.searchParams.set('state', state);
    redirect(response, callback.toString());
    return;
  }

  if (request.method === 'POST' && url.pathname === '/token') {
    const parameters = new URLSearchParams(await body(request));
    const code = parameters.get('code');
    const authorization = code ? authorizations.get(code) : undefined;
    if (
      !code ||
      !authorization ||
      parameters.get('client_id') !== clientId ||
      parameters.get('client_secret') !== clientSecret ||
      parameters.get('redirect_uri') !== authorization.redirectUri
    ) {
      json(response, 400, { error: 'invalid_grant' });
      return;
    }

    const verifier = parameters.get('code_verifier') ?? '';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (challenge !== authorization.codeChallenge) {
      json(response, 400, { error: 'invalid_grant' });
      return;
    }
    authorizations.delete(code);

    const idToken = await new SignJWT({
      email: 'google-e2e@example.com',
      email_verified: true,
      name: 'Google E2E User',
      nonce: authorization.nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: keyId })
      .setIssuer(issuer)
      .setAudience(authorization.clientId)
      .setSubject('google-e2e-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    json(response, 200, {
      access_token: 'not-persisted-e2e-access-token',
      expires_in: 300,
      id_token: idToken,
      scope: 'openid email profile',
      token_type: 'Bearer',
    });
    return;
  }

  response.statusCode = 404;
  response.end();
});

server.listen(port, '127.0.0.1');

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
