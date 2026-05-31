import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import {
  getModelDefinition,
  getProviderDefinition,
  listModelDefinitions,
  listProviderDefinitions,
} from '../src/providers/catalog';
import { discoverModelsForProvider } from '../src/providers/discovery';
import { createProvider, isProviderRuntimeSupported } from '../src/providers/factory';
import { OpenAIProvider } from '../src/providers/openai';
import { resolveProviderCommandConfig } from '../src/config/provider';
import type { ProviderDefinition } from '../src/providers/catalog/types';

describe('provider catalog', () => {
  it('auto-discovers provider and gateway definitions', () => {
    const definitions = listProviderDefinitions();
    const opengateway = getProviderDefinition('opengateway');

    expect(definitions.map((definition) => definition.id)).toContain('opengateway');
    expect(opengateway?.kind).toBe('gateway');
    expect(opengateway?.baseURL).toBe('https://opengateway.gitlawb.com/v1');
    expect(opengateway?.defaultModel).toBe('mimo-v2.5-pro');
  });

  it('auto-discovers global model catalog entries', () => {
    const models = listModelDefinitions();
    const gpt4o = getModelDefinition('gpt-4o');

    expect(models.map((model) => model.id)).toContain('gpt-4o');
    expect(gpt4o?.tier).toBe('first-party');
  });

  it('creates runtime providers from provider config without route-specific source edits', () => {
    const provider = createProvider({
      providerId: 'opengateway',
      apiKey: 'test-key',
      baseURL: 'https://opengateway.gitlawb.com/v1',
      model: 'mimo-v2.5-pro',
    });

    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it('does not mark catalog transports as runnable until their runtime exists', () => {
    const nativeDefinition: ProviderDefinition = {
      id: 'native-test',
      name: 'Native Test',
      kind: 'provider',
      description: 'Unsupported native test provider',
      baseURL: 'https://example.com',
      defaultModel: 'native-model',
      transportConfig: {
        kind: 'gemini-native',
      },
    };

    expect(isProviderRuntimeSupported(nativeDefinition)).toBe(false);
  });

  it('uses catalog defaults when provider commands only return a provider id', () => {
    const config = resolveProviderCommandConfig({
      provider_id: 'opengateway',
      api_key: 'ogw_live_test',
    });

    expect(config).toEqual({
      providerId: 'opengateway',
      apiKey: 'ogw_live_test',
      baseURL: 'https://opengateway.gitlawb.com/v1',
      model: 'mimo-v2.5-pro',
    });
  });

  it('discovers OpenAI-compatible models and merges them with static catalog models', async () => {
    const originalFetch = globalThis.fetch;
    const originalConfigDir = process.env.ZERO_CONFIG_DIR;
    const testConfigDir = join(import.meta.dir, '..', '.zero-test-cache', 'provider-catalog');
    const requests: RequestInfo[] = [];

    rmSync(testConfigDir, { recursive: true, force: true });
    process.env.ZERO_CONFIG_DIR = testConfigDir;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requests.push(input as RequestInfo);
      return new Response(JSON.stringify({
        data: [
          { id: 'discovered-model' },
          { id: 'mimo-v2.5-pro' },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await discoverModelsForProvider('opengateway', {
        apiKey: 'ogw_live_test',
        forceRefresh: true,
      });

      expect(result?.source).toBe('network');
      expect(result?.models.map((model) => model.apiName)).toEqual([
        'mimo-v2.5-pro',
        'discovered-model',
      ]);
      expect(String(requests[0])).toBe('https://opengateway.gitlawb.com/v1/models');
      expect(readFileSync(join(testConfigDir, 'model-cache.json'), 'utf-8')).not.toContain('ogw_live_test');
    } finally {
      globalThis.fetch = originalFetch;
      if (originalConfigDir === undefined) {
        delete process.env.ZERO_CONFIG_DIR;
      } else {
        process.env.ZERO_CONFIG_DIR = originalConfigDir;
      }
      rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  it('does not cache first-time discovery failures as fresh results', async () => {
    const originalFetch = globalThis.fetch;
    const originalConfigDir = process.env.ZERO_CONFIG_DIR;
    const testConfigDir = join(import.meta.dir, '..', '.zero-test-cache', 'provider-catalog-failure');
    let requestCount = 0;

    rmSync(testConfigDir, { recursive: true, force: true });
    process.env.ZERO_CONFIG_DIR = testConfigDir;

    globalThis.fetch = (async () => {
      requestCount += 1;
      return new Response(JSON.stringify({ error: 'temporary failure' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const first = await discoverModelsForProvider('opengateway', {
        apiKey: 'ogw_live_test',
      });
      const second = await discoverModelsForProvider('opengateway', {
        apiKey: 'ogw_live_test',
      });

      expect(first?.source).toBe('error');
      expect(second?.source).toBe('error');
      expect(requestCount).toBe(2);
      expect(existsSync(join(testConfigDir, 'model-cache.json'))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalConfigDir === undefined) {
        delete process.env.ZERO_CONFIG_DIR;
      } else {
        process.env.ZERO_CONFIG_DIR = originalConfigDir;
      }
      rmSync(testConfigDir, { recursive: true, force: true });
    }
  });
});
