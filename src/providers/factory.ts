import { OpenAIProvider } from './openai';
import type { Provider } from './types';
import type { ProviderConfig } from '../config/provider';
import { getProviderDefinition } from './catalog';
import type { OpenAIShimAuthHeaderConfig, ProviderDefinition } from './catalog/types';

function buildAuthHeaders(
  apiKey: string,
  authHeader?: OpenAIShimAuthHeaderConfig
): Record<string, string | null> {
  if (!apiKey || !authHeader) return {};

  const headerName = authHeader.name;
  const lowerName = headerName.toLowerCase();
  const headerValue = authHeader.scheme === 'raw' ? apiKey : `Bearer ${apiKey}`;

  if (lowerName === 'authorization' && authHeader.scheme !== 'raw') {
    return {};
  }

  return {
    [headerName]: headerValue,
    ...(lowerName === 'authorization' ? {} : { Authorization: null }),
  };
}

export function createProvider(config: ProviderConfig): Provider {
  const definition = config.providerId ? getProviderDefinition(config.providerId) : undefined;
  if (definition && !isProviderRuntimeSupported(definition)) {
    throw new Error(
      `Provider "${definition.name}" uses unsupported transport "${definition.transportConfig?.kind}". ` +
      'Only openai-compatible catalog transports are currently implemented.'
    );
  }

  const apiKey = config.apiKey || '';
  const headers = {
    ...(definition?.transportConfig?.headers ?? {}),
    ...(definition?.transportConfig?.openaiShim?.headers ?? {}),
    ...buildAuthHeaders(apiKey, definition?.transportConfig?.openaiShim?.defaultAuthHeader),
  };

  return new OpenAIProvider({
    apiKey,
    baseURL: config.baseURL,
    model: config.model,
    defaultHeaders: Object.keys(headers).length > 0 ? headers : undefined,
  });
}

export function isProviderRuntimeSupported(definition: ProviderDefinition): boolean {
  return (definition.transportConfig?.kind ?? 'openai-compatible') === 'openai-compatible';
}
