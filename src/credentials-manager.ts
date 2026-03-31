/**
 * Credentials Manager - Handles secrets and token lifecycle
 */

import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import {
  SecretReference,
  SecretMetadata,
  ShortLivedToken,
  Policy,
  Provider,
  ProviderConfig,
  GetSecretParams,
  MintTokenParams,
} from "./types.js";

export class CredentialsManager {
  private secrets: Map<string, SecretMetadata> = new Map();
  private secretReferences: Map<string, SecretReference> = new Map();
  private tokens: Map<string, ShortLivedToken> = new Map();
  private policies: Map<string, Policy> = new Map();
  private providerConfigs: Map<Provider, ProviderConfig> = new Map();
  private jwtSecret: string;

  constructor(jwtSecret: string = "your-secret-key-change-in-production") {
    this.jwtSecret = jwtSecret;
    this.initializeDefaultProviders();
  }

  private initializeDefaultProviders(): void {
    // GitHub provider
    this.providerConfigs.set("github", {
      type: "github",
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      tokenEndpoint: "https://github.com/login/oauth/access_token",
      defaultTTL: 3600,
      maxTTL: 28800,
    });

    // AWS provider
    this.providerConfigs.set("aws", {
      type: "aws",
      clientId: process.env.AWS_CLIENT_ID,
      clientSecret: process.env.AWS_CLIENT_SECRET,
      defaultTTL: 3600,
      maxTTL: 43200,
    });

    // GCP provider
    this.providerConfigs.set("gcp", {
      type: "gcp",
      clientId: process.env.GCP_CLIENT_ID,
      clientSecret: process.env.GCP_CLIENT_SECRET,
      defaultTTL: 3600,
      maxTTL: 43200,
    });

    // Azure provider
    this.providerConfigs.set("azure", {
      type: "azure",
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      defaultTTL: 3600,
      maxTTL: 43200,
    });

    // Generic OAuth2 provider
    this.providerConfigs.set("oauth2", {
      type: "oauth2",
      clientId: process.env.OAUTH2_CLIENT_ID,
      clientSecret: process.env.OAUTH2_CLIENT_SECRET,
      defaultTTL: 3600,
      maxTTL: 86400,
    });

    // Okta provider
    this.providerConfigs.set("okta", {
      type: "okta",
      clientId: process.env.OKTA_CLIENT_ID,
      clientSecret: process.env.OKTA_CLIENT_SECRET,
      tokenEndpoint: process.env.OKTA_DOMAIN
        ? `https://${process.env.OKTA_DOMAIN}/oauth2/v1/token`
        : undefined,
      defaultTTL: 3600,
      maxTTL: 43200,
    });
  }

  getProviderConfig(provider: Provider): ProviderConfig | undefined {
    return this.providerConfigs.get(provider);
  }

  hasSecret(name: string): boolean {
    return this.secrets.has(name);
  }

  resolveSecret(referenceId: string): string {
    return this.resolveSecretReference(referenceId);
  }

  /**
   * Store a secret in the broker
   */
  storeSecret(name: string, value: string, tags?: Record<string, string>): void {
    const secret: SecretMetadata = {
      name,
      value,
      createdAt: Date.now(),
      tags,
    };
    this.secrets.set(name, secret);
  }

  /**
   * Get a secret reference (not the actual secret value)
   */
  getSecretReference(params: GetSecretParams): SecretReference {
    const { name, purpose, ttl_seconds = 3600 } = params;

    if (!this.secrets.has(name)) {
      throw new Error(`Secret '${name}' not found`);
    }

    // Check policy if exists
    const policy = this.policies.get(name);
    if (policy) {
      this.enforcePolicy(policy, ttl_seconds);
    }

    const referenceId = uuidv4();
    const now = Date.now();
    const expiresAt = now + ttl_seconds * 1000;

    const reference: SecretReference = {
      id: referenceId,
      name,
      purpose,
      expiresAt,
      createdAt: now,
    };

    this.secretReferences.set(referenceId, reference);

    // Clean up expired reference after TTL
    setTimeout(() => {
      this.secretReferences.delete(referenceId);
    }, ttl_seconds * 1000);

    return reference;
  }

  /**
   * Resolve a secret reference to get the actual value
   */
  resolveSecretReference(referenceId: string): string {
    const reference = this.secretReferences.get(referenceId);

    if (!reference) {
      throw new Error("Secret reference not found or expired");
    }

    if (Date.now() > reference.expiresAt) {
      this.secretReferences.delete(referenceId);
      throw new Error("Secret reference has expired");
    }

    const secret = this.secrets.get(reference.name);
    if (!secret) {
      throw new Error("Secret not found");
    }

    return secret.value;
  }

  /**
   * Mint a short-lived token
   */
  mintToken(params: MintTokenParams): ShortLivedToken {
    const { provider, scopes, resource, ttl_seconds } = params;

    const providerConfig = this.providerConfigs.get(provider as Provider);
    if (!providerConfig) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const ttl = ttl_seconds || providerConfig.defaultTTL;
    if (ttl > providerConfig.maxTTL) {
      throw new Error(
        `TTL ${ttl}s exceeds maximum ${providerConfig.maxTTL}s for provider ${provider}`
      );
    }

    const tokenId = uuidv4();
    const now = Date.now();
    const expiresAt = now + ttl * 1000;

    // Generate JWT token with scopes and metadata
    const tokenPayload = {
      jti: tokenId,
      provider,
      scopes,
      resource,
      iat: Math.floor(now / 1000),
      exp: Math.floor(expiresAt / 1000),
    };

    const token = jwt.sign(tokenPayload, this.jwtSecret);

    const shortLivedToken: ShortLivedToken = {
      tokenId,
      token,
      provider,
      scopes,
      resource,
      expiresAt,
      createdAt: now,
    };

    this.tokens.set(tokenId, shortLivedToken);

    // Auto-cleanup after expiration
    setTimeout(() => {
      this.tokens.delete(tokenId);
    }, ttl * 1000);

    return shortLivedToken;
  }

  /**
   * Revoke a token
   */
  revokeToken(tokenId: string): boolean {
    if (!this.tokens.has(tokenId)) {
      return false;
    }

    this.tokens.delete(tokenId);
    return true;
  }

  /**
   * Verify a token is valid
   */
  verifyToken(tokenId: string): ShortLivedToken | null {
    const token = this.tokens.get(tokenId);

    if (!token) {
      return null;
    }

    if (Date.now() > token.expiresAt) {
      this.tokens.delete(tokenId);
      return null;
    }

    return token;
  }

  /**
   * Set policy for a secret or provider
   */
  setPolicy(resourceName: string, policy: Policy): void {
    this.policies.set(resourceName, policy);
  }

  /**
   * Enforce policy constraints
   */
  private enforcePolicy(policy: Policy, requestedTTL: number): void {
    if (policy.maxTTL && requestedTTL > policy.maxTTL) {
      throw new Error(`Requested TTL ${requestedTTL}s exceeds policy maximum ${policy.maxTTL}s`);
    }

    if (policy.requiresApproval) {
      throw new Error("This operation requires manual approval");
    }
  }

  /**
   * Get active tokens count
   */
  getActiveTokensCount(): number {
    return this.tokens.size;
  }

  /**
   * Get active secret references count
   */
  getActiveReferencesCount(): number {
    return this.secretReferences.size;
  }

  /**
   * Get secrets count
   */
  getSecretsCount(): number {
    return this.secrets.size;
  }

  /**
   * List all active tokens (without sensitive data)
   */
  listActiveTokens(): Array<Omit<ShortLivedToken, "token">> {
    const now = Date.now();
    return Array.from(this.tokens.values())
      .filter((t) => t.expiresAt > now)
      .map(({ token: _token, ...rest }) => rest);
  }

  /**
   * Cleanup expired tokens and references
   */
  cleanup(): void {
    const now = Date.now();

    // Cleanup expired tokens
    for (const [tokenId, token] of this.tokens.entries()) {
      if (token.expiresAt <= now) {
        this.tokens.delete(tokenId);
      }
    }

    // Cleanup expired secret references
    for (const [refId, ref] of this.secretReferences.entries()) {
      if (ref.expiresAt <= now) {
        this.secretReferences.delete(refId);
      }
    }
  }
}
