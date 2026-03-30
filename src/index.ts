#!/usr/bin/env node

/**
 * MCP Credentials Broker Server
 * A security layer for managing short-lived credentials and tokens
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { CredentialsManager } from "./credentials-manager.js";
import { GetSecretParams, MintTokenParams, RevokeTokenParams } from "./types.js";

// Initialize core components
const credentialsManager = new CredentialsManager();

// Default actor for operations

// Periodic cleanup of expired tokens and references
setInterval(() => {
  credentialsManager.cleanup();
}, 60000); // Every minute

// Define MCP tools
const tools: Tool[] = [
  {
    name: "get_secret",
    description:
      "Issues a short-lived secret reference for a stored secret. Returns a reference ID (not the raw secret) with an expiry time. The reference can be used to retrieve the actual secret value within the TTL period.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the secret to retrieve",
        },
        purpose: {
          type: "string",
          description: "Purpose for which the secret is being requested",
        },
        ttl_seconds: {
          type: "number",
          description: "Time-to-live in seconds for the secret reference (default: 3600)",
          default: 3600,
        },
      },
      required: ["name", "purpose"],
    },
  },
  {
    name: "mint_token",
    description:
      "Generates a short-lived, scoped token for a specific provider (OAuth, GitHub, AWS STS, GCP, Azure). The token is automatically revoked after the TTL expires.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          enum: ["github", "aws", "gcp", "azure", "oauth2", "custom"],
          description: "Provider type for the token",
        },
        scopes: {
          type: "array",
          items: {
            type: "string",
          },
          description: "List of scopes/permissions for the token",
        },
        resource: {
          type: "string",
          description: "Optional resource identifier the token is for",
        },
        ttl_seconds: {
          type: "number",
          description: "Time-to-live in seconds for the token (default: provider default)",
        },
      },
      required: ["provider", "scopes"],
    },
  },
  {
    name: "revoke_token",
    description:
      "Immediately revokes a previously issued token, making it invalid for any further use.",
    inputSchema: {
      type: "object",
      properties: {
        token_id: {
          type: "string",
          description: "ID of the token to revoke",
        },
      },
      required: ["token_id"],
    },
  },
  {
    name: "store_secret",
    description:
      "Store a secret in the credentials broker. This secret can then be referenced using get_secret.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name/identifier for the secret",
        },
        value: {
          type: "string",
          description: "The secret value to store",
        },
        tags: {
          type: "object",
          description: "Optional tags for organizing secrets",
        },
      },
      required: ["name", "value"],
    },
  },
  {
    name: "get_broker_stats",
    description:
      "Get statistics about the credentials broker including active tokens, secret references, and audit log summary.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Create MCP server
const server = new Server(
  {
    name: "mcp-credentials-broker",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_secret": {
        const params = args as unknown as GetSecretParams;

        const reference = credentialsManager.getSecretReference(params);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  reference: {
                    id: reference.id,
                    name: reference.name,
                    purpose: reference.purpose,
                    expiresAt: reference.expiresAt,
                    expiresIn: Math.floor((reference.expiresAt - Date.now()) / 1000),
                  },
                  message:
                    "Secret reference issued successfully. Use the reference ID to retrieve the actual secret value.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "mint_token": {
        const params = args as unknown as MintTokenParams;

        const token = credentialsManager.mintToken(params);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  token: {
                    tokenId: token.tokenId,
                    token: token.token,
                    provider: token.provider,
                    scopes: token.scopes,
                    resource: token.resource,
                    expiresAt: token.expiresAt,
                    expiresIn: Math.floor((token.expiresAt - Date.now()) / 1000),
                  },
                  message: "Token minted successfully. This token will expire automatically.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "revoke_token": {
        const params = args as unknown as RevokeTokenParams;

        const revoked = credentialsManager.revokeToken(params.token_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: revoked,
                  message: revoked
                    ? "Token revoked successfully"
                    : "Token not found or already expired",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "store_secret": {
        const { name, value, tags } = args as {
          name: string;
          value: string;
          tags?: Record<string, string>;
        };

        credentialsManager.storeSecret(name, value, tags);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Secret '${name}' stored successfully`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_broker_stats": {
        const brokerStats = {
          activeTokens: credentialsManager.getActiveTokensCount(),
          activeReferences: credentialsManager.getActiveReferencesCount(),
          storedSecrets: credentialsManager.getSecretsCount(),
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  stats: brokerStats,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: errorMessage,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Credentials Broker Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
