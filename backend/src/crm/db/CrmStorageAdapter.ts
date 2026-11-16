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
  ImportDedupeRule,
  CustomObjectDefinition,
  CustomObjectFieldDefinition,
  CustomObjectRecord,
  ObjectRelationshipDefinition,
  ObjectAssociation,
  FieldChangeHistory,
  CrmOutboxEvent,
  ContactMergeRecord,
  DuplicateCandidate,
  FieldVerificationResult,
  EnrichmentProviderConfig,
  DataHealthMetrics,
  CrmSavedView,
  CrmBulkJob,
  CrmAiUsageLog,
  CrmScoringRule,
  CrmWorkflow,
  CrmWorkflowRun,
  CrmWorkflowStepLog,
  CrmCompliancePolicy,
  CrmPipeline,
  CrmPipelineStage,
  CrmDeal,
  CrmTask,
  CrmPresenceSession,
  CrmRolePermission,
  CrmSensitiveField,
  CrmErasureCertificate,
  FunnelMetrics,
  AttributionSummary,
  CohortRow,
  CustomReportSpec,
  CustomReportResult,
  CrmBoard,
  CrmBoardColumn,
  CrmBoardCard,
  BoardStatsSummary,
  CrmTagGroup,
  CrmAutoTagRule,
  MergeTagsRequest,
  CrmSuperField,
  CrmPromotedFieldValue,
  CrmBillingPlan,
  CrmBillingAddon,
  CrmBillingCoupon,
  CrmSubscription,
  CrmUsageCounter,
  CrmInvoice,
  CrmBillingSettings,
  QuotaCheckResult,
  BillingResourceType
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
  archiveContact(workspaceId: string, contactId: string): Promise<boolean>;
  unarchiveContact(workspaceId: string, contactId: string): Promise<boolean>;
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

  // =========================================================================
  // CRM V2 PHASE 1: CUSTOM OBJECTS & RECORDS
  // =========================================================================
  listCustomObjects(workspaceId: string): Promise<CustomObjectDefinition[]>;
  getCustomObject(workspaceId: string, idOrSlug: string): Promise<CustomObjectDefinition | null>;
  createCustomObject(workspaceId: string, data: Partial<CustomObjectDefinition>): Promise<CustomObjectDefinition>;
  deleteCustomObject(workspaceId: string, id: string): Promise<boolean>;

  listCustomObjectFields(workspaceId: string, objectId: string): Promise<CustomObjectFieldDefinition[]>;
  createCustomObjectField(workspaceId: string, data: Partial<CustomObjectFieldDefinition>): Promise<CustomObjectFieldDefinition>;
  deleteCustomObjectField(workspaceId: string, fieldId: string): Promise<boolean>;

  listCustomObjectRecords(workspaceId: string, objectId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResult<CustomObjectRecord>>;
  getCustomObjectRecord(workspaceId: string, recordId: string): Promise<CustomObjectRecord | null>;
  createCustomObjectRecord(workspaceId: string, objectId: string, properties: Record<string, any>): Promise<CustomObjectRecord>;
  updateCustomObjectRecord(workspaceId: string, recordId: string, properties: Record<string, any>): Promise<CustomObjectRecord>;
  deleteCustomObjectRecord(workspaceId: string, recordId: string): Promise<boolean>;

  // =========================================================================
  // OBJECT RELATIONSHIPS & ASSOCIATIONS
  // =========================================================================
  createObjectRelationship(workspaceId: string, data: Partial<ObjectRelationshipDefinition>): Promise<ObjectRelationshipDefinition>;
  listObjectRelationships(workspaceId: string): Promise<ObjectRelationshipDefinition[]>;
  associateObjects(workspaceId: string, relationshipId: string, sourceEntityType: string, sourceEntityId: string, targetEntityType: string, targetEntityId: string, metadata?: Record<string, any>): Promise<ObjectAssociation>;
  listAssociatedObjects(workspaceId: string, entityType: string, entityId: string): Promise<ObjectAssociation[]>;
  removeAssociation(workspaceId: string, associationId: string): Promise<boolean>;

  // =========================================================================
  // FIELD-LEVEL DELTA HISTORY & RESTORE
  // =========================================================================
  logFieldChange(workspaceId: string, change: Partial<FieldChangeHistory>): Promise<FieldChangeHistory>;
  getFieldHistory(workspaceId: string, entityType: string, entityId: string): Promise<FieldChangeHistory[]>;
  restoreFieldHistory(workspaceId: string, historyId: string): Promise<boolean>;

  // =========================================================================
  // TRANSACTIONAL EVENT OUTBOX
  // =========================================================================
  emitOutboxEvent(workspaceId: string, eventType: string, aggregateType: string, aggregateId: string, payload: Record<string, any>): Promise<CrmOutboxEvent>;
  fetchPendingOutboxEvents(limit?: number): Promise<CrmOutboxEvent[]>;
  markOutboxEventPublished(eventId: string): Promise<boolean>;
  markOutboxEventFailed(eventId: string, errorMessage: string): Promise<boolean>;

  // =========================================================================
  // CRM V2 PHASE 2: IDENTITY RESOLUTION, GOLDEN RECORD & UNMERGE
  // =========================================================================
  saveDuplicateCandidate(workspaceId: string, candidate: Partial<DuplicateCandidate>): Promise<DuplicateCandidate>;
  listDuplicateCandidates(workspaceId: string, status?: string, limit?: number): Promise<DuplicateCandidate[]>;
  updateDuplicateCandidateStatus(workspaceId: string, id: string, status: string, reviewedBy?: string): Promise<boolean>;
  recordMerge(workspaceId: string, primaryId: string, duplicateId: string, snapshot: any, rules: any): Promise<ContactMergeRecord>;
  unmergeContacts(workspaceId: string, mergeId: string): Promise<boolean>;
  listMerges(workspaceId: string, limit?: number): Promise<ContactMergeRecord[]>;

  // =========================================================================
  // CRM V2 PHASE 2: VERIFICATION & LOGS
  // =========================================================================
  logVerification(workspaceId: string, result: Partial<FieldVerificationResult>): Promise<FieldVerificationResult>;
  listVerifications(workspaceId: string, contactId: string): Promise<FieldVerificationResult[]>;

  // =========================================================================
  // CRM V2 PHASE 2: ENRICHMENT WATERFALL & CACHING
  // =========================================================================
  listEnrichmentProviders(workspaceId: string): Promise<EnrichmentProviderConfig[]>;
  saveEnrichmentProvider(workspaceId: string, config: Partial<EnrichmentProviderConfig>): Promise<EnrichmentProviderConfig>;
  getEnrichmentCache(lookupKey: string): Promise<any | null>;
  setEnrichmentCache(lookupKey: string, providerName: string, data: any, ttlSeconds?: number): Promise<void>;

  // =========================================================================
  // CRM V2 PHASE 2: DATA HEALTH METRICS
  // =========================================================================
  getDataHealthMetrics(workspaceId: string): Promise<DataHealthMetrics>;

  // =========================================================================
  // CRM V2 PHASE 3: SAVED VIEWS & DYNAMIC SEGMENTS
  // =========================================================================
  listSavedViews(workspaceId: string): Promise<CrmSavedView[]>;
  getSavedView(workspaceId: string, id: string): Promise<CrmSavedView | null>;
  createSavedView(workspaceId: string, view: Partial<CrmSavedView>): Promise<CrmSavedView>;
  updateSavedView(workspaceId: string, id: string, updates: Partial<CrmSavedView>): Promise<CrmSavedView>;
  deleteSavedView(workspaceId: string, id: string): Promise<boolean>;

  // =========================================================================
  // CRM V2 PHASE 3: BULK ACTIONS ENGINE
  // =========================================================================
  createBulkJob(workspaceId: string, job: Partial<CrmBulkJob>): Promise<CrmBulkJob>;
  getBulkJob(workspaceId: string, jobId: string): Promise<CrmBulkJob | null>;
  updateBulkJobProgress(jobId: string, progress: Partial<CrmBulkJob>): Promise<void>;
  listBulkJobs(workspaceId: string, limit?: number): Promise<CrmBulkJob[]>;

  // =========================================================================
  // CRM V2 PHASE 4: AI LAYER & SMART ENGINES
  // =========================================================================
  logAiUsage(workspaceId: string, log: Partial<CrmAiUsageLog>): Promise<CrmAiUsageLog>;
  getAiUsageSummary(workspaceId: string, days?: number): Promise<{ totalCredits: number; totalTokens: number; countByAction: Record<string, number> }>;
  listScoringRules(workspaceId: string): Promise<CrmScoringRule[]>;
  saveScoringRule(workspaceId: string, rule: Partial<CrmScoringRule>): Promise<CrmScoringRule>;
  deleteScoringRule(workspaceId: string, id: string): Promise<boolean>;

  // =========================================================================
  // CRM V2 PHASE 5: WORKFLOW AUTOMATIONS & RUNS
  // =========================================================================
  listWorkflows(workspaceId: string): Promise<CrmWorkflow[]>;
  getWorkflow(workspaceId: string, id: string): Promise<CrmWorkflow | null>;
  createWorkflow(workspaceId: string, data: Partial<CrmWorkflow>): Promise<CrmWorkflow>;
  updateWorkflow(workspaceId: string, id: string, updates: Partial<CrmWorkflow>): Promise<CrmWorkflow>;
  deleteWorkflow(workspaceId: string, id: string): Promise<boolean>;

  createWorkflowRun(workspaceId: string, data: Partial<CrmWorkflowRun>): Promise<CrmWorkflowRun>;
  getWorkflowRun(workspaceId: string, runId: string): Promise<CrmWorkflowRun | null>;
  updateWorkflowRun(runId: string, updates: Partial<CrmWorkflowRun>): Promise<void>;
  listPendingWorkflowRuns(limit?: number): Promise<CrmWorkflowRun[]>;
  listWorkflowRuns(workspaceId: string, workflowId?: string, limit?: number): Promise<CrmWorkflowRun[]>;

  logWorkflowStepExecution(log: Partial<CrmWorkflowStepLog>): Promise<CrmWorkflowStepLog>;
  listWorkflowStepLogs(runId: string): Promise<CrmWorkflowStepLog[]>;

  getCompliancePolicy(workspaceId: string): Promise<CrmCompliancePolicy>;
  saveCompliancePolicy(workspaceId: string, policy: Partial<CrmCompliancePolicy>): Promise<CrmCompliancePolicy>;

  // =========================================================================
  // CRM V2 PHASE 6: SALES PIPELINES, DEALS, TASKS & PRESENCE
  // =========================================================================
  listPipelines(workspaceId: string): Promise<CrmPipeline[]>;
  getPipeline(workspaceId: string, id: string): Promise<CrmPipeline | null>;
  createPipeline(workspaceId: string, name: string, isDefault?: boolean): Promise<CrmPipeline>;
  listPipelineStages(workspaceId: string, pipelineId: string): Promise<CrmPipelineStage[]>;
  createPipelineStage(workspaceId: string, stage: Partial<CrmPipelineStage>): Promise<CrmPipelineStage>;
  updatePipelineStage(workspaceId: string, id: string, stage: Partial<CrmPipelineStage>): Promise<CrmPipelineStage>;

  listDeals(workspaceId: string, filter?: { pipelineId?: string; stageId?: string; contactId?: string; status?: string }): Promise<CrmDeal[]>;
  getDeal(workspaceId: string, id: string): Promise<CrmDeal | null>;
  createDeal(workspaceId: string, deal: Partial<CrmDeal>): Promise<CrmDeal>;
  updateDeal(workspaceId: string, id: string, updates: Partial<CrmDeal>): Promise<CrmDeal>;
  deleteDeal(workspaceId: string, id: string): Promise<boolean>;

  listTasks(workspaceId: string, filter?: { contactId?: string; dealId?: string; status?: string; assignedTo?: string }): Promise<CrmTask[]>;
  createTask(workspaceId: string, task: Partial<CrmTask>): Promise<CrmTask>;
  updateTask(workspaceId: string, id: string, updates: Partial<CrmTask>): Promise<CrmTask>;
  deleteTask(workspaceId: string, id: string): Promise<boolean>;

  upsertPresence(session: Partial<CrmPresenceSession>): Promise<void>;
  getPresentUsers(workspaceId: string, entityType: 'contact' | 'deal', entityId: string): Promise<CrmPresenceSession[]>;
  clearPresence(workspaceId: string, entityType: string, entityId: string, userId: string): Promise<void>;

  // =========================================================================
  // CRM V2 PHASE 7: RBAC, PRIVACY & GDPR ERASURE
  // =========================================================================
  listRolePermissions(workspaceId: string): Promise<CrmRolePermission[]>;
  getRolePermission(workspaceId: string, role: string): Promise<CrmRolePermission | null>;
  saveRolePermission(workspaceId: string, perm: Partial<CrmRolePermission>): Promise<CrmRolePermission>;
  listSensitiveFields(workspaceId: string): Promise<CrmSensitiveField[]>;
  addSensitiveField(workspaceId: string, field: Partial<CrmSensitiveField>): Promise<CrmSensitiveField>;
  removeSensitiveField(workspaceId: string, id: string): Promise<boolean>;
  saveErasureCertificate(cert: Partial<CrmErasureCertificate>): Promise<CrmErasureCertificate>;
  getErasureCertificate(id: string): Promise<CrmErasureCertificate | null>;
  hardDeleteContact(workspaceId: string, contactId: string): Promise<number>;

  // =========================================================================
  // CRM V2 PHASE 9: ANALYTICS, FUNNELS, ATTRIBUTION & COHORTS
  // =========================================================================
  getFunnelMetrics(workspaceId: string, pipelineId?: string): Promise<FunnelMetrics>;
  getAttributionMetrics(workspaceId: string): Promise<AttributionSummary>;
  getCohortRetention(workspaceId: string, months?: number): Promise<CohortRow[]>;
  runCustomReport(workspaceId: string, spec: CustomReportSpec): Promise<CustomReportResult>;

  // =========================================================================
  // CRM V2: BOARDS (KANBAN)
  // =========================================================================
  listBoards(workspaceId: string, includeArchived?: boolean): Promise<CrmBoard[]>;
  getBoard(workspaceId: string, boardId: string): Promise<CrmBoard | null>;
  createBoard(workspaceId: string, data: Partial<CrmBoard>): Promise<CrmBoard>;
  updateBoard(workspaceId: string, boardId: string, updates: Partial<CrmBoard>): Promise<CrmBoard>;
  deleteBoard(workspaceId: string, boardId: string): Promise<boolean>;
  duplicateBoard(workspaceId: string, boardId: string, newName?: string): Promise<CrmBoard>;
  listBoardColumns(workspaceId: string, boardId: string): Promise<CrmBoardColumn[]>;
  createBoardColumn(workspaceId: string, data: Partial<CrmBoardColumn>): Promise<CrmBoardColumn>;
  updateBoardColumn(workspaceId: string, columnId: string, updates: Partial<CrmBoardColumn>): Promise<CrmBoardColumn>;
  deleteBoardColumn(workspaceId: string, columnId: string, fallbackColumnId?: string): Promise<boolean>;
  reorderBoardColumns(workspaceId: string, boardId: string, columnIds: string[]): Promise<void>;
  listBoardCards(
    workspaceId: string,
    boardId: string,
    columnId?: string,
    cursor?: string,
    limit?: number
  ): Promise<{ cards: CrmBoardCard[]; next_cursor: string | null; total: number }>;
  moveBoardCard(workspaceId: string, cardId: string, targetColumnId: string, newRank: string): Promise<CrmBoardCard>;
  addCardToBoard(workspaceId: string, data: Partial<CrmBoardCard>): Promise<CrmBoardCard>;
  removeCardFromBoard(workspaceId: string, boardId: string, entityType: string, entityId: string): Promise<boolean>;
  getBoardStats(workspaceId: string, boardId: string): Promise<BoardStatsSummary>;

  // =========================================================================
  // CRM V2: TAGS EXTENDED
  // =========================================================================
  listTagsWithCounts(workspaceId: string): Promise<Array<CrmTag & { usage_count: number }>>;
  mergeTags(workspaceId: string, req: MergeTagsRequest): Promise<{ affected_contacts: number }>;
  listTagGroups(workspaceId: string): Promise<CrmTagGroup[]>;
  saveTagGroup(workspaceId: string, group: Partial<CrmTagGroup>): Promise<CrmTagGroup>;
  listAutoTagRules(workspaceId: string): Promise<CrmAutoTagRule[]>;
  saveAutoTagRule(workspaceId: string, rule: Partial<CrmAutoTagRule>): Promise<CrmAutoTagRule>;

  // =========================================================================
  // CRM V2: SUPER FIELDS
  // =========================================================================
  listSuperFields(workspaceId: string, entityType?: string): Promise<CrmSuperField[]>;
  getSuperField(workspaceId: string, id: string): Promise<CrmSuperField | null>;
  createSuperField(workspaceId: string, data: Partial<CrmSuperField>): Promise<CrmSuperField>;
  updateSuperField(workspaceId: string, id: string, updates: Partial<CrmSuperField>): Promise<CrmSuperField>;
  deleteSuperField(workspaceId: string, id: string): Promise<boolean>;
  promoteSuperField(workspaceId: string, id: string, isPromoted: boolean): Promise<CrmSuperField>;
  upsertPromotedFieldValue(entry: Partial<CrmPromotedFieldValue>): Promise<void>;
  getPromotedFieldValues(workspaceId: string, entityType: string, entityId: string): Promise<Record<string, any>>;

  // =========================================================================
  // CRM V2: PLAN-BASED BILLING & HARD ENTITLEMENTS (WALLET-ONLY)
  // =========================================================================
  listBillingPlans(includeInactive?: boolean): Promise<CrmBillingPlan[]>;
  getBillingPlan(planIdOrSlug: string): Promise<CrmBillingPlan | null>;
  saveBillingPlan(plan: Partial<CrmBillingPlan>): Promise<CrmBillingPlan>;
  listBillingAddons(): Promise<CrmBillingAddon[]>;
  saveBillingAddon(addon: Partial<CrmBillingAddon>): Promise<CrmBillingAddon>;
  getBillingCoupon(code: string): Promise<CrmBillingCoupon | null>;
  saveBillingCoupon(coupon: Partial<CrmBillingCoupon>): Promise<CrmBillingCoupon>;
  getActiveSubscription(workspaceId: string): Promise<CrmSubscription | null>;
  saveSubscription(sub: Partial<CrmSubscription>): Promise<CrmSubscription>;
  consumeQuotaAtomic(
    workspaceId: string,
    resourceType: BillingResourceType | string,
    incrementBy: number,
    limitFallback?: number
  ): Promise<{ success: boolean; used_count: number; quota_limit: number }>;
  getUsageCounters(workspaceId: string): Promise<CrmUsageCounter[]>;
  reconcileUsageCounters(workspaceId: string): Promise<Record<string, number>>;
  createInvoice(invoice: Partial<CrmInvoice>): Promise<CrmInvoice>;
  listInvoices(workspaceId: string): Promise<CrmInvoice[]>;
  getInvoice(invoiceIdOrNumber: string): Promise<CrmInvoice | null>;
  getBillingSettings(): Promise<CrmBillingSettings>;
  updateBillingSettings(settings: Partial<CrmBillingSettings>): Promise<CrmBillingSettings>;
}

