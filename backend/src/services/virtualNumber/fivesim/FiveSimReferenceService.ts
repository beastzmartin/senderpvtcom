import { FiveSimCatalogService } from './FiveSimCatalogService.js';

export interface FiveSimSpecialCountryMapping {
  slug: string;
  officialName: string;
  iso: string;
  prefix: string;
  flag: string;
  aliases: string[];
}

export interface FiveSimSpecialProductMapping {
  slug: string;
  name: string;
  category: 'messaging' | 'social' | 'ai' | 'ecommerce' | 'delivery' | 'travel' | 'finance' | 'entertainment' | 'hosting' | 'other';
  aliases: string[];
  popular?: boolean;
}

export class FiveSimReferenceService {
  private static instance: FiveSimReferenceService | null = null;
  private catalogService: FiveSimCatalogService;

  // Part 9.2: Country Slugs with special API names
  public static readonly SPECIAL_COUNTRY_MAPPINGS: FiveSimSpecialCountryMapping[] = [
    { slug: 'bhutane', officialName: 'Bhutan', iso: 'bt', prefix: '+975', flag: '🇧🇹', aliases: ['bhutan'] },
    { slug: 'bih', officialName: 'Bosnia and Herzegovina', iso: 'ba', prefix: '+387', flag: '🇧🇦', aliases: ['bosnia', 'bosnia and herzegovina', 'herzegovina'] },
    { slug: 'czech', officialName: 'Czech Republic (Czechia)', iso: 'cz', prefix: '+420', flag: '🇨🇿', aliases: ['czechia', 'czech republic'] },
    { slug: 'tit', officialName: 'Trinidad and Tobago', iso: 'tt', prefix: '+1868', flag: '🇹🇹', aliases: ['trinidad', 'tobago', 'trinidad and tobago'] },
    { slug: 'dominicana', officialName: 'Dominican Republic', iso: 'do', prefix: '+1809', flag: '🇩🇴', aliases: ['dominican republic', 'dominican'] },
    { slug: 'salvador', officialName: 'El Salvador', iso: 'sv', prefix: '+503', flag: '🇸🇻', aliases: ['el salvador'] },
    { slug: 'england', officialName: 'United Kingdom / England', iso: 'gb', prefix: '+44', flag: '🇬🇧', aliases: ['uk', 'united kingdom', 'great britain', 'britain', 'england'] },
    { slug: 'usa', officialName: 'United States of America', iso: 'us', prefix: '+1', flag: '🇺🇸', aliases: ['united states', 'america', 'us'] },
    { slug: 'russia', officialName: 'Russia', iso: 'ru', prefix: '+7', flag: '🇷🇺', aliases: ['russian federation'] },
    { slug: 'india', officialName: 'India', iso: 'in', prefix: '+91', flag: '🇮🇳', aliases: ['bharat'] },
    { slug: 'indonesia', officialName: 'Indonesia', iso: 'id', prefix: '+62', flag: '🇮🇩', aliases: [] },
    { slug: 'brazil', officialName: 'Brazil', iso: 'br', prefix: '+55', flag: '🇧🇷', aliases: ['brasil'] },
    { slug: 'germany', officialName: 'Germany', iso: 'de', prefix: '+49', flag: '🇩🇪', aliases: ['deutschland'] },
    { slug: 'france', officialName: 'France', iso: 'fr', prefix: '+33', flag: '🇫🇷', aliases: [] },
    { slug: 'netherlands', officialName: 'Netherlands', iso: 'nl', prefix: '+31', flag: '🇳🇱', aliases: ['holland'] },
    { slug: 'vietnam', officialName: 'Vietnam', iso: 'vn', prefix: '+84', flag: '🇻🇳', aliases: [] },
    { slug: 'poland', officialName: 'Poland', iso: 'pl', prefix: '+48', flag: '🇵🇱', aliases: ['polska'] },
    { slug: 'philippines', officialName: 'Philippines', iso: 'ph', prefix: '+63', flag: '🇵🇭', aliases: [] },
    { slug: 'nigeria', officialName: 'Nigeria', iso: 'ng', prefix: '+234', flag: '🇳🇬', aliases: [] },
    { slug: 'canada', officialName: 'Canada', iso: 'ca', prefix: '+1', flag: '🇨🇦', aliases: [] }
  ];

  // Part 9.4: Special products mappings
  public static readonly SPECIAL_PRODUCT_MAPPINGS: FiveSimSpecialProductMapping[] = [
    // Messaging
    { slug: 'whatsapp', name: 'WhatsApp', category: 'messaging', aliases: ['wa', 'whatsapp business', 'wa business'], popular: true },
    { slug: 'telegram', name: 'Telegram', category: 'messaging', aliases: ['tg'], popular: true },
    { slug: 'signal', name: 'Signal Messenger', category: 'messaging', aliases: [] },
    { slug: 'viber', name: 'Viber', category: 'messaging', aliases: [] },
    { slug: 'wechat', name: 'WeChat', category: 'messaging', aliases: ['weixin'] },
    { slug: 'discord', name: 'Discord', category: 'messaging', aliases: [] },

    // Social
    { slug: 'facebook', name: 'Facebook', category: 'social', aliases: ['fb', 'meta'], popular: true },
    { slug: 'instagram', name: 'Instagram / Threads', category: 'social', aliases: ['ig', 'threads'], popular: true },
    { slug: 'twitter', name: 'Twitter / X', category: 'social', aliases: ['x', 'twitter'], popular: true },
    { slug: 'tiktok', name: 'TikTok / Douyin', category: 'social', aliases: ['douyin'], popular: true },
    { slug: 'snapchat', name: 'Snapchat', category: 'social', aliases: ['snap'] },
    { slug: 'linkedin', name: 'LinkedIn', category: 'social', aliases: [] },
    { slug: 'tinder', name: 'Tinder', category: 'social', aliases: [] },

    // AI & Technology
    { slug: 'openai', name: 'OpenAI / ChatGPT', category: 'ai', aliases: ['chatgpt', 'dall-e'], popular: true },
    { slug: 'claudeai', name: 'Claude AI / Anthropic', category: 'ai', aliases: ['claude', 'anthropic'], popular: true },
    { slug: 'google', name: 'Google / Gmail / YouTube', category: 'ai', aliases: ['gmail', 'youtube'], popular: true },
    { slug: 'microsoft', name: 'Microsoft / Outlook', category: 'ai', aliases: ['outlook', 'hotmail', 'azure', 'xbox'] },
    { slug: 'apple', name: 'Apple ID / iCloud', category: 'ai', aliases: ['icloud', 'itunes'] },

    // Special Service Aliases from Part 9.4 Documentation
    { slug: 'grofers', name: 'Blinkit', category: 'delivery', aliases: ['blinkit', 'grofers'] },
    { slug: 'alipay', name: 'Alibaba / Alipay / Taobao / 1688', category: 'ecommerce', aliases: ['alibaba', 'taobao', '1688', 'alipay'] },
    { slug: 'galaxy', name: 'Samsung Galaxy', category: 'other', aliases: ['samsung', 'samsung galaxy'] },
    { slug: 'gojek', name: 'Gojek / Gopay', category: 'delivery', aliases: ['gopay', 'gojek'] },
    { slug: 'flypgs', name: 'Pegasus Airlines', category: 'travel', aliases: ['pegasus', 'pegasus airlines'] },
    { slug: 'indriver', name: 'inDrive', category: 'travel', aliases: ['indrive', 'indriver'] },
    { slug: '1mg', name: 'Tata 1mg', category: 'ecommerce', aliases: ['tata 1mg', '1mg'] },
    { slug: '1kkirana', name: '1K Kirana', category: 'ecommerce', aliases: ['1k kirana'] },
    { slug: 'blockchain', name: 'Dropped-Call Verification (Blockchain)', category: 'finance', aliases: ['dropped-call', 'blockchain'] },

    // E-Commerce & Payments
    { slug: 'amazon', name: 'Amazon', category: 'ecommerce', aliases: ['amazon prime'], popular: true },
    { slug: 'flipkart', name: 'Flipkart', category: 'ecommerce', aliases: [] },
    { slug: 'meesho', name: 'Meesho', category: 'ecommerce', aliases: [] },
    { slug: 'paypal', name: 'PayPal', category: 'finance', aliases: [] },
    { slug: 'paytm', name: 'Paytm', category: 'finance', aliases: [] },
    { slug: 'uber', name: 'Uber / Uber Eats', category: 'travel', aliases: [] },
    { slug: 'swiggy', name: 'Swiggy', category: 'delivery', aliases: [] },
    { slug: 'zomato', name: 'Zomato', category: 'delivery', aliases: [] },
    { slug: 'netflix', name: 'Netflix', category: 'entertainment', aliases: [] },
    { slug: 'steam', name: 'Steam', category: 'entertainment', aliases: [] },
    { slug: 'dream11', name: 'Dream11', category: 'entertainment', aliases: [] },

    // Special Product Slugs
    { slug: 'forwarding', name: 'Call Forwarding Line', category: 'hosting', aliases: ['forwarding'] },
    { slug: 'reuse', name: 'Number Re-buy / Reuse', category: 'hosting', aliases: ['reuse'] },
    { slug: 'other', name: 'Any Other Unlisted Service', category: 'other', aliases: ['any other', 'unlisted'] },

    // Hosting rentals from 9.4
    { slug: '3hours', name: 'Hosting (3 Hours Rental)', category: 'hosting', aliases: ['3 hours', '3h'] },
    { slug: '1day', name: 'Hosting (1 Day Rental)', category: 'hosting', aliases: ['1 day', '24h'] },
    { slug: '10days', name: 'Hosting (10 Days Rental)', category: 'hosting', aliases: ['10 days'] },
    { slug: '1month', name: 'Hosting (1 Month Rental)', category: 'hosting', aliases: ['1 month', '30 days'] }
  ];

  private constructor() {
    this.catalogService = new FiveSimCatalogService();
  }

  public static getInstance(): FiveSimReferenceService {
    if (!FiveSimReferenceService.instance) {
      FiveSimReferenceService.instance = new FiveSimReferenceService();
    }
    return FiveSimReferenceService.instance;
  }

  /**
   * Resolves a country user search term to the official 5SIM API slug
   * e.g. "Bhutan" -> "bhutane", "Czech Republic" -> "czech", "UK" -> "england"
   */
  public resolveCountrySlug(input: string): string {
    if (!input) return 'england';
    const clean = input.trim().toLowerCase();

    for (const c of FiveSimReferenceService.SPECIAL_COUNTRY_MAPPINGS) {
      if (c.slug === clean || c.aliases.includes(clean) || c.officialName.toLowerCase() === clean) {
        return c.slug;
      }
    }

    return clean;
  }

  /**
   * Resolves a product user search term to official 5SIM API slug
   * e.g. "Blinkit" -> "grofers", "Alibaba" -> "alipay", "ChatGPT" -> "openai"
   */
  public resolveProductSlug(input: string): string {
    if (!input) return 'whatsapp';
    const clean = input.trim().toLowerCase();

    for (const p of FiveSimReferenceService.SPECIAL_PRODUCT_MAPPINGS) {
      if (p.slug === clean || p.aliases.includes(clean) || p.name.toLowerCase() === clean) {
        return p.slug;
      }
    }

    return clean;
  }

  /**
   * Returns complete catalog of products grouped by category
   */
  public getCatalogProducts(filter?: { category?: string; search?: string }): FiveSimSpecialProductMapping[] {
    let list = [...FiveSimReferenceService.SPECIAL_PRODUCT_MAPPINGS];

    if (filter?.category && filter.category !== 'all') {
      list = list.filter((p) => p.category === filter.category);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase().trim();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.aliases.some((a) => a.toLowerCase().includes(q))
      );
    }

    return list;
  }

  /**
   * Returns complete catalog of reference countries with flags and prefix
   */
  public getReferenceCountries(): FiveSimSpecialCountryMapping[] {
    return FiveSimReferenceService.SPECIAL_COUNTRY_MAPPINGS;
  }

  /**
   * Inspects carrier name to determine if it is a physical carrier or virtual operator line
   */
  public static classifyOperator(operatorName: string): { type: 'physical' | 'virtual'; name: string } {
    const clean = (operatorName || '').toLowerCase().trim();
    if (clean.startsWith('virtual')) {
      return { type: 'virtual', name: clean };
    }
    return { type: 'physical', name: clean };
  }
}
