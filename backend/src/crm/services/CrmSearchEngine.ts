import { Contact, FilterGroup, KeysetPaginationParams, PaginatedResult } from '../models/types.js';

export interface CrmSearchEngine {
  engineName: string;
  isAvailable(): Promise<boolean>;
  indexContact(contact: Contact): Promise<void>;
  bulkIndexContacts(contacts: Contact[]): Promise<void>;
  deleteContact(workspaceId: string, contactId: string): Promise<void>;
  searchContacts(
    workspaceId: string,
    query: string,
    filter?: FilterGroup,
    pagination?: KeysetPaginationParams
  ): Promise<PaginatedResult<Contact>>;
}

/**
 * Default Database Search Provider (Grounding queries directly in PostgreSQL / SQLite indices)
 */
export class DatabaseSearchProvider implements CrmSearchEngine {
  public engineName = 'DatabaseEngine';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async indexContact(_contact: Contact): Promise<void> {
    // Database indexes automatically update on row commit
  }

  async bulkIndexContacts(_contacts: Contact[]): Promise<void> {
    // Database indexes automatically update on row commit
  }

  async deleteContact(_workspaceId: string, _contactId: string): Promise<void> {
    // Database triggers or soft-deletes manage state
  }

  async searchContacts(
    _workspaceId: string,
    _query: string,
    _filter?: FilterGroup,
    _pagination?: KeysetPaginationParams
  ): Promise<PaginatedResult<Contact>> {
    throw new Error('DatabaseSearchProvider delegates to CrmStorageAdapter');
  }
}

/**
 * OpenSearch / ClickHouse Search Provider Stub for Scaling to 100M+ Analytical Filters
 */
export class OpenSearchProvider implements CrmSearchEngine {
  public engineName = 'OpenSearchEngine';
  private endpoint: string;

  constructor(endpoint: string = process.env.OPENSEARCH_URL || 'http://localhost:9200') {
    this.endpoint = endpoint;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.OPENSEARCH_URL);
  }

  async indexContact(contact: Contact): Promise<void> {
    if (!await this.isAvailable()) return;
    // In production: PUT /crm_contacts/_doc/{id}
  }

  async bulkIndexContacts(contacts: Contact[]): Promise<void> {
    if (!await this.isAvailable() || contacts.length === 0) return;
    // In production: POST /crm_contacts/_bulk
  }

  async deleteContact(workspaceId: string, contactId: string): Promise<void> {
    if (!await this.isAvailable()) return;
    // In production: DELETE /crm_contacts/_doc/{contactId}
  }

  async searchContacts(
    _workspaceId: string,
    _query: string,
    _filter?: FilterGroup,
    _pagination?: KeysetPaginationParams
  ): Promise<PaginatedResult<Contact>> {
    // In production: POST /crm_contacts/_search
    return {
      data: [],
      next_cursor: null,
      prev_cursor: null,
      has_more: false,
      approximate_total: 0
    };
  }
}

