import React from 'react';

export interface ServiceDisplayMeta {
  slug: string;
  name: string;
  displayName: string;
  category: 'messaging' | 'social' | 'ai' | 'finance' | 'shopping' | 'dating' | 'entertainment' | 'other';
  gradient: string;
  badge?: string;
  iconChar?: string;
}

export interface CountryDisplayMeta {
  slug: string;
  name: string;
  displayName: string;
  prefix: string;
  dialCode: string;
  flag: string;
  iso: string;
}

// Map 2-letter ISO to Flag emoji
export function getCountryFlag(iso?: string | null): string {
  if (!iso || typeof iso !== 'string' || iso.length !== 2) return '🌐';
  const codePoints = iso
    .toUpperCase()
    .split('')
    .map((c) => 127397 + c.charCodeAt(0));
  try {
    return String.fromCodePoint(...codePoints);
  } catch {
    return '🌐';
  }
}

// Clean dial code (e.g. "++44" -> "+44")
export function formatDialCode(prefix?: string): string {
  if (!prefix) return '';
  const digits = prefix.replace(/[^\d]/g, '');
  return digits ? `+${digits}` : prefix;
}

// Extract ISO from 5sim country object or slug
export function resolveCountryIso(slug: string, isoObj?: string | Record<string, number> | any): string {
  if (typeof isoObj === 'string' && isoObj.trim().length > 0) {
    return isoObj.trim().toLowerCase();
  }
  if (isoObj && typeof isoObj === 'object') {
    const keys = Object.keys(isoObj);
    if (keys.length > 0 && keys[0].length === 2) {
      return keys[0].toLowerCase();
    }
  }

  const slugMap: Record<string, string> = {
    england: 'gb',
    usa: 'us',
    russia: 'ru',
    india: 'in',
    canada: 'ca',
    germany: 'de',
    france: 'fr',
    netherlands: 'nl',
    brazil: 'br',
    indonesia: 'id',
    philippines: 'ph',
    nigeria: 'ng',
    australia: 'au',
    pakistan: 'pk',
    bangladesh: 'bd',
    spain: 'es',
    italy: 'it',
    turkey: 'tr',
    poland: 'pl',
    ukraine: 'ua',
    vietnam: 'vn',
    thailand: 'th',
    malaysia: 'my',
    egypt: 'eg',
    southafrica: 'za',
    mexico: 'mx',
    argentina: 'ar',
    colombia: 'co',
    sweden: 'se',
    norway: 'no',
    finland: 'fi',
    denmark: 'dk',
    belgium: 'be',
    austria: 'at',
    switzerland: 'ch',
    portugal: 'pt',
    ireland: 'ie',
    greece: 'gr',
    israel: 'il',
    uae: 'ae',
    saudiarabia: 'sa',
    singapore: 'sg',
    japan: 'jp',
    korea: 'kr',
    hongkong: 'hk',
    taiwan: 'tw',
    kenya: 'ke',
    ghana: 'gh',
    morocco: 'ma',
    romania: 'ro',
    czech: 'cz',
    hungary: 'hu',
    bulgaria: 'bg',
    serbia: 'rs',
    croatia: 'hr'
  };

  return slugMap[slug.toLowerCase()] || slug.substring(0, 2).toLowerCase();
}

// Clean formatted country display names
export function resolveCountryDisplayName(slug: string, name?: string): string {
  const customNames: Record<string, string> = {
    england: 'United Kingdom (UK)',
    usa: 'United States (USA)',
    russia: 'Russia',
    india: 'India',
    canada: 'Canada',
    germany: 'Germany',
    france: 'France',
    netherlands: 'Netherlands',
    brazil: 'Brazil',
    indonesia: 'Indonesia',
    philippines: 'Philippines',
    nigeria: 'Nigeria',
    australia: 'Australia',
    pakistan: 'Pakistan',
    bangladesh: 'Bangladesh',
    spain: 'Spain',
    italy: 'Italy',
    turkey: 'Turkey',
    poland: 'Poland',
    ukraine: 'Ukraine',
    vietnam: 'Vietnam',
    thailand: 'Thailand',
    malaysia: 'Malaysia',
    egypt: 'Egypt',
    southafrica: 'South Africa',
    mexico: 'Mexico',
    argentina: 'Argentina',
    colombia: 'Colombia',
    sweden: 'Sweden',
    uae: 'United Arab Emirates',
    saudiarabia: 'Saudi Arabia',
    singapore: 'Singapore',
    japan: 'Japan',
    korea: 'South Korea'
  };

  if (customNames[slug.toLowerCase()]) {
    return customNames[slug.toLowerCase()];
  }

  if (name && name.toLowerCase() !== slug.toLowerCase()) {
    return name;
  }

  // Capitalize slug
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Brand directory for prominent platforms
const BRAND_REGISTRY: Record<string, Partial<ServiceDisplayMeta>> = {
  whatsapp: {
    displayName: 'WhatsApp',
    category: 'messaging',
    gradient: 'from-emerald-500 to-green-600',
    iconChar: '💬',
    badge: 'Popular'
  },
  telegram: {
    displayName: 'Telegram',
    category: 'messaging',
    gradient: 'from-sky-400 to-blue-600',
    iconChar: '✈️',
    badge: 'High Stock'
  },
  openai: {
    displayName: 'ChatGPT / OpenAI',
    category: 'ai',
    gradient: 'from-teal-500 to-emerald-700',
    iconChar: '🤖',
    badge: 'Trending'
  },
  google: {
    displayName: 'Google / Gmail / YouTube',
    category: 'ai',
    gradient: 'from-rose-500 via-amber-500 to-blue-500',
    iconChar: '🔴',
    badge: 'Verified'
  },
  instagram: {
    displayName: 'Instagram',
    category: 'social',
    gradient: 'from-purple-600 via-pink-500 to-amber-500',
    iconChar: '📸',
    badge: 'Hot'
  },
  facebook: {
    displayName: 'Facebook',
    category: 'social',
    gradient: 'from-blue-600 to-indigo-700',
    iconChar: '👥'
  },
  tiktok: {
    displayName: 'TikTok',
    category: 'social',
    gradient: 'from-slate-900 via-rose-600 to-cyan-500',
    iconChar: '🎵',
    badge: 'Viral'
  },
  twitter: {
    displayName: 'X (Twitter)',
    category: 'social',
    gradient: 'from-slate-900 to-black',
    iconChar: '𝕏'
  },
  discord: {
    displayName: 'Discord',
    category: 'social',
    gradient: 'from-indigo-600 to-purple-700',
    iconChar: '🎮'
  },
  apple: {
    displayName: 'Apple ID / iCloud',
    category: 'ai',
    gradient: 'from-slate-700 to-slate-900',
    iconChar: '🍏'
  },
  microsoft: {
    displayName: 'Microsoft / Outlook / Azure',
    category: 'ai',
    gradient: 'from-blue-500 to-cyan-600',
    iconChar: '🪟'
  },
  amazon: {
    displayName: 'Amazon / AWS',
    category: 'shopping',
    gradient: 'from-amber-500 to-orange-600',
    iconChar: '🛒'
  },
  netflix: {
    displayName: 'Netflix',
    category: 'entertainment',
    gradient: 'from-red-600 to-black',
    iconChar: '🎬'
  },
  tinder: {
    displayName: 'Tinder',
    category: 'dating',
    gradient: 'from-rose-500 to-amber-500',
    iconChar: '🔥'
  },
  uber: {
    displayName: 'Uber / Uber Eats',
    category: 'shopping',
    gradient: 'from-slate-900 to-black',
    iconChar: '🚗'
  },
  snapchat: {
    displayName: 'Snapchat',
    category: 'social',
    gradient: 'from-amber-400 to-yellow-500',
    iconChar: '👻'
  },
  linkedin: {
    displayName: 'LinkedIn',
    category: 'social',
    gradient: 'from-blue-700 to-blue-950',
    iconChar: '💼'
  },
  spotify: {
    displayName: 'Spotify',
    category: 'entertainment',
    gradient: 'from-emerald-500 to-green-700',
    iconChar: '🎧'
  },
  steam: {
    displayName: 'Steam',
    category: 'entertainment',
    gradient: 'from-slate-800 to-indigo-950',
    iconChar: '🕹️'
  },
  binance: {
    displayName: 'Binance',
    category: 'finance',
    gradient: 'from-amber-400 to-yellow-600',
    iconChar: '🪙'
  },
  paypal: {
    displayName: 'PayPal',
    category: 'finance',
    gradient: 'from-sky-600 to-blue-700',
    iconChar: '💳'
  },
  line: {
    displayName: 'LINE Messenger',
    category: 'messaging',
    gradient: 'from-lime-500 to-green-600',
    iconChar: '🟢'
  },
  viber: {
    displayName: 'Viber',
    category: 'messaging',
    gradient: 'from-purple-500 to-indigo-600',
    iconChar: '🟣'
  },
  wechat: {
    displayName: 'WeChat',
    category: 'messaging',
    gradient: 'from-emerald-500 to-teal-600',
    iconChar: '💬'
  },
  bumble: {
    displayName: 'Bumble',
    category: 'dating',
    gradient: 'from-amber-400 to-yellow-500',
    iconChar: '🐝'
  },
  airbnb: {
    displayName: 'Airbnb',
    category: 'shopping',
    gradient: 'from-rose-500 to-pink-600',
    iconChar: '🏠'
  },
  ebay: {
    displayName: 'eBay',
    category: 'shopping',
    gradient: 'from-blue-600 to-amber-500',
    iconChar: '🛍️'
  },
  aliexpress: {
    displayName: 'AliExpress',
    category: 'shopping',
    gradient: 'from-orange-500 to-red-600',
    iconChar: '📦'
  },
  reddit: {
    displayName: 'Reddit',
    category: 'social',
    gradient: 'from-orange-500 to-rose-600',
    iconChar: '🤖'
  },
  github: {
    displayName: 'GitHub',
    category: 'ai',
    gradient: 'from-slate-800 to-black',
    iconChar: '🐙'
  }
};

// Deterministic color palette for unlisted services
const GRADIENT_PALETTES = [
  'from-indigo-500 to-purple-600',
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-violet-500 to-purple-700',
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-rose-600',
  'from-teal-500 to-emerald-700',
  'from-blue-600 to-indigo-800'
];

export function getServiceMetadata(slug: string, rawName?: string): ServiceDisplayMeta {
  const lowerSlug = slug.toLowerCase();
  const known = BRAND_REGISTRY[lowerSlug];

  let category: ServiceDisplayMeta['category'] = 'other';
  if (known?.category) {
    category = known.category;
  } else if (/chat|msg|message|talk|call|sms|voip|messenger/i.test(lowerSlug)) {
    category = 'messaging';
  } else if (/social|media|post|share|community|feed|tweet/i.test(lowerSlug)) {
    category = 'social';
  } else if (/ai|bot|gpt|cloud|api|dev|tech|mail|code/i.test(lowerSlug)) {
    category = 'ai';
  } else if (/pay|bank|crypto|coin|wallet|cash|money|finance/i.test(lowerSlug)) {
    category = 'finance';
  } else if (/shop|buy|store|market|cart|order|delivery|food/i.test(lowerSlug)) {
    category = 'shopping';
  } else if (/date|love|meet|match|friend|singles/i.test(lowerSlug)) {
    category = 'dating';
  } else if (/game|play|music|stream|video|movie|tv/i.test(lowerSlug)) {
    category = 'entertainment';
  }

  // Calculate deterministic color hash from slug
  let hash = 0;
  for (let i = 0; i < lowerSlug.length; i++) {
    hash = (hash << 5) - hash + lowerSlug.charCodeAt(i);
    hash |= 0;
  }
  const gradient = known?.gradient || GRADIENT_PALETTES[Math.abs(hash) % GRADIENT_PALETTES.length];

  let displayName = known?.displayName;
  if (!displayName) {
    if (rawName && rawName.toLowerCase() !== lowerSlug) {
      displayName = rawName;
    } else {
      displayName = lowerSlug
        .split(/[-_.]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }

  // Monogram or initial
  const iconChar = known?.iconChar || displayName.substring(0, 2).toUpperCase();

  return {
    slug: lowerSlug,
    name: rawName || lowerSlug,
    displayName,
    category,
    gradient,
    badge: known?.badge,
    iconChar
  };
}

// Curated popular services list
export const POPULAR_SERVICES_LIST: string[] = [
  'whatsapp',
  'telegram',
  'openai',
  'google',
  'instagram',
  'facebook',
  'tiktok',
  'twitter',
  'discord',
  'apple',
  'amazon',
  'tinder',
  'netflix',
  'uber',
  'binance',
  'snapchat'
];

// Curated popular countries list
export const POPULAR_COUNTRIES_LIST = [
  { slug: 'england', name: 'United Kingdom', flag: '🇬🇧', code: '+44' },
  { slug: 'usa', name: 'United States', flag: '🇺🇸', code: '+1' },
  { slug: 'india', name: 'India', flag: '🇮🇳', code: '+91' },
  { slug: 'canada', name: 'Canada', flag: '🇨🇦', code: '+1' },
  { slug: 'netherlands', name: 'Netherlands', flag: '🇳🇱', code: '+31' },
  { slug: 'germany', name: 'Germany', flag: '🇩🇪', code: '+49' },
  { slug: 'france', name: 'France', flag: '🇫🇷', code: '+33' },
  { slug: 'brazil', name: 'Brazil', flag: '🇧🇷', code: '+55' },
  { slug: 'indonesia', name: 'Indonesia', flag: '🇮🇩', code: '+62' },
  { slug: 'philippines', name: 'Philippines', flag: '🇵🇭', code: '+63' },
  { slug: 'nigeria', name: 'Nigeria', flag: '🇳🇬', code: '+234' },
  { slug: 'spain', name: 'Spain', flag: '🇪🇸', code: '+34' },
  { slug: 'australia', name: 'Australia', flag: '🇦🇺', code: '+61' },
  { slug: 'vietnam', name: 'Vietnam', flag: '🇻🇳', code: '+84' }
];

export const SERVICE_CATEGORIES = [
  { id: 'all', label: 'All Services', icon: '⚡' },
  { id: 'messaging', label: 'Messaging & Chat', icon: '💬' },
  { id: 'social', label: 'Social Networks', icon: '👥' },
  { id: 'ai', label: 'AI & Cloud', icon: '🤖' },
  { id: 'finance', label: 'Crypto & Banking', icon: '🪙' },
  { id: 'shopping', label: 'Shopping & Delivery', icon: '🛒' },
  { id: 'dating', label: 'Dating & Lifestyle', icon: '🔥' },
  { id: 'entertainment', label: 'Games & Media', icon: '🎮' }
];
