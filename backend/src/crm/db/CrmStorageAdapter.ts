import {
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  Contact,
  Company,
  CrmList,
  CrmTag,
  CustomFieldDefinition,
  ActivityTimelineItem,
  CrmImport,
  CrmExport,
  CrmApiKey,
  CrmApiUsageLog,
  CrmWebhook,
  CrmWebhookDelivery,
  SuppressionRecord,
  AuditLogEntry,
  FilterGroup,
  KeysetPaginationParams,
  PaginatedResult,
  ImportDedupeRule
} from '../models/types.js';

export interface ContactListParams {
  filter?: FilterGroup;
  search?: string;
  listId?: string;
  tagId?: string;
  pagination?: KeysetPaginationParams;
  includeDeleted?: boolean;
}

export interface CrmStorageAdapter {
  isPostgres: boolean;
  initialize(): Promise<void>;

  // Workspaces
  getWorkspace(id: string): Promise<Workspace | null>;
  getWorkspaceBySlug(slug: string): Promise<Workspace | null>;
  getUserDefaultWorkspace(userId: string): Promise<Workspace>;
  getUserWorkspaces(userId: string): Promise<Workspace[]>;
  createWorkspace(userId: string, name: string, slug?: string): Promise<Workspace>;
  getWorkspaceMemberRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null>;
  addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember>;
  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]>;

  // Contacts
  listContacts(workspaceId: string, params?: ContactListParams): Promise<PaginatedResult<Contact>>;
  getContact(workspaceId: string, contactId: string): Promise<Contact | null>;
  createContact(workspaceId: string, data: Partial<Contact>): Promise<Contact>;
  bulkUpsertContacts(
    workspaceId: string,
    contacts: Partial<Contact>[],
    dedupeRule?: ImportDedupeRule
  ): Promise<{ inserted: number; updated: number; skipped: number; errors: any[] }>;
  updateContact(workspaceId: string, contactId: string, data: Partial<Contact>): Promise<Contact>;
  deleteContact(workspaceId: string, contactId: string, soft?: boolean): Promise<boolean>;
  restoreContact(workspaceId: string, contactId: string): Promise<boolean>;
  findDuplicates(workspaceId: string, limit?: number): Promise<Array<{ field: string; value: string; contact_ids: string[]; contacts: Contact[] }>>;
  mergeContacts(
    workspaceId: string,
    primaryId: string,
    duplicateId: string,
    fieldResolutions?: Record<string, any>
  ): Promise<Contact>;
  getApproximateContactCount(workspaceId: string, filter?: FilterGroup): Promise<number>;

  // Companies
  getCompany(workspaceId: string, companyId: string): Promise<Company | null>;
  listCompanies(workspaceId: string, search?: string, limit?: number): Promise<Company[]>;
  createCompany(workspaceId: string, data: Partial<Company>): Promise<Company>;
  updateCompany(workspaceId: string, companyId: string, data: Partial<Company>): Promise<Company>;
  findOrCreateCompanyByDomain(workspaceId: string, name: string, domain?: string): Promise<Company>;

  // Lists & Segments
  listLists(workspaceId: string): Promise<CrmList[]>;
  getList(workspaceId: string, listId: string): Promise<CrmList | null>;
  createList(workspaceId: string, name: string, description?: string, isDynamic?: boolean, filterDef?: FilterGroup): Promise<CrmList>;
  updateList(workspaceId: string, listId: string, data: Partial<CrmList>): Promise<CrmList>;
  deleteList(workspaceId: string, listId: string): Promise<boolean>;
  addContactsToList(workspaceId: string, listId: string, contactIds: string[]): Promise<number>;
  removeContactsFromList(workspaceId: string, listId: string, contactIds: string[]): Promise<number>;
  refreshListCount(workspaceId: string, listId: string): Promise<number>;

  // Tags
  listTags(workspaceId: string): Promise<CrmTag[]>;
  createTag(workspaceId: string, name: string, color?: string): Promise<CrmTag>;
  deleteTag(workspaceId: string, tagId: string): Promise<boolean>;
  tagContacts(workspaceId: string, tagId: string, contactIds: string[]): Promise<number>;
  untagContacts(workspaceId: string, tagId: string, contactIds: string[]): Promise<number>;

  // Custom Fields
  listCustomFields(workspaceId: string, entity?: 'contact' | 'company'): Promise<CustomFieldDefinition[]>;
  createCustomField(workspaceId: string, data: Partial<CustomFieldDefinition>): Promise<CustomFieldDefinition>;
  deleteCustomField(workspaceId: string, fieldId: string): Promise<boolean>;

  // Activities
  listActivities(workspaceId: string, contactId: string, limit?: number): Promise<ActivityTimelineItem[]>;
  logActivity(workspaceId: string, activity: Partial<ActivityTimelineItem>): Promise<ActivityTimelineItem>;

  // Imports
  createImport(workspaceId: string, data: Partial<CrmImport>): Promise<CrmImport>;
  getImport(workspaceId: string, importId: string): Promise<CrmImport | null>;
  updateImport(workspaceId: string, importId: string, updates: Partial<CrmImport>): Promise<CrmImport>;
  listImports(workspaceId: string, limit?: number): Promise<CrmImport[]>;

  // Exports
  createExport(workspaceId: string, data: Partial<CrmExport>): Promise<CrmExport>;
  getExport(workspaceId: string, exportId: string): Promise<CrmExport | null>;
  updateExport(workspaceId: string, exportId: string, updates: Partial<CrmExport>): Promise<CrmExport>;
  listExports(workspaceId: string, limit?: number): Promise<CrmExport[]>;

  // Suppression
  checkSuppressed(workspaceId: string, params: { email?: string; phone?: string; domain?: string }): Promise<boolean>;
  addSuppression(workspaceId: string, record: Partial<SuppressionRecord>): Promise<SuppressionRecord>;
  listSuppression(workspaceId: string, limit?: number): Promise<SuppressionRecord[]>;
  removeSuppression(workspaceId: string, id: string): Promise<boolean>;

  // API Keys
  createApiKey(workspaceId: string, data: Partial<CrmApiKey>): Promise<{ apiKey: CrmApiKey; rawSecretKey: string }>;
  getApiKeyByHash(keyHash: string): Promise<CrmApiKey | null>;
  updateApiKeyUsage(apiKeyId: string, incrementRequests?: number): Promise<void>;
  listApiKeys(workspaceId: string): Promise<CrmApiKey[]>;
  revokeApiKey(workspaceId: string, apiKeyId: string): Promise<boolean>;

  // API Usage Logs
  logApiUsage(log: Partial<CrmApiUsageLog>): Promise<void>;
  getApiUsageStats(workspaceId: string, days?: number): Promise<{ totalRequests: number; totalCreditsCharged: number; byEndpoint: Record<string, number> }>;

  // Webhooks
  listWebhooks(workspaceId: string): Promise<CrmWebhook[]>;
  getWebhook(workspaceId: string, id: string): Promise<CrmWebhook | null>;
  createWebhook(workspaceId: string, data: Partial<CrmWebhook>): Promise<CrmWebhook>;
  updateWebhook(workspaceId: string, id: string, data: Partial<CrmWebhook>): Promise<CrmWebhook>;
  deleteWebhook(workspaceId: string, id: string): Promise<boolean>;
  logWebhookDelivery(delivery: Partial<CrmWebhookDelivery>): Promise<void>;
  listWebhookDeliveries(workspaceId: string, webhookId: string, limit?: number): Promise<CrmWebhookDelivery[]>;

  // Audit Log
  logAudit(entry: Partial<AuditLogEntry>): Promise<void>;
  listAuditLogs(workspaceId: string, limit?: number): Promise<AuditLogEntry[]>;
}

