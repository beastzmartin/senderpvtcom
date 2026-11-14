import { IVirtualNumberProvider } from './IVirtualNumberProvider.js';
import { MockVirtualNumberProvider } from './MockVirtualNumberProvider.js';
import { GrizzlyProviderAdapter } from './grizzly/GrizzlyProviderAdapter.js';
import { getDatabase } from '../../db/database.js';

export class ProviderRegistry {
  private static instance: ProviderRegistry | null = null;
  private providers: Map<string, IVirtualNumberProvider> = new Map();

  private constructor() {
    // Register built-in sandbox mock provider for dev/testing
    const mock = new MockVirtualNumberProvider();
    this.registerProvider(mock);

    // Register GrizzlySMS Partner Protocol provider adapter
    const grizzly = new GrizzlyProviderAdapter();
    this.registerProvider(grizzly);
  }

  public static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  /**
   * Register a provider adapter into the runtime registry
   */
  public registerProvider(provider: IVirtualNumberProvider): void {
    this.providers.set(provider.providerId, provider);
    console.log(`[ProviderRegistry] Registered provider adapter: "${provider.name}" (${provider.providerId}, mock=${provider.isMock})`);
  }

  /**
   * Get provider instance by slug or database ID
   */
  public getProvider(identifier?: string | null): IVirtualNumberProvider {
    if (identifier && this.providers.has(identifier)) {
      return this.providers.get(identifier)!;
    }

    // Try finding by database ID if mapped
    if (identifier) {
      const db = getDatabase();
      const row = db.prepare('SELECT slug FROM virtual_number_providers WHERE id = ? OR slug = ?').get(identifier, identifier) as any;
      if (row && this.providers.has(row.slug)) {
        return this.providers.get(row.slug)!;
      }
    }

    // Default to sandbox mock provider
    const fallback = this.providers.get('global-telecom-sandbox');
    if (!fallback) {
      throw new Error('No active virtual number provider configured in system.');
    }
    return fallback;
  }

  /**
   * List all registered provider adapters in memory
   */
  public listRegisteredProviders(): Array<{ id: string; name: string; isMock: boolean }> {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.providerId,
      name: p.name,
      isMock: p.isMock
    }));
  }
}
