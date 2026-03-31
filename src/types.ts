/**
 * Types and interfaces for the MCP Credentials Broker
 */

export interface SecretReference {
  id: string;
  name: string;
  purpose: string;
  expiresAt: number;
  createdAt: number;
  scope?: string[];
}

export interface SecretMetadata {
  name: string;
  value: string;
  createdAt: number;
  tags?: Record<string, string>;
}

export interface ShortLivedToken {
  tokenId: string;
  token: string;
  provider: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
  createdAt: number;
}

export interface Policy {
  allowedEndpoints?: string[];
  deniedEndpoints?: string[];
  allowedDataTypes?: string[];
  deniedDataTypes?: string[];
  maxTTL?: number;
  requiresApproval?: boolean;
}

export interface GetSecretParams {
  name: string;
  purpose: string;
  ttl_seconds?: number;
}

export interface MintTokenParams {
  provider: string;
  scopes: string[];
  resource?: string;
  ttl_seconds?: number;
}

export interface RevokeTokenParams {
  token_id: string;
}

export type Provider = "github" | "aws" | "gcp" | "azure" | "oauth2" | "okta" | "custom";

export interface ProviderConfig {
  type: Provider;
  clientId?: string;
  clientSecret?: string;
  tokenEndpoint?: string;
  defaultTTL: number;
  maxTTL: number;
}
