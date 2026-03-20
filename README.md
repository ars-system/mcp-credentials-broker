# MCP Credentials Broker

A Model Context Protocol (MCP) server that provides a **security layer for managing short-lived credentials and tokens**. This broker removes long-lived secrets from MCP server runtime environments and enforces policy-based access control with comprehensive audit logging.

## 🎯 Overview

The MCP Credentials Broker acts as a centralized security layer that:

- **Issues short-lived, scoped credentials** (OAuth tokens, AWS STS credentials, GitHub tokens, etc.)
- **Enforces policies** per tool/action (allowlist endpoints, denylist data types)
- **Produces audit logs** for every credential issuance and tool invocation
- **Eliminates hardcoded API keys** in environment variables across MCP servers

## 🚀 Key Features

### 1. Secret Reference Management

- Store secrets securely in the broker
- Issue time-limited secret references (not raw secrets)
- Automatic expiration and cleanup

### 2. Short-Lived Token Generation

- Support for multiple providers (GitHub, AWS, GCP, Azure, OAuth2)
- Configurable TTL with provider-specific maximums
- JWT-based tokens with scope enforcement

### 3. Token Lifecycle Management

- Immediate token revocation
- Automatic expiration
- Token verification and validation

### 4. Comprehensive Audit Logging

- Every credential operation logged
- Searchable audit trail with filtering
- Success/failure tracking
- Actor and resource tracking

### 5. Policy Enforcement

- Maximum TTL constraints
- Endpoint allowlisting/denylisting
- Data type restrictions
- Approval requirements

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/ars-system/mcp-credentials-broker.git
cd mcp-credentials-broker

# Install dependencies
npm install

# Build the project
npm run build

# Run the server
npm start
```

## 🔧 Configuration

### MCP Client Configuration

Add to your MCP client settings (e.g., Claude Desktop config):

```json
{
  "mcpServers": {
    "credentials-broker": {
      "command": "node",
      "args": ["/path/to/mcp-credentials-broker/dist/index.js"]
    }
  }
}
```

### Environment Variables

```bash
# Optional: Custom JWT secret for token signing
JWT_SECRET=your-secure-secret-key

# Optional: Custom audit log directory
AUDIT_LOG_DIR=./audit-logs
```

## 🛠️ Available Tools

### 1. `store_secret`

Store a secret in the credentials broker.

**Parameters:**

- `name` (string, required): Name/identifier for the secret
- `value` (string, required): The secret value to store
- `tags` (object, optional): Tags for organizing secrets

**Example:**

```json
{
  "name": "github-api-token",
  "value": "ghp_xxxxxxxxxxxx",
  "tags": {
    "environment": "production",
    "service": "github"
  }
}
```

### 2. `get_secret`

Issues a short-lived secret reference (not the raw secret).

**Parameters:**

- `name` (string, required): Name of the secret to retrieve
- `purpose` (string, required): Purpose for requesting the secret
- `ttl_seconds` (number, optional): Time-to-live in seconds (default: 3600)

**Response:**

```json
{
  "success": true,
  "reference": {
    "id": "uuid-reference-id",
    "name": "github-api-token",
    "purpose": "GitHub API access",
    "expiresAt": 1234567890123,
    "expiresIn": 3600
  }
}
```

### 3. `mint_token`

Generates a short-lived, scoped token for a specific provider.

**Parameters:**

- `provider` (string, required): Provider type (`github`, `aws`, `gcp`, `azure`, `oauth2`)
- `scopes` (array, required): List of scopes/permissions
- `resource` (string, optional): Resource identifier
- `ttl_seconds` (number, optional): Time-to-live in seconds

**Example:**

```json
{
  "provider": "github",
  "scopes": ["repo", "read:user"],
  "resource": "organization/repository",
  "ttl_seconds": 1800
}
```

**Response:**

```json
{
  "success": true,
  "token": {
    "tokenId": "uuid-token-id",
    "token": "jwt-token-string",
    "provider": "github",
    "scopes": ["repo", "read:user"],
    "resource": "organization/repository",
    "expiresAt": 1234567890123,
    "expiresIn": 1800
  }
}
```

### 4. `revoke_token`

Immediately revokes a previously issued token.

**Parameters:**

- `token_id` (string, required): ID of the token to revoke

**Response:**

```json
{
  "success": true,
  "message": "Token revoked successfully"
}
```

### 5. `audit_search`

Search and retrieve audit logs for credential operations.

**Parameters:**

- `query` (string, optional): Free-text search query
- `time_range` (object, optional): Time range filter
  - `start` (number): Start timestamp (Unix milliseconds)
  - `end` (number): End timestamp (Unix milliseconds)
- `actor` (string, optional): Filter by actor/user

**Example:**

```json
{
  "query": "github",
  "time_range": {
    "start": 1234567890000,
    "end": 1234567990000
  },
  "actor": "mcp-client"
}
```

### 6. `get_broker_stats`

Get statistics about the credentials broker.

**Response:**

```json
{
  "success": true,
  "stats": {
    "activeTokens": 5,
    "activeReferences": 3,
    "storedSecrets": 10,
    "audit": {
      "totalLogs": 150,
      "successfulOperations": 145,
      "failedOperations": 5,
      "actionBreakdown": {
        "get_secret": 50,
        "mint_token": 80,
        "revoke_token": 20
      }
    }
  }
}
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│           MCP Credentials Broker                │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │      Credentials Manager                 │  │
│  │  - Secret storage & references           │  │
│  │  - Token lifecycle management            │  │
│  │  - Policy enforcement                    │  │
│  │  - Provider configurations               │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │      Audit Logger                        │  │
│  │  - Comprehensive logging                 │  │
│  │  - Searchable audit trail                │  │
│  │  - Persistent storage                    │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │      MCP Server Interface                │  │
│  │  - Tool definitions                      │  │
│  │  - Request handling                      │  │
│  │  - Error management                      │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

## 🔒 Security Features

### Short-Lived Credentials

- Tokens automatically expire based on provider limits
- Secret references have configurable TTLs
- Automatic cleanup of expired credentials

### Policy Enforcement

- Maximum TTL limits per provider
- Endpoint allowlisting/denylisting
- Approval requirements for sensitive operations
- Scope-based access control

### Audit Trail

- Every operation logged with timestamp
- Actor tracking for accountability
- Success/failure status
- Detailed operation metadata
- Persistent log storage

## 🔄 Provider Support

### GitHub

- Default TTL: 1 hour
- Max TTL: 8 hours
- Supports fine-grained tokens

### AWS

- Default TTL: 1 hour
- Max TTL: 12 hours
- STS credential support

### GCP

- Default TTL: 1 hour
- Max TTL: 12 hours
- Service account tokens

### Azure

- Default TTL: 1 hour
- Max TTL: 12 hours
- Azure AD tokens

### OAuth2 (Generic)

- Default TTL: 1 hour
- Max TTL: 24 hours
- Customizable endpoints

## 📊 Use Cases

### 1. Secure MCP Server Integration

Replace hardcoded API keys in other MCP servers with short-lived tokens from the broker.

### 2. Multi-Service Authentication

Centralize credential management for services that integrate with multiple cloud providers.

### 3. Compliance & Auditing

Maintain comprehensive audit logs for compliance requirements (SOC2, HIPAA, etc.).

### 4. Development Teams

Enforce organizational security policies across all MCP tool usage.

## 🧪 Development

```bash
# Watch mode for development
npm run watch

# Build
npm run build

# Run in development
npm run dev
```

## 📝 Example Workflow

```typescript
// 1. Store a secret
{
  "tool": "store_secret",
  "params": {
    "name": "github-token",
    "value": "ghp_xxxxxxxxxxxx"
  }
}

// 2. Get a secret reference
{
  "tool": "get_secret",
  "params": {
    "name": "github-token",
    "purpose": "Repository access",
    "ttl_seconds": 3600
  }
}

// 3. Mint a scoped token
{
  "tool": "mint_token",
  "params": {
    "provider": "github",
    "scopes": ["repo"],
    "ttl_seconds": 1800
  }
}

// 4. Check broker statistics
{
  "tool": "get_broker_stats"
}

// 5. Search audit logs
{
  "tool": "audit_search",
  "params": {
    "query": "github",
    "actor": "mcp-client"
  }
}
```

## 📦 Publishing to npm

This project is configured to automatically publish to npm when you push to the `main` branch using GitHub Actions.

### Setup Instructions

#### 1. Create an npm Account

If you don't have one, create an account at [npmjs.com](https://www.npmjs.com/signup)

#### 2. Generate an npm Access Token

1. Log in to [npmjs.com](https://www.npmjs.com)
2. Click on your profile icon → **Access Tokens**
3. Click **Generate New Token** → **Classic Token**
4. Select **Automation** token type
5. Copy the generated token

#### 3. Add npm Token to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `NPM_TOKEN`
5. Value: Paste your npm token
6. Click **Add secret**

#### 4. Update Repository URLs

Before publishing, update the repository URLs in `package.json`:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/ars-system/mcp-credentials-broker.git"
},
"bugs": {
  "url": "https://github.com/ars-system/mcp-credentials-broker/issues"
},
"homepage": "https://github.com/ars-system/mcp-credentials-broker#readme"
```

#### 5. Publish

Once configured, simply push to the `main` branch:

```bash
git add .
git commit -m "Ready for npm publish"
git push origin main
```

The GitHub Actions workflow will automatically:

- Install dependencies
- Run linters
- Build the TypeScript project
- Publish to npm with provenance

### Manual Publishing

You can also publish manually:

```bash
# Login to npm
npm login

# Build the project
npm run build

# Publish
npm publish --access public
```

### Version Management

Update the version in `package.json` before publishing:

```bash
# Patch release (1.0.0 → 1.0.1)
npm version patch

# Minor release (1.0.0 → 1.1.0)
npm version minor

# Major release (1.0.0 → 2.0.0)
npm version major
```

## 🤝 Contributing

Contributions are welcome! Please ensure:

- Code follows TypeScript best practices
- All functions are properly typed
- Audit logging is maintained for new operations
- Tests are included for new features

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io)
- [MCP SDK for TypeScript](https://github.com/modelcontextprotocol/typescript-sdk)

## ⚠️ Important Security Notes

1. **Change the JWT secret** in production environments
2. **Secure the audit log directory** with appropriate file permissions
3. **Rotate secrets regularly** using the store_secret tool
4. **Monitor audit logs** for suspicious activity
5. **Set appropriate TTLs** based on your security requirements

---

**Differentiator**: Unlike other MCP servers that hardcode `API_KEY` in environment variables, this tool becomes the "security layer" for an organization, providing centralized credential management, policy enforcement, and audit trails.
