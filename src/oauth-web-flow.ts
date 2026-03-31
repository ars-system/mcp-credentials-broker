/**
 * OAuth2 Web Flow - handles browser-based authentication for providers
 */

import http from "http";
import { URL } from "url";
import crypto from "crypto";
import open from "open";

const CALLBACK_PORT = 9876;
const CALLBACK_PATH = "/oauth/callback";
export const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;

// Provider OAuth2 authorization endpoints
const PROVIDER_AUTH_URLS: Record<string, string> = {
  github: "https://github.com/login/oauth/authorize",
  google: "https://accounts.google.com/o/oauth2/v2/auth",
  azure: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  okta: "", // set dynamically via domain
  oauth2: "", // set dynamically via authorizationEndpoint
};

const PROVIDER_TOKEN_URLS: Record<string, string> = {
  github: "https://github.com/login/oauth/access_token",
  google: "https://oauth2.googleapis.com/token",
  azure: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

export interface OAuthFlowParams {
  provider: string;
  clientId: string; // loaded from provider config, not from agent
  clientSecret: string;
  scopes: string[];
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
}

export interface OAuthFlowTriggerParams {
  provider: string;
  scopes: string[];
  secretName: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
}

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
  scope?: string;
}

export async function startOAuthWebFlow(params: OAuthFlowParams): Promise<OAuthTokenResult> {
  const { provider, clientId, clientSecret, scopes, authorizationEndpoint, tokenEndpoint } = params;

  const authUrl = authorizationEndpoint || PROVIDER_AUTH_URLS[provider];
  const tokenUrl = tokenEndpoint || PROVIDER_TOKEN_URLS[provider];

  if (!authUrl) throw new Error(`No authorization endpoint for provider: ${provider}`);
  if (!tokenUrl) throw new Error(`No token endpoint for provider: ${provider}`);

  const state = crypto.randomBytes(16).toString("hex");

  const authorizeUrl = new URL(authUrl);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authorizeUrl.searchParams.set("scope", scopes.join(" "));
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("response_type", "code");

  // GitHub needs this for refresh tokens
  if (provider === "github") {
    authorizeUrl.searchParams.set("access_type", "offline");
  } else {
    authorizeUrl.searchParams.set("access_type", "offline");
    authorizeUrl.searchParams.set("prompt", "consent");
  }

  const code = await waitForCallbackCode(authorizeUrl.toString(), state);
  return exchangeCodeForToken(code, clientId, clientSecret, tokenUrl);
}

function waitForCallbackCode(authorizeUrl: string, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname !== CALLBACK_PATH) return;

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html" });

      if (error) {
        res.end(`<h2>Authentication failed: ${error}</h2><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (state !== expectedState) {
        res.end(`<h2>Invalid state parameter. Possible CSRF attack.</h2>`);
        server.close();
        reject(new Error("State mismatch - possible CSRF attack"));
        return;
      }

      if (!code) {
        res.end(`<h2>No authorization code received.</h2>`);
        server.close();
        reject(new Error("No authorization code in callback"));
        return;
      }

      res.end(
        `<h2>Authentication successful!</h2><p>You can close this tab and return to your app.</p>`
      );
      server.close();
      resolve(code);
    });

    server.listen(CALLBACK_PORT, () => {
      open(authorizeUrl).catch(() => {
        console.error(`Could not open browser. Please visit:\n${authorizeUrl}`);
      });
    });

    server.on("error", reject);

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("OAuth flow timed out after 5 minutes"));
    }, 300_000);
  });
}

async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  tokenUrl: string
): Promise<OAuthTokenResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok || data.error) {
    throw new Error(
      `Token exchange failed: ${data.error_description || data.error || response.statusText}`
    );
  }

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: data.expires_in as number | undefined,
    tokenType: (data.token_type as string) || "Bearer",
    scope: data.scope as string | undefined,
  };
}
