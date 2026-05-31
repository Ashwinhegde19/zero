export type ProviderKind = 'gateway' | 'provider';
export type AuthMode = 'api-key' | 'oauth' | 'adc' | 'token' | 'none';
export type TransportKind =
  | 'openai-compatible'
  | 'anthropic-compatible'
  | 'anthropic-native'
  | 'gemini-native'
  | 'bedrock'
  | 'vertex'
  | 'local';
export type ModelCatalogSource = 'static' | 'dynamic' | 'hybrid';
export type DiscoveryRefreshMode = 'manual' | 'on-open' | 'background-if-stale' | 'startup';
export type ModelDiscoveryKind = 'openai-compatible' | 'ollama' | 'custom';
export type OpenAIShimTokenField = 'max_tokens' | 'max_completion_tokens';
export type OpenAIShimAuthScheme = 'bearer' | 'raw';

export interface ModelDefinition {
  id: string;
  name?: string;
  apiName?: string;
  label?: string;
  default?: boolean;
  hidden?: boolean;
  brandId?: string;
  vendorId?: string;
  gatewayId?: string;
  classification?: ('chat' | 'reasoning' | 'vision' | 'coding')[];
  tier?: 'first-party' | 'hosted' | 'local' | 'community';
  description?: string;
  capabilities?: CapabilityFlags;
  contextWindow?: number;
  maxOutputTokens?: number;
  transportOverrides?: CatalogTransportOverrides;
  providerModelMap?: Record<string, string>;
  notes?: string;
}

export interface CapabilityFlags {
  supportsVision?: boolean;
  supportsStreaming?: boolean;
  supportsFunctionCalling?: boolean;
  supportsJsonMode?: boolean;
  supportsReasoning?: boolean;
  supportsPreciseTokenCount?: boolean;
  supportsEmbeddings?: boolean;
}

export interface OpenAIShimAuthHeaderConfig {
  name: string;
  scheme?: OpenAIShimAuthScheme;
}

export interface OpenAIShimUiConfig {
  showAuthHeader?: boolean;
  showAuthHeaderValue?: boolean;
  showCustomHeaders?: boolean;
}

export interface OpenAIShimTransportConfig {
  headers?: Record<string, string>;
  supportsApiFormatSelection?: boolean;
  supportsAuthHeaders?: boolean;
  ui?: OpenAIShimUiConfig;
  defaultAuthHeader?: OpenAIShimAuthHeaderConfig;
  responsesApiModelPrefixes?: string[];
  preserveReasoningContent?: boolean;
  requireReasoningContentOnAssistantMessages?: boolean;
  reasoningContentFallback?: '' | 'omit';
  thinkingRequestFormat?: 'none' | 'deepseek-compatible';
  maxTokensField?: OpenAIShimTokenField;
  removeBodyFields?: string[];
  endpointPath?: string;
}

export interface TransportConfig {
  kind: TransportKind;
  headers?: Record<string, string>;
  openaiShim?: OpenAIShimTransportConfig;
}

export interface CatalogTransportOverrides {
  openaiShim?: Partial<OpenAIShimTransportConfig>;
}

export interface ModelDiscoveryConfig {
  kind: ModelDiscoveryKind;
  requiresAuth?: boolean;
  path?: string;
  parse?: 'openai-models-list' | 'ollama-tags' | 'custom';
}

export interface ModelCatalogConfig {
  source: ModelCatalogSource;
  discovery?: ModelDiscoveryConfig;
  discoveryCacheTtl?: string | number;
  discoveryRefreshMode?: DiscoveryRefreshMode;
  allowManualRefresh?: boolean;
  models?: ModelDefinition[];
}

export interface SetupMetadata {
  requiresAuth: boolean;
  authMode: AuthMode;
  credentialEnvVars?: string[];
  setupPrompt?: string;
}

export interface StartupMetadata {
  autoDetectable?: boolean;
  probeReadiness?: 'ollama-generation' | 'openai-compatible-models';
  enablementEnvVar?: string;
}

export interface UsageMetadata {
  supported: boolean;
  delegateToProviderId?: string;
  delegateToGatewayId?: string;
  fetchModule?: string;
  parseModule?: string;
  ui?: {
    showResetCountdown?: boolean;
    compactProgressBar?: boolean;
    fallbackMessage?: string;
  };
  silentlyIgnore?: boolean;
}

export interface ValidationRoutingMetadata {
  enablementEnvVar?: string;
  matchDefaultBaseUrl?: boolean;
  matchBaseUrlHosts?: string[];
  fallbackWhenUseOpenAI?: boolean;
  skipWhenUseOpenAI?: boolean;
}

export interface InvalidCredentialValue {
  envVar: string;
  value: string;
  message: string;
}

export type ValidationMetadata =
  | {
      routing?: ValidationRoutingMetadata;
      kind: 'credential-env';
      credentialEnvVars: string[];
      allowLocalBaseUrlWithoutCredential?: boolean;
      missingCredentialMessage?: string;
      invalidCredentialValues?: InvalidCredentialValue[];
    }
  | {
      routing?: ValidationRoutingMetadata;
      kind: 'gemini-credential';
      missingCredentialMessage: string;
    }
  | {
      routing?: ValidationRoutingMetadata;
      kind: 'github-token';
      missingCredentialMessage: string;
      expiredCredentialMessage: string;
      invalidCredentialMessage: string;
    }
  | {
      routing?: ValidationRoutingMetadata;
      kind: 'xai-credential';
      credentialEnvVars: string[];
      credentialSourceEnvMarkers?: Record<string, string[]>;
      missingCredentialMessage: string;
    };

export interface PresetBadge {
  text: string;
  color?: string;
}

export interface ProviderPresetMetadata {
  id: string;
  description: string;
  label?: string;
  name?: string;
  providerId?: string;
  apiKeyEnvVars?: string[];
  baseUrlEnvVars?: string[];
  modelEnvVars?: string[];
  fallbackBaseUrl?: string;
  fallbackModel?: string;
  badge?: PresetBadge;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  kind: ProviderKind;
  category?: 'local' | 'hosted' | 'aggregating';
  description: string;
  baseURL: string;
  defaultModel: string;
  supportsModelRouting?: boolean;
  setup?: SetupMetadata;
  startup?: StartupMetadata;
  transportConfig?: TransportConfig;
  catalog?: ModelCatalogConfig;
  validation?: ValidationMetadata;
  usage?: UsageMetadata;
  preset?: ProviderPresetMetadata;
  isFirstParty?: boolean;
  apiKeyLabel?: string;
  apiKeyPlaceholder?: string;
  apiKeyRequired?: boolean;
  credentialEnvVars?: string[];
  models?: ModelDefinition[];
}

export interface ResolvedModelDefinition extends ModelDefinition {
  apiName: string;
  providerId?: string;
  providerName?: string;
  providerKind?: ProviderKind;
}

export interface ModelDiscoveryResult {
  providerId: string;
  models: ResolvedModelDefinition[];
  source: 'static' | 'network' | 'cache' | 'stale-cache' | 'error';
  stale: boolean;
  error?: string;
}
