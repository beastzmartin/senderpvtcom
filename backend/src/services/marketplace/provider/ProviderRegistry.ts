import { ProviderAdapter } from './ProviderAdapter.js';
import { ApifyAdapter } from './ApifyAdapter.js';
import { MockProviderAdapter } from './MockProviderAdapter.js';

export class ProviderRegistry {
  private static instance: ProviderRegistry | null = null;
  private adapters: Map<string, ProviderAdapter> = new Map();

  private constructor() {
    this.register(new ApifyAdapter());
    this.register(new MockProviderAdapter());
  }

  public static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  public register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.providerType.toLowerCase(), adapter);
  }

  public getAdapter(providerType: string): ProviderAdapter {
    const key = (providerType || 'apify').toLowerCase();
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new Error(`PROVIDER_NOT_SUPPORTED: No provider adapter registered for type "${providerType}".`);
    }
    return adapter;
  }

  public get(providerType: string): ProviderAdapter {
    return this.getAdapter(providerType);
  }

  /**
   * Helper to retrieve the mock adapter directly for unit testing
   */
  public getMockAdapter(): MockProviderAdapter {
    return this.getAdapter('mock') as MockProviderAdapter;
  }
}
