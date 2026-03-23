# MCP Credentials Broker

A secure credential management layer for Model Context Protocol (MCP) servers. Stop hardcoding API keys in environment variables and start using short-lived, scoped tokens with built-in audit logging.

## Why Use This?

If you're building MCP servers that need to access external APIs (GitHub, AWS, GCP, etc.), you've probably hardcoded API keys in environment variables. This broker solves that problem by:

- Issuing short-lived tokens instead of exposing long-lived secrets
- Enforcing security policies (TTL limits, scope restrictions, endpoint controls)
- Logging every credential operation for compliance and debugging
- Centralizing credential management across multiple MCP servers

## Features

**Secret Management**

- Store secrets once, get time-limited references instead of raw values
- Automatic cleanup of expired references

**Multi-Provider Token Generation**

- GitHub, AWS, GCP, Azure, and generic OAuth2 support
- Configurable TTLs with provider-specific limits
- JWT-based tokens with scope enforcement

**Token Lifecycle**

- Revoke tokens immediately when needed
- Automatic expiration handling
- Token verification and validation

**Audit Trail**

- Every operation is logged with timestamps and actor information
- Search and filter audit logs by time range, actor, or query
- Track success/failure rates

**Policy Enforcement**

- Set maximum TTL constraints per provider
- Control which endpoints can be accessed
- Require approval for sensitive operations

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

## Use Cases

**Secure MCP Server Integration**  
Replace hardcoded API keys in your MCP servers with short-lived tokens from the broker.

**Multi-Service Authentication**  
Manage credentials for multiple cloud providers (AWS, GCP, Azure) from one place.

**Compliance & Auditing**  
Maintain audit logs for SOC2, HIPAA, or other compliance requirements.

**Team Security Policies**  
Enforce consistent security policies across all MCP tools in your organization.

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

## Contributing

Contributions welcome! Please:

- Follow existing TypeScript patterns
- Maintain proper type definitions
- Keep audit logging for all credential operations
- Add tests for new features

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

**Built by [@ars-system](https://github.com/ars-system)** • [Report Issues](https://github.com/ars-system/mcp-credentials-broker/issues)
