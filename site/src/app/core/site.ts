/** The few facts the whole site shares. Change them here. */
export const APP_URL = 'https://app.dontalist.com';
export const SITE_URL = 'https://dontalist.com';
/** The WhatsApp number partnership inquiries go to (international format, digits only). */
export const WHATSAPP = '212695083880';
export const LANGS = ['en', 'fr'] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (v: string | null | undefined): v is Lang => v === 'en' || v === 'fr';

/** What is real today. Anything not 'available' is shown as planned, never as live. */
export type Availability = 'available' | 'planned';
export const AVAILABLE: Record<string, Availability> = {
  software: 'available', websites: 'planned', seo: 'planned', branding: 'planned', social: 'planned', presence: 'planned', communication: 'planned', network: 'planned',
};
