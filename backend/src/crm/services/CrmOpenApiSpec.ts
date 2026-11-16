export function getCrmOpenApiSpec(baseUrl: string = 'http://localhost:3000'): Record<string, any> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Enterprise Contacts CRM REST API',
      version: '1.0.0',
      description: 'High-performance CRM REST API for storing and managing 100M+ contacts, lists, segments, tags, imports, exports, and webhooks.'
    },
    servers: [
      {
        url: `${baseUrl}/v1`,
        description: 'Primary Production API Server'
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Hashed API key generated from the CRM Developer Dashboard (format: crm_live_... or crm_test_...)'
        }
      },
      schemas: {
        Contact: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            workspace_id: { type: 'string', format: 'uuid' },
            first_name: { type: 'string', nullable: true },
            last_name: { type: 'string', nullable: true },
            email: { type: 'string', format: 'email', nullable: true },
            phone: { type: 'string', nullable: true },
            phone_e164: { type: 'string', nullable: true },
            company_id: { type: 'string', format: 'uuid', nullable: true },
            company_name: { type: 'string', nullable: true },
            title: { type: 'string', nullable: true },
            country: { type: 'string', nullable: true },
            city: { type: 'string', nullable: true },
            source: { type: 'string', example: 'api' },
            lead_score: { type: 'integer', default: 0 },
            status: { type: 'string', enum: ['new', 'contacted', 'qualified', 'customer', 'unresponsive', 'unqualified'] },
            custom_fields: { type: 'object' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        CrmList: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            is_dynamic: { type: 'boolean' },
            cached_count: { type: 'integer' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    },
    security: [
      {
        ApiKeyAuth: []
      }
    ],
    paths: {
      '/contacts': {
        get: {
          summary: 'List Contacts with Keyset Pagination',
          description: 'High-performance cursor-based pagination (no offset). Returns contacts matching optional filters and query.',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Opaque cursor from previous response next_cursor' },
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'list_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'tag_id', in: 'query', schema: { type: 'string', format: 'uuid' } }
          ],
          responses: {
            '200': {
              description: 'Successful paginated response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { type: 'array', items: { $ref: '#/components/schemas/Contact' } },
                      pagination: {
                        type: 'object',
                        properties: {
                          next_cursor: { type: 'string', nullable: true },
                          has_more: { type: 'boolean' },
                          approximate_total: { type: 'integer' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        post: {
          summary: 'Create Contact',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: {
                    first_name: { type: 'string' },
                    last_name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                    title: { type: 'string' },
                    company_name: { type: 'string' },
                    custom_fields: { type: 'object' }
                  }
                }
              }
            }
          },
          responses: {
            '201': { description: 'Contact created successfully' }
          }
        }
      },
      '/contacts/bulk': {
        post: {
          summary: 'Bulk Upsert Contacts',
          description: 'Insert or update up to 1,000 contacts synchronously, or async for larger batches.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['contacts'],
                  properties: {
                    contacts: { type: 'array', items: { $ref: '#/components/schemas/Contact' } },
                    dedupe_rule: { type: 'string', enum: ['skip', 'update', 'merge'], default: 'update' }
                  }
                }
              }
            }
          },
          responses: {
            '200': { description: 'Synchronously processed' },
            '202': { description: 'Asynchronously queued' }
          }
        }
      },
      '/contacts/search': {
        post: {
          summary: 'Advanced Search & Complex Filter Builder',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    search: { type: 'string' },
                    limit: { type: 'integer', default: 50 },
                    cursor: { type: 'string' },
                    filter: {
                      type: 'object',
                      properties: {
                        combinator: { type: 'string', enum: ['AND', 'OR'] },
                        conditions: { type: 'array', items: { type: 'object' } }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': { description: 'Filtered results' }
          }
        }
      },
      '/contacts/dedupe-check': {
        post: {
          summary: 'Deduplication & Suppression Pre-Check',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: { type: 'string' },
                    phone: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            '200': { description: 'Duplicate & suppression state' }
          }
        }
      },
      '/lists': {
        get: { summary: 'List Static Lists & Dynamic Segments' },
        post: { summary: 'Create List or Dynamic Segment' }
      },
      '/tags': {
        get: { summary: 'List Tags' },
        post: { summary: 'Create Tag' }
      },
      '/exports': {
        post: { summary: 'Trigger Async Export (CSV, XLSX, JSON)' }
      },
      '/webhooks': {
        get: { summary: 'List Webhooks' },
        post: { summary: 'Register New Webhook with HMAC Secret' }
      },
      '/usage': {
        get: { summary: 'Get API Usage & Token Quota Metrics' }
      }
    }
  };
}

