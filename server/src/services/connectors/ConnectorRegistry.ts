import { IExtractionConnector } from './types.js';
import { GoogleMapsConnector } from './GoogleMapsConnector.js';
import { WebsiteLeadConnector } from './WebsiteLeadConnector.js';
import { GenericLeadConnector } from './GenericConnector.js';

export class ConnectorRegistry {
  private static instance: ConnectorRegistry | null = null;
  private connectors: Map<string, IExtractionConnector> = new Map();

  private constructor() {
    this.registerDefaults();
  }

  public static getInstance(): ConnectorRegistry {
    if (!ConnectorRegistry.instance) {
      ConnectorRegistry.instance = new ConnectorRegistry();
    }
    return ConnectorRegistry.instance;
  }

  private registerDefaults(): void {
    // 1. Google Maps
    this.register(new GoogleMapsConnector());

    // 2. Website Extractor
    this.register(new WebsiteLeadConnector());

    // 3. Business Directory
    this.register(
      new GenericLeadConnector(
        'business_directory',
        'Business Directory Extractor',
        'Directories',
        'Extract business profiles and contact information from major public B2B directories and yellow pages.',
        ['business_name', 'category', 'phone', 'email', 'website', 'address', 'city']
      )
    );

    // 4. Company Contact
    this.register(
      new GenericLeadConnector(
        'company_contact',
        'Company Website Contact Extractor',
        'Web Scanner',
        'Crawl public Contact and About Us pages to extract authorized corporate emails, helplines, and addresses.',
        ['business_name', 'email', 'phone', 'contact_page_url', 'address']
      )
    );

    // 5. Email Discovery
    this.register(
      new GenericLeadConnector(
        'email_discovery',
        'Public Business Email Discovery',
        'Email Finder',
        'Discover verified company email formats and public contact addresses using domain heuristics.',
        ['business_name', 'email', 'domain', 'confidence_score']
      )
    );

    // 6. Phone Discovery
    this.register(
      new GenericLeadConnector(
        'phone_discovery',
        'Public Business Phone Discovery',
        'Phone Finder',
        'Identify direct business phone numbers and WhatsApp-ready customer care contacts with country code parsing.',
        ['business_name', 'phone', 'country_code', 'phone_type', 'whatsapp_ready']
      )
    );

    // 7. LinkedIn Research
    this.register(
      new GenericLeadConnector(
        'linkedin_research',
        'LinkedIn Company Research',
        'B2B Research',
        'Gather public business profile data, employee size, industry classifications, and corporate websites.',
        ['business_name', 'industry', 'website', 'company_size', 'headquarters', 'specialties']
      )
    );

    // 8. E-commerce Store Lead Discovery
    this.register(
      new GenericLeadConnector(
        'ecommerce_discovery',
        'E-commerce Store Lead Discovery',
        'E-commerce',
        'Find online brands, Shopify/WooCommerce stores, customer support emails, and social commerce handles.',
        ['business_name', 'website', 'platform', 'email', 'phone', 'social_profiles']
      )
    );

    // 9. Real Estate Business Lead Finder
    this.register(
      new GenericLeadConnector(
        'real_estate_finder',
        'Real Estate Business Lead Finder',
        'Industry',
        'Prospect real estate agencies, property consultants, builders, and mortgage brokers.',
        ['business_name', 'category', 'phone', 'email', 'city', 'state', 'listing_url']
      )
    );

    // 10. Agency Lead Finder
    this.register(
      new GenericLeadConnector(
        'agency_finder',
        'Agency Lead Finder',
        'Industry',
        'Target digital marketing agencies, software development firms, SEO agencies, and creative studios.',
        ['business_name', 'industry', 'email', 'phone', 'website', 'address']
      )
    );

    // 11. Restaurant & Hotel Lead Finder
    this.register(
      new GenericLeadConnector(
        'restaurant_hotel_finder',
        'Restaurant & Hotel Lead Finder',
        'Hospitality',
        'Extract restaurants, cafes, hotels, resorts, and catering businesses for local outreach.',
        ['business_name', 'category', 'phone', 'address', 'city', 'rating', 'reviews_count']
      )
    );

    // 12. Professional Services Lead Finder
    this.register(
      new GenericLeadConnector(
        'professional_services',
        'Professional Services Lead Finder',
        'Services',
        'Discover legal practitioners, chartered accountants, financial advisors, and medical clinics.',
        ['business_name', 'category', 'phone', 'email', 'address', 'city', 'rating']
      )
    );
  }

  public register(connector: IExtractionConnector): void {
    this.connectors.set(connector.id, connector);
  }

  public get(id: string): IExtractionConnector | undefined {
    return this.connectors.get(id);
  }

  public getAll(): IExtractionConnector[] {
    return Array.from(this.connectors.values());
  }
}

