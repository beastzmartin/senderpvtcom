export interface OfficialCountryData {
  provider_country_id: number;
  country_name: string;
  country_code_iso2: string;
  country_code_iso3: string;
  dial_code: string;
  flag: string;
  is_active?: number;
  is_supported?: number;
}

export interface OfficialServiceData {
  provider_service_code: string;
  service_name: string;
  display_name: string;
  icon?: string;
  category?: string;
  is_active?: number;
  is_supported?: number;
}

/**
 * Complete Official GrizzlySMS Country Registry
 * Source: https://grizzlysms.com/docs/tables#country
 * Uses exact numerical provider_country_id from GrizzlySMS partner protocol.
 */
export const GRIZZLY_OFFICIAL_COUNTRIES: OfficialCountryData[] = [
  // Documented & Verified Examples
  { provider_country_id: 74, country_name: 'Afghanistan', country_code_iso2: 'AF', country_code_iso3: 'AFG', dial_code: '+93', flag: '🇦🇫' },
  { provider_country_id: 155, country_name: 'Albania', country_code_iso2: 'AL', country_code_iso3: 'ALB', dial_code: '+355', flag: '🇦🇱' },
  { provider_country_id: 58, country_name: 'Algeria', country_code_iso2: 'DZ', country_code_iso3: 'DZA', dial_code: '+213', flag: '🇩🇿' },
  { provider_country_id: 76, country_name: 'Angola', country_code_iso2: 'AO', country_code_iso3: 'AGO', dial_code: '+244', flag: '🇦🇴' },
  { provider_country_id: 39, country_name: 'Argentina', country_code_iso2: 'AR', country_code_iso3: 'ARG', dial_code: '+54', flag: '🇦🇷' },
  { provider_country_id: 148, country_name: 'Armenia', country_code_iso2: 'AM', country_code_iso3: 'ARM', dial_code: '+374', flag: '🇦🇲' },
  { provider_country_id: 175, country_name: 'Australia', country_code_iso2: 'AU', country_code_iso3: 'AUS', dial_code: '+61', flag: '🇦🇺' },
  { provider_country_id: 50, country_name: 'Austria', country_code_iso2: 'AT', country_code_iso3: 'AUT', dial_code: '+43', flag: '🇦🇹' },
  { provider_country_id: 35, country_name: 'Azerbaijan', country_code_iso2: 'AZ', country_code_iso3: 'AZE', dial_code: '+994', flag: '🇦🇿' },
  { provider_country_id: 100, country_name: 'Bahrain', country_code_iso2: 'BH', country_code_iso3: 'BHR', dial_code: '+973', flag: '🇧🇭' },
  { provider_country_id: 60, country_name: 'Bangladesh', country_code_iso2: 'BD', country_code_iso3: 'BGD', dial_code: '+880', flag: '🇧🇩' },
  { provider_country_id: 51, country_name: 'Belarus', country_code_iso2: 'BY', country_code_iso3: 'BLR', dial_code: '+375', flag: '🇧🇾' },
  { provider_country_id: 82, country_name: 'Belgium', country_code_iso2: 'BE', country_code_iso3: 'BEL', dial_code: '+32', flag: '🇧🇪' },
  { provider_country_id: 105, country_name: 'Bolivia', country_code_iso2: 'BO', country_code_iso3: 'BOL', dial_code: '+591', flag: '🇧🇴' },
  { provider_country_id: 73, country_name: 'Brazil', country_code_iso2: 'BR', country_code_iso3: 'BRA', dial_code: '+55', flag: '🇧🇷' },
  { provider_country_id: 83, country_name: 'Bulgaria', country_code_iso2: 'BG', country_code_iso3: 'BGR', dial_code: '+359', flag: '🇧🇬' },
  { provider_country_id: 24, country_name: 'Cambodia', country_code_iso2: 'KH', country_code_iso3: 'KHM', dial_code: '+855', flag: '🇰🇭' },
  { provider_country_id: 41, country_name: 'Cameroon', country_code_iso2: 'CM', country_code_iso3: 'CMR', dial_code: '+237', flag: '🇨🇲' },
  { provider_country_id: 36, country_name: 'Canada', country_code_iso2: 'CA', country_code_iso3: 'CAN', dial_code: '+1', flag: '🇨🇦' },
  { provider_country_id: 42, country_name: 'Chad', country_code_iso2: 'TD', country_code_iso3: 'TCD', dial_code: '+235', flag: '🇹🇩' },
  { provider_country_id: 101, country_name: 'Chile', country_code_iso2: 'CL', country_code_iso3: 'CHL', dial_code: '+56', flag: '🇨🇱' },
  { provider_country_id: 3, country_name: 'China', country_code_iso2: 'CN', country_code_iso3: 'CHN', dial_code: '+86', flag: '🇨🇳' },
  { provider_country_id: 33, country_name: 'Colombia', country_code_iso2: 'CO', country_code_iso3: 'COL', dial_code: '+57', flag: '🇨🇴' },
  { provider_country_id: 106, country_name: 'Costa Rica', country_code_iso2: 'CR', country_code_iso3: 'CRI', dial_code: '+506', flag: '🇨🇷' },
  { provider_country_id: 45, country_name: 'Croatia', country_code_iso2: 'HR', country_code_iso3: 'HRV', dial_code: '+385', flag: '🇭🇷' },
  { provider_country_id: 77, country_name: 'Cyprus', country_code_iso2: 'CY', country_code_iso3: 'CYP', dial_code: '+357', flag: '🇨🇾' },
  { provider_country_id: 63, country_name: 'Czech Republic', country_code_iso2: 'CZ', country_code_iso3: 'CZE', dial_code: '+420', flag: '🇨🇿' },
  { provider_country_id: 172, country_name: 'Denmark', country_code_iso2: 'DK', country_code_iso3: 'DNK', dial_code: '+45', flag: '🇩🇰' },
  { provider_country_id: 109, country_name: 'Dominican Republic', country_code_iso2: 'DO', country_code_iso3: 'DOM', dial_code: '+1809', flag: '🇩🇴' },
  { provider_country_id: 18, country_name: 'DR Congo', country_code_iso2: 'CD', country_code_iso3: 'COD', dial_code: '+243', flag: '🇨🇩' },
  { provider_country_id: 102, country_name: 'Ecuador', country_code_iso2: 'EC', country_code_iso3: 'ECU', dial_code: '+593', flag: '🇪🇨' },
  { provider_country_id: 21, country_name: 'Egypt', country_code_iso2: 'EG', country_code_iso3: 'EGY', dial_code: '+20', flag: '🇪🇬' },
  { provider_country_id: 34, country_name: 'Estonia', country_code_iso2: 'EE', country_code_iso3: 'EST', dial_code: '+372', flag: '🇪🇪' },
  { provider_country_id: 87, country_name: 'Finland', country_code_iso2: 'FI', country_code_iso3: 'FIN', dial_code: '+358', flag: '🇫🇮' },
  { provider_country_id: 78, country_name: 'France', country_code_iso2: 'FR', country_code_iso3: 'FRA', dial_code: '+33', flag: '🇫🇷' },
  { provider_country_id: 28, country_name: 'Gambia', country_code_iso2: 'GM', country_code_iso3: 'GMB', dial_code: '+220', flag: '🇬🇲' },
  { provider_country_id: 70, country_name: 'Georgia', country_code_iso2: 'GE', country_code_iso3: 'GEO', dial_code: '+995', flag: '🇬🇪' },
  { provider_country_id: 43, country_name: 'Germany', country_code_iso2: 'DE', country_code_iso3: 'DEU', dial_code: '+49', flag: '🇩🇪' },
  { provider_country_id: 38, country_name: 'Ghana', country_code_iso2: 'GH', country_code_iso3: 'GHA', dial_code: '+233', flag: '🇬🇭' },
  { provider_country_id: 71, country_name: 'Greece', country_code_iso2: 'GR', country_code_iso3: 'GRC', dial_code: '+30', flag: '🇬🇷' },
  { provider_country_id: 108, country_name: 'Guatemala', country_code_iso2: 'GT', country_code_iso3: 'GTM', dial_code: '+502', flag: '🇬🇹' },
  { provider_country_id: 59, country_name: 'Guinea', country_code_iso2: 'GN', country_code_iso3: 'GIN', dial_code: '+224', flag: '🇬🇳' },
  { provider_country_id: 26, country_name: 'Haiti', country_code_iso2: 'HT', country_code_iso3: 'HTI', dial_code: '+509', flag: '🇭🇹' },
  { provider_country_id: 69, country_name: 'Honduras', country_code_iso2: 'HN', country_code_iso3: 'HND', dial_code: '+504', flag: '🇭🇳' },
  { provider_country_id: 14, country_name: 'Hong Kong', country_code_iso2: 'HK', country_code_iso3: 'HKG', dial_code: '+852', flag: '🇭🇰' },
  { provider_country_id: 84, country_name: 'Hungary', country_code_iso2: 'HU', country_code_iso3: 'HUN', dial_code: '+36', flag: '🇭🇺' },
  { provider_country_id: 22, country_name: 'India', country_code_iso2: 'IN', country_code_iso3: 'IND', dial_code: '+91', flag: '🇮🇳' },
  { provider_country_id: 6, country_name: 'Indonesia', country_code_iso2: 'ID', country_code_iso3: 'IDN', dial_code: '+62', flag: '🇮🇩' },
  { provider_country_id: 57, country_name: 'Iran', country_code_iso2: 'IR', country_code_iso3: 'IRN', dial_code: '+98', flag: '🇮🇷' },
  { provider_country_id: 47, country_name: 'Iraq', country_code_iso2: 'IQ', country_code_iso3: 'IRQ', dial_code: '+964', flag: '🇮🇶' },
  { provider_country_id: 23, country_name: 'Ireland', country_code_iso2: 'IE', country_code_iso3: 'IRL', dial_code: '+353', flag: '🇮🇪' },
  { provider_country_id: 13, country_name: 'Israel', country_code_iso2: 'IL', country_code_iso3: 'ISR', dial_code: '+972', flag: '🇮🇱' },
  { provider_country_id: 86, country_name: 'Italy', country_code_iso2: 'IT', country_code_iso3: 'ITA', dial_code: '+39', flag: '🇮🇹' },
  { provider_country_id: 27, country_name: 'Ivory Coast', country_code_iso2: 'CI', country_code_iso3: 'CIV', dial_code: '+225', flag: '🇨🇮' },
  { provider_country_id: 110, country_name: 'Jamaica', country_code_iso2: 'JM', country_code_iso3: 'JAM', dial_code: '+1876', flag: '🇯🇲' },
  { provider_country_id: 182, country_name: 'Japan', country_code_iso2: 'JP', country_code_iso3: 'JPN', dial_code: '+81', flag: '🇯🇵' },
  { provider_country_id: 94, country_name: 'Jordan', country_code_iso2: 'JO', country_code_iso3: 'JOR', dial_code: '+962', flag: '🇯🇴' },
  { provider_country_id: 2, country_name: 'Kazakhstan', country_code_iso2: 'KZ', country_code_iso3: 'KAZ', dial_code: '+7', flag: '🇰🇿' },
  { provider_country_id: 91, country_name: 'Kenya', country_code_iso2: 'KE', country_code_iso3: 'KEN', dial_code: '+254', flag: '🇰🇪' },
  { provider_country_id: 97, country_name: 'Kuwait', country_code_iso2: 'KW', country_code_iso3: 'KWT', dial_code: '+965', flag: '🇰🇼' },
  { provider_country_id: 11, country_name: 'Kyrgyzstan', country_code_iso2: 'KG', country_code_iso3: 'KGZ', dial_code: '+996', flag: '🇰🇬' },
  { provider_country_id: 25, country_name: 'Laos', country_code_iso2: 'LA', country_code_iso3: 'LAO', dial_code: '+856', flag: '🇱🇦' },
  { provider_country_id: 49, country_name: 'Latvia', country_code_iso2: 'LV', country_code_iso3: 'LVA', dial_code: '+371', flag: '🇱🇻' },
  { provider_country_id: 96, country_name: 'Lebanon', country_code_iso2: 'LB', country_code_iso3: 'LBN', dial_code: '+961', flag: '🇱🇧' },
  { provider_country_id: 44, country_name: 'Lithuania', country_code_iso2: 'LT', country_code_iso3: 'LTU', dial_code: '+370', flag: '🇱🇹' },
  { provider_country_id: 17, country_name: 'Madagascar', country_code_iso2: 'MG', country_code_iso3: 'MDG', dial_code: '+261', flag: '🇲🇬' },
  { provider_country_id: 7, country_name: 'Malaysia', country_code_iso2: 'MY', country_code_iso3: 'MYS', dial_code: '+60', flag: '🇲🇾' },
  { provider_country_id: 61, country_name: 'Maldives', country_code_iso2: 'MV', country_code_iso3: 'MDV', dial_code: '+960', flag: '🇲🇻' },
  { provider_country_id: 54, country_name: 'Mexico', country_code_iso2: 'MX', country_code_iso3: 'MEX', dial_code: '+52', flag: '🇲🇽' },
  { provider_country_id: 85, country_name: 'Moldova', country_code_iso2: 'MD', country_code_iso3: 'MDA', dial_code: '+373', flag: '🇲🇩' },
  { provider_country_id: 152, country_name: 'Mongolia', country_code_iso2: 'MN', country_code_iso3: 'MNG', dial_code: '+976', flag: '🇲🇳' },
  { provider_country_id: 37, country_name: 'Morocco', country_code_iso2: 'MA', country_code_iso3: 'MAR', dial_code: '+212', flag: '🇲🇦' },
  { provider_country_id: 5, country_name: 'Myanmar', country_code_iso2: 'MM', country_code_iso3: 'MMR', dial_code: '+95', flag: '🇲🇲' },
  { provider_country_id: 81, country_name: 'Nepal', country_code_iso2: 'NP', country_code_iso3: 'NPL', dial_code: '+977', flag: '🇳🇵' },
  { provider_country_id: 48, country_name: 'Netherlands', country_code_iso2: 'NL', country_code_iso3: 'NLD', dial_code: '+31', flag: '🇳🇱' },
  { provider_country_id: 67, country_name: 'New Zealand', country_code_iso2: 'NZ', country_code_iso3: 'NZL', dial_code: '+64', flag: '🇳🇿' },
  { provider_country_id: 19, country_name: 'Nigeria', country_code_iso2: 'NG', country_code_iso3: 'NGA', dial_code: '+234', flag: '🇳🇬' },
  { provider_country_id: 88, country_name: 'Norway', country_code_iso2: 'NO', country_code_iso3: 'NOR', dial_code: '+47', flag: '🇳🇴' },
  { provider_country_id: 98, country_name: 'Oman', country_code_iso2: 'OM', country_code_iso3: 'OMN', dial_code: '+968', flag: '🇴🇲' },
  { provider_country_id: 66, country_name: 'Pakistan', country_code_iso2: 'PK', country_code_iso3: 'PAK', dial_code: '+92', flag: '🇵🇰' },
  { provider_country_id: 107, country_name: 'Panama', country_code_iso2: 'PA', country_code_iso3: 'PAN', dial_code: '+507', flag: '🇵🇦' },
  { provider_country_id: 68, country_name: 'Paraguay', country_code_iso2: 'PY', country_code_iso3: 'PRY', dial_code: '+595', flag: '🇵🇾' },
  { provider_country_id: 65, country_name: 'Peru', country_code_iso2: 'PE', country_code_iso3: 'PER', dial_code: '+51', flag: '🇵🇪' },
  { provider_country_id: 4, country_name: 'Philippines', country_code_iso2: 'PH', country_code_iso3: 'PHL', dial_code: '+63', flag: '🇵🇭' },
  { provider_country_id: 15, country_name: 'Poland', country_code_iso2: 'PL', country_code_iso3: 'POL', dial_code: '+48', flag: '🇵🇱' },
  { provider_country_id: 72, country_name: 'Portugal', country_code_iso2: 'PT', country_code_iso3: 'PRT', dial_code: '+351', flag: '🇵🇹' },
  { provider_country_id: 99, country_name: 'Qatar', country_code_iso2: 'QA', country_code_iso3: 'QAT', dial_code: '+974', flag: '🇶🇦' },
  { provider_country_id: 79, country_name: 'Romania', country_code_iso2: 'RO', country_code_iso3: 'ROU', dial_code: '+40', flag: '🇷🇴' },
  { provider_country_id: 0, country_name: 'Russia', country_code_iso2: 'RU', country_code_iso3: 'RUS', dial_code: '+7', flag: '🇷🇺' },
  { provider_country_id: 53, country_name: 'Saudi Arabia', country_code_iso2: 'SA', country_code_iso3: 'SAU', dial_code: '+966', flag: '🇸🇦' },
  { provider_country_id: 93, country_name: 'Senegal', country_code_iso2: 'SN', country_code_iso3: 'SEN', dial_code: '+221', flag: '🇸🇳' },
  { provider_country_id: 29, country_name: 'Serbia', country_code_iso2: 'RS', country_code_iso3: 'SRB', dial_code: '+381', flag: '🇷🇸' },
  { provider_country_id: 10351, country_name: 'Singapore', country_code_iso2: 'SG', country_code_iso3: 'SGP', dial_code: '+65', flag: '🇸🇬' },
  { provider_country_id: 90, country_name: 'Slovakia', country_code_iso2: 'SK', country_code_iso3: 'SVK', dial_code: '+421', flag: '🇸🇰' },
  { provider_country_id: 89, country_name: 'Slovenia', country_code_iso2: 'SI', country_code_iso3: 'SVN', dial_code: '+386', flag: '🇸🇮' },
  { provider_country_id: 31, country_name: 'South Africa', country_code_iso2: 'ZA', country_code_iso3: 'ZAF', dial_code: '+27', flag: '🇿🇦' },
  { provider_country_id: 10350, country_name: 'South Korea', country_code_iso2: 'KR', country_code_iso3: 'KOR', dial_code: '+82', flag: '🇰🇷' },
  { provider_country_id: 56, country_name: 'Spain', country_code_iso2: 'ES', country_code_iso3: 'ESP', dial_code: '+34', flag: '🇪🇸' },
  { provider_country_id: 64, country_name: 'Sri Lanka', country_code_iso2: 'LK', country_code_iso3: 'LKA', dial_code: '+94', flag: '🇱🇰' },
  { provider_country_id: 46, country_name: 'Sweden', country_code_iso2: 'SE', country_code_iso3: 'SWE', dial_code: '+46', flag: '🇸🇪' },
  { provider_country_id: 80, country_name: 'Switzerland', country_code_iso2: 'CH', country_code_iso3: 'CHE', dial_code: '+41', flag: '🇨🇭' },
  { provider_country_id: 143, country_name: 'Tajikistan', country_code_iso2: 'TJ', country_code_iso3: 'TJK', dial_code: '+992', flag: '🇹🇯' },
  { provider_country_id: 55, country_name: 'Taiwan', country_code_iso2: 'TW', country_code_iso3: 'TWN', dial_code: '+886', flag: '🇹🇼' },
  { provider_country_id: 52, country_name: 'Thailand', country_code_iso2: 'TH', country_code_iso3: 'THA', dial_code: '+66', flag: '🇹🇭' },
  { provider_country_id: 111, country_name: 'Trinidad and Tobago', country_code_iso2: 'TT', country_code_iso3: 'TTO', dial_code: '+1868', flag: '🇹🇹' },
  { provider_country_id: 92, country_name: 'Tunisia', country_code_iso2: 'TN', country_code_iso3: 'TUN', dial_code: '+216', flag: '🇹🇳' },
  { provider_country_id: 62, country_name: 'Turkey', country_code_iso2: 'TR', country_code_iso3: 'TUR', dial_code: '+90', flag: '🇹🇷' },
  { provider_country_id: 161, country_name: 'Turkmenistan', country_code_iso2: 'TM', country_code_iso3: 'TKM', dial_code: '+993', flag: '🇹🇲' },
  { provider_country_id: 95, country_name: 'UAE', country_code_iso2: 'AE', country_code_iso3: 'ARE', dial_code: '+971', flag: '🇦🇪' },
  { provider_country_id: 75, country_name: 'Uganda', country_code_iso2: 'UG', country_code_iso3: 'UGA', dial_code: '+256', flag: '🇺🇬' },
  { provider_country_id: 1, country_name: 'Ukraine', country_code_iso2: 'UA', country_code_iso3: 'UKR', dial_code: '+380', flag: '🇺🇦' },
  { provider_country_id: 16, country_name: 'United Kingdom', country_code_iso2: 'GB', country_code_iso3: 'GBR', dial_code: '+44', flag: '🇬🇧' },
  { provider_country_id: 104, country_name: 'Uruguay', country_code_iso2: 'UY', country_code_iso3: 'URY', dial_code: '+598', flag: '🇺🇾' },
  { provider_country_id: 187, country_name: 'USA', country_code_iso2: 'US', country_code_iso3: 'USA', dial_code: '+1', flag: '🇺🇸' },
  { provider_country_id: 12, country_name: 'USA (virtual)', country_code_iso2: 'US', country_code_iso3: 'USA', dial_code: '+1', flag: '🇺🇸' },
  { provider_country_id: 40, country_name: 'Uzbekistan', country_code_iso2: 'UZ', country_code_iso3: 'UZB', dial_code: '+998', flag: '🇺🇿' },
  { provider_country_id: 103, country_name: 'Venezuela', country_code_iso2: 'VE', country_code_iso3: 'VEN', dial_code: '+58', flag: '🇻🇪' },
  { provider_country_id: 10, country_name: 'Vietnam', country_code_iso2: 'VN', country_code_iso3: 'VNM', dial_code: '+84', flag: '🇻🇳' },
  { provider_country_id: 30, country_name: 'Yemen', country_code_iso2: 'YE', country_code_iso3: 'YEM', dial_code: '+967', flag: '🇾🇪' }
];

/**
 * Official GrizzlySMS Service Short Code Registry
 * Source: https://grizzlysms.com/docs/tables#service
 * Partner API strictly requires documented short codes.
 */
export const GRIZZLY_OFFICIAL_SERVICES: OfficialServiceData[] = [
  { provider_service_code: 'tg', service_name: 'Telegram', display_name: 'Telegram Messenger', category: 'social', icon: 'Send' },
  { provider_service_code: 'wa', service_name: 'WhatsApp', display_name: 'WhatsApp Messenger', category: 'social', icon: 'MessageCircle' },
  { provider_service_code: 'go', service_name: 'Google', display_name: 'Google / YouTube / Gmail', category: 'technology', icon: 'Globe' },
  { provider_service_code: 'ig', service_name: 'Instagram', display_name: 'Instagram', category: 'social', icon: 'Camera' },
  { provider_service_code: 'vi', service_name: 'Viber', display_name: 'Viber', category: 'social', icon: 'Phone' },
  { provider_service_code: 'fb', service_name: 'Facebook', display_name: 'Facebook', category: 'social', icon: 'Share2' },
  { provider_service_code: 'tw', service_name: 'Twitter', display_name: 'Twitter / X', category: 'social', icon: 'Twitter' },
  { provider_service_code: 'wb', service_name: 'WeChat', display_name: 'WeChat', category: 'social', icon: 'MessageSquare' },
  { provider_service_code: 'ds', service_name: 'Discord', display_name: 'Discord', category: 'gaming', icon: 'Headphones' },
  { provider_service_code: 'am', service_name: 'Amazon', display_name: 'Amazon', category: 'ecommerce', icon: 'ShoppingBag' },
  { provider_service_code: 'nf', service_name: 'Netflix', display_name: 'Netflix', category: 'entertainment', icon: 'Film' },
  { provider_service_code: 'ts', service_name: 'PayPal', display_name: 'PayPal', category: 'finance', icon: 'CreditCard' },
  { provider_service_code: 'li', service_name: 'LinkedIn', display_name: 'LinkedIn', category: 'social', icon: 'Briefcase' },
  { provider_service_code: 'ti', service_name: 'Tinder', display_name: 'Tinder', category: 'dating', icon: 'Heart' },
  { provider_service_code: 'tc', service_name: 'Truecaller', display_name: 'Truecaller', category: 'utility', icon: 'ShieldCheck' },
  { provider_service_code: 'sn', service_name: 'Snapchat', display_name: 'Snapchat', category: 'social', icon: 'Zap' },
  { provider_service_code: 'kt', service_name: 'KakaoTalk', display_name: 'KakaoTalk', category: 'social', icon: 'MessageCircle' },
  { provider_service_code: 'ln', service_name: 'Line', display_name: 'Line Messenger', category: 'social', icon: 'MessageSquare' },
  { provider_service_code: 'mm', service_name: 'Microsoft', display_name: 'Microsoft / Outlook / Azure', category: 'technology', icon: 'Cpu' },
  { provider_service_code: 'ya', service_name: 'Yandex', display_name: 'Yandex', category: 'technology', icon: 'Search' },
  { provider_service_code: 'ok', service_name: 'Odnoklassniki', display_name: 'OK.ru (Odnoklassniki)', category: 'social', icon: 'Users' },
  { provider_service_code: 'vk', service_name: 'VKontakte', display_name: 'VK (VKontakte)', category: 'social', icon: 'Share' },
  { provider_service_code: 'ub', service_name: 'Uber', display_name: 'Uber / UberEats', category: 'transport', icon: 'Navigation' },
  { provider_service_code: 'ai', service_name: 'OpenAI', display_name: 'OpenAI / ChatGPT', category: 'technology', icon: 'Cpu' },
  { provider_service_code: 'bd', service_name: 'Binance', display_name: 'Binance', category: 'finance', icon: 'Coins' },
  { provider_service_code: 'co', service_name: 'Coinbase', display_name: 'Coinbase', category: 'finance', icon: 'DollarSign' },
  { provider_service_code: 'st', service_name: 'Steam', display_name: 'Steam Gaming', category: 'gaming', icon: 'Gamepad' },
  { provider_service_code: 'ot', service_name: 'Other', display_name: 'Other Services (Any Other)', category: 'general', icon: 'MoreHorizontal' }
];

export const GRIZZLY_OFFICIAL_OPERATORS = [
  { provider_operator_code: 'any', operator_name: 'Any Operator (Default)', is_active: 1 }
];

