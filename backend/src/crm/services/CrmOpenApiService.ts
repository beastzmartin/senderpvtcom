export class CrmOpenApiService {
  private static instance: CrmOpenApiService | null = null;

  public static getInstance(): CrmOpenApiService {
    if (!CrmOpenApiService.instance) {
      CrmOpenApiService.instance = new CrmOpenApiService();
    }
    return CrmOpenApiService.instance;
  }

  public getOpenApiSpec(): Record<string, any> {
    return {
      openapi: '3.1.0',
      info: {
        title: 'CRM V2 Enterprise Contacts & Automation API',
        version: '2.0.0',
        description: 'High-performance, multi-tenant CRM API engineered to scale to 100M+ contacts with sub-300ms p95 latency, dual PostgreSQL/SQLite support, granular RBAC, and AI intelligence.'
      },
      servers: [
        { url: '/api/crm', description: 'Internal CRM API Base' },
        { url: '/api/v1/crm', description: 'External API v2 Gateway' }
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'Workspace API Key generated from CRM Developer Settings'
          },
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        },
        headers: {
          IdempotencyKey: {
            description: 'IETF standard Idempotency-Key header to prevent duplicate execution of POST/PUT requests',
            schema: { type: 'string' }
          }
        }
      },
      paths: {
        '/contacts': {
          get: {
            summary: 'List contacts using keyset cursor pagination',
            parameters: [
              { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Base64 keyset cursor' },
              { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
              { name: 'search', in: 'query', schema: { type: 'string' } }
            ],
            responses: {
              200: { description: 'Paginated list of contacts with next_cursor' }
            }
          },
          post: {
            summary: 'Create a new contact',
            responses: {
              201: { description: 'Contact created successfully' }
            }
          }
        },
        '/search/nl': {
          post: {
            summary: 'Natural Language Search to Filter Group AST',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { query: { type: 'string', example: 'CEOs in Mumbai with valid email' } },
                    required: ['query']
                  }
                }
              }
            },
            responses: {
              200: { description: 'Parsed FilterGroup JSON' }
            }
          }
        },
        '/kanban': {
          get: {
            summary: 'Get Sales Pipeline Kanban board with multi-currency values',
            responses: { 200: { description: 'Kanban columns with converted USD sums' } }
          }
        },
        '/workflows': {
          get: { summary: 'List automation workflows' },
          post: { summary: 'Create visual automation workflow' }
        },
        '/webhooks': {
          get: { summary: 'List active webhooks with HMAC signatures' },
          post: { summary: 'Register webhook subscriber' }
        }
      }
    };
  }
}

