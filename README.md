# MCP Credentials Broker

A secure credential management layer for Model Context Protocol (MCP) servers. Authenticate providers via browser — no hardcoded API keys, no tokens pasted into chat.

## Why Use This?

If you're building MCP servers that need to access external APIs (GitHub, Google, Azure, etc.), you've probably hardcoded API keys in environment variables or pasted tokens into chat. This broker solves that by:

- Authenticating providers via browser OAuth2 — you just log in, the broker handles the rest
- Issuing short-lived references instead of exposing raw tokens to the agent
- Centralizing credential management across all MCP servers in a single session

## How It Works

```
You say: "List my GitHub repos"

Agent:
  1. Checks if github-token is already stored
  2. If not → triggers browser OAuth flow → you log in → token stored
  3. Gets a short-lived reference to the token
  4. Resolves the reference to the actual value (never shown to you)
  5. Passes the token to your GitHub MCP tool
```

The agent handles all of this automatically via the included rules file — you never paste a token.

## Installation

```bash
npm install @ars-system/mcp-credentials-broker
```

Or clone and build from source:

```bash
git clone https://github.com/ars-system/mcp-credentials-broker.git
cd mcp-credentials-broker
npm install
npm run build
```

## Configuration

### Step 1 — Get provider credentials (one-time)

The broker needs a `client_id` and `client_secret` for each provider you want to use. These are set once as environment variables — the agent never sees or asks for them.

#### GitHub

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Click **OAuth Apps** → **New OAuth App**
3. Fill in:
   - Application name: `MCP Credentials Broker` (or anything)
   - Homepage URL: `http://localhost`
   - Authorization callback URL: `http://localhost:9876/oauth/callback`
4. Click **Register application**
5. Copy the **Client ID**
6. Click **Generate a new client secret** and copy it

```bash
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
```

#### Google

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Add to **Authorized redirect URIs**: `http://localhost:9876/oauth/callback`
5. Copy the **Client ID** and **Client Secret**

```bash
GCP_CLIENT_ID=your-client-id
GCP_CLIENT_SECRET=your-client-secret
```

#### Azure

1. Go to [portal.azure.com](https://portal.azure.com) → **Azure Active Directory** → **App registrations**
2. Click **New registration**
3. Name it anything, select **Accounts in any organizational directory and personal Microsoft accounts**
4. Set redirect URI to: `http://localhost:9876/oauth/callback` (type: Web)
5. After creation, go to **Certificates & secrets** → **New client secret**
6. Copy the **Application (client) ID** and the secret value

```bash
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
```

#### Okta

1. Go to your Okta Admin Console → **Applications** → **Create App Integration**
2. Select **OIDC - OpenID Connect** → **Web Application**
3. Add `http://localhost:9876/oauth/callback` to **Sign-in redirect URIs**
4. Copy the **Client ID** and **Client Secret**
5. Also set your Okta domain:

```bash
OKTA_CLIENT_ID=your-client-id
OKTA_CLIENT_SECRET=your-client-secret
OKTA_DOMAIN=your-org.okta.com
```

---

### Step 2 — Configure your MCP client

Add the broker alongside your other MCP servers. Pass the provider env vars in the `env` block:

```json
{
  "mcpServers": {
    "credentials-broker": {
      "command": "node",
      "args": ["/path/to/mcp-credentials-broker/dist/index.js"],
      "env": {
        "GITHUB_CLIENT_ID": "your-github-client-id",
        "GITHUB_CLIENT_SECRET": "your-github-client-secret",
        "GCP_CLIENT_ID": "your-gcp-client-id",
        "GCP_CLIENT_SECRET": "your-gcp-client-secret"
      }
    },
    "your-github-mcp": {
      "command": "node",
      "args": ["/path/to/your-github-mcp/dist/index.js"]
    }
  }
}
```

> Only configure the providers you actually use. You don't need all of them.

---

### Step 3 — Add the agent rules (for Amazon Q / Claude / Cursor)

Add the following rules to your agent configuration (e.g., in `.amazonq/rules/credentials-broker.md` or your agent's custom rules file). These rules ensure the agent always uses the broker automatically and never asks you for tokens.

**Copy the entire section below:**

```markdown
# Credentials Broker — Agent Rules

You have access to a `credentials-broker` MCP server. Follow these rules strictly.

## Rule 1 — Never ask the user for API tokens, passwords, or secrets

If a task requires a token (GitHub, Google, Azure, AWS, etc.), use the broker to obtain it.
Never ask the user to paste a token into the chat.

## Rule 2 — Check if a token is already stored before authenticating

Before triggering an OAuth flow, always check if the token already exists:
```

get_secret(name: "<provider>-token", purpose: "check")

```

If it succeeds, use that reference. Only call `start_oauth_flow` if the secret is missing or expired.

## Rule 3 — OAuth flow requires no credentials from the user

Call `start_oauth_flow` with only `provider`, `scopes`, and `secret_name`.
The broker reads `client_id` and `client_secret` from its own environment — you must NOT ask the user for these.

```

start_oauth_flow(
provider: "github",
scopes: ["repo", "read:user"],
secret_name: "github-token"
)

```

Tell the user: "A browser window will open for you to log in. Come back here once done."

## Rule 4 — Standard token retrieval pattern

Every time you need a token to pass to another MCP tool, follow this exact sequence:

**Step 1** — Get a short-lived reference:
```

get_secret(name: "github-token", purpose: "<what you're doing>", ttl_seconds: 3600)
→ returns { reference: { id: "ref-uuid" } }

```

**Step 2** — Resolve the reference to the actual value:
```

resolve_secret(reference_id: "ref-uuid")
→ returns { value: "gho_actualtoken..." }

```

**Step 3** — Pass `value` to the target MCP tool's token/auth parameter.

## Rule 5 — Never log or display raw token values

After calling `resolve_secret`, use the value directly in the next tool call.
Do not print it, summarize it, or include it in any response to the user.

## Rule 6 — Naming convention for stored secrets

Use consistent names so tokens can be reused across tool calls in the same session:

| Provider | secret_name        |
|----------|--------------------|
| GitHub   | `github-token`     |
| Google   | `google-token`     |
| Azure    | `azure-token`      |
| Okta     | `okta-token`       |
| Custom   | `<service>-token`  |

## Rule 7 — Provider configuration errors

If `start_oauth_flow` fails with "not configured", tell the user:
> "The broker needs `<PROVIDER>_CLIENT_ID` and `<PROVIDER>_CLIENT_SECRET` set as environment variables where the broker is running. These are set once by you — I won't ask for them again."

## Summary flow

```

Need a token?
└─ get_secret("github-token") → exists? → resolve_secret → use it
→ missing? → start_oauth_flow → get_secret → resolve_secret → use it

```

```

---

## Available Tools

### `start_oauth_flow`

Opens the browser for you to log in. Stores the resulting token under `secret_name`. No credentials needed from you — the broker reads `client_id` and `client_secret` from its environment.

| Parameter                | Required | Description                                   |
| ------------------------ | -------- | --------------------------------------------- |
| `provider`               | yes      | `github`, `google`, `azure`, `okta`, `oauth2` |
| `scopes`                 | yes      | List of OAuth2 scopes to request              |
| `secret_name`            | yes      | Name to store the token under                 |
| `authorization_endpoint` | no       | Custom auth URL (only for `okta` / `oauth2`)  |
| `token_endpoint`         | no       | Custom token URL (only for `okta` / `oauth2`) |

```json
{
  "provider": "github",
  "scopes": ["repo", "read:user"],
  "secret_name": "github-token"
}
```

---

### `get_secret`

Issues a short-lived reference to a stored secret. Returns a reference ID, not the raw value.

| Parameter     | Required | Description                                     |
| ------------- | -------- | ----------------------------------------------- |
| `name`        | yes      | Name of the stored secret                       |
| `purpose`     | yes      | Why you're requesting it (for audit)            |
| `ttl_seconds` | no       | How long the reference is valid (default: 3600) |

```json
{
  "name": "github-token",
  "purpose": "listing repositories",
  "ttl_seconds": 3600
}
```

Response:

```json
{
  "reference": {
    "id": "ref-uuid",
    "name": "github-token",
    "expiresIn": 3600
  }
}
```

---

### `resolve_secret`

Resolves a reference ID to the actual token value. Used by the agent immediately before passing the token to another MCP tool.

| Parameter      | Required | Description                       |
| -------------- | -------- | --------------------------------- |
| `reference_id` | yes      | The `id` returned by `get_secret` |

```json
{ "reference_id": "ref-uuid" }
```

Response:

```json
{ "value": "gho_actualtoken..." }
```

---

### `store_secret`

Manually store a secret (e.g. a static API key). Use `get_secret` + `resolve_secret` to retrieve it later.

| Parameter | Required | Description                     |
| --------- | -------- | ------------------------------- |
| `name`    | yes      | Identifier for the secret       |
| `value`   | yes      | The secret value                |
| `tags`    | no       | Key-value tags for organization |

---

### `mint_token`

Generates a short-lived JWT-based token scoped to a provider. Useful when you want a broker-issued token rather than a raw OAuth token.

| Parameter     | Required | Description                                       |
| ------------- | -------- | ------------------------------------------------- |
| `provider`    | yes      | `github`, `aws`, `gcp`, `azure`, `oauth2`, `okta` |
| `scopes`      | yes      | List of scopes/permissions                        |
| `resource`    | no       | Resource identifier                               |
| `ttl_seconds` | no       | Token lifetime (default: provider default)        |

---

### `revoke_token`

Immediately invalidates a minted token.

| Parameter  | Required | Description               |
| ---------- | -------- | ------------------------- |
| `token_id` | yes      | ID of the token to revoke |

---

### `get_broker_stats`

Returns counts of active tokens, active references, and stored secrets.

---

## End-to-End Example

```
You:   "Create a GitHub issue in my repo"

Agent: 1. get_secret("github-token")           → not found
       2. start_oauth_flow(                     → browser opens
            provider: "github",
            scopes: ["repo"],
            secret_name: "github-token"
          )                                     → you log in → token stored
       3. get_secret("github-token",            → { id: "ref-abc" }
            purpose: "create issue")
       4. resolve_secret("ref-abc")             → { value: "gho_..." } ← never shown to you
       5. github-mcp/create_issue(              → issue created ✓
            token: "gho_...",
            title: "..."
          )
```

---

## Provider TTL Limits

| Provider         | Default TTL | Max TTL  |
| ---------------- | ----------- | -------- |
| GitHub           | 1 hour      | 8 hours  |
| AWS              | 1 hour      | 12 hours |
| GCP              | 1 hour      | 12 hours |
| Azure            | 1 hour      | 12 hours |
| Okta             | 1 hour      | 12 hours |
| OAuth2 (generic) | 1 hour      | 24 hours |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                MCP Credentials Broker                │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │           OAuth Web Flow                    │    │
│  │  - Spins up local HTTP server on :9876      │    │
│  │  - Opens browser to provider auth URL       │    │
│  │  - Receives callback with auth code         │    │
│  │  - Exchanges code for access token          │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │           Credentials Manager               │    │
│  │  - In-memory secret storage                 │    │
│  │  - Short-lived reference issuance           │    │
│  │  - Token lifecycle & auto-expiry            │    │
│  │  - Provider config from env vars            │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │           MCP Server Interface               │    │
│  │  - Tool definitions & request handling      │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Security Notes

- Tokens are stored **in memory only** — they are lost when the broker process restarts
- Raw token values are never returned by `get_secret` — only reference IDs
- The agent rule file instructs the agent to never display resolved token values
- Set `JWT_SECRET` env var in production to sign broker-issued tokens securely
- The OAuth callback server only runs during an active `start_oauth_flow` call, then shuts down

---

## Development

```bash
npm run watch   # TypeScript watch mode
npm run build   # Build
npm run dev     # Build + run
npm run lint    # Lint
```

---

## Contributing

Contributions welcome! Please follow existing TypeScript patterns and maintain proper type definitions.

## License

MIT — see LICENSE file for details

## Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io)
- [MCP SDK for TypeScript](https://github.com/modelcontextprotocol/typescript-sdk)

---

**Built by [@ars-system](https://github.com/ars-system)** • [Report Issues](https://github.com/ars-system/mcp-credentials-broker/issues)
