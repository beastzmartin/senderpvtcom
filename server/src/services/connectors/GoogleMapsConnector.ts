import { BaseConnector } from './BaseConnector.js';
import { LeadRecord } from './types.js';

export class GoogleMapsConnector extends BaseConnector {
  public id = 'google_maps';
  public name = 'Google Maps Lead Extractor';
  public category = 'Maps & Local';
  public description = 'Extracts local business intelligence, ratings, phone numbers, addresses, and websites from Google Maps listings.';
  public supportedFields = [
    'business_name',
    'category',
    'phone',
    'website',
    'address',
    'city',
    'state',
    'country',
    'rating',
    'reviews_count',
    'place_id',
    'listing_url',
    'latitude',
    'longitude',
    'operating_status'
  ];

  public validateParams(params: any): { valid: boolean; error?: string } {
    if (!params.keyword && !params.category) {
      return { valid: false, error: 'A search keyword or business category is required.' };
    }
    if (!params.location && !params.city) {
      return { valid: false, error: 'A target location or city is required for local mapping.' };
    }
    return { valid: true };
  }

  public normalizeLead(raw: any, userId: string, jobId?: string): Partial<LeadRecord> {
    const businessName = this.cleanBusinessName(raw.business_name || raw.title || raw.name);
    const phone = this.cleanPhone(raw.phone || raw.phone_number || raw.telephone);
    const website = this.cleanWebsite(raw.website || raw.site || raw.url);
    const email = this.cleanEmail(raw.email);

    // Parse location / city / state if present
    let address = (raw.address || raw.formatted_address || raw.location_text || '').trim();
    let city = raw.city || null;
    let state = raw.state || null;
    let country = raw.country || null;
    let postalCode = raw.postal_code || null;

    if (address && (!city || !state)) {
      const parts = address.split(',').map((p: string) => p.trim());
      if (parts.length >= 3) {
        if (!city) city = parts[parts.length - 3] || null;
        if (!state) state = parts[parts.length - 2] || null;
        if (!country) country = parts[parts.length - 1] || null;
      } else if (parts.length === 2) {
        if (!city) city = parts[0];
        if (!country) country = parts[1];
      }
    }

    const rating = typeof raw.rating === 'number' ? raw.rating : (raw.rating ? parseFloat(raw.rating) : null);
    const reviewsCount = typeof raw.reviews_count === 'number' ? raw.reviews_count : (raw.reviews_count ? parseInt(raw.reviews_count, 10) : 0);

    return {
      user_id: userId,
      job_id: jobId || null,
      business_name: businessName,
      category: raw.category || raw.industry || 'Local Business',
      industry: raw.industry || raw.category || 'Local Business',
      email: email,
      phone: phone,
      website: website,
      address: address || null,
      city: city || raw.target_city || null,
      state: state || null,
      country: country || null,
      postal_code: postalCode || null,
      latitude: raw.latitude ? Number(raw.latitude) : (raw.lat ? Number(raw.lat) : null),
      longitude: raw.longitude ? Number(raw.longitude) : (raw.lng ? Number(raw.lng) : null),
      rating: rating && !isNaN(rating) ? rating : null,
      reviews_count: !isNaN(reviewsCount) ? reviewsCount : 0,
      operating_status: raw.operating_status || raw.status_text || 'Operational',
      place_id: raw.place_id || raw.data_id || null,
      listing_url: raw.listing_url || raw.maps_url || raw.href || null,
      source: 'google_maps',
      source_url: raw.source_url || raw.listing_url || 'https://maps.google.com',
      social_profiles: raw.social_profiles || null,
      status: 'new',
      is_verified: !!(phone || website),
      metadata: raw.metadata || { raw_rating: raw.rating, raw_reviews: raw.reviews_count }
    };
  }
}
