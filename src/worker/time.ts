/** One UTC convention: instants are 'YYYY-MM-DD HH:MM:SS.mmm' in the database and ISO-8601 'Z' strings in the API. */
export const toDb = (d: Date | string): string => new Date(d).toISOString().replace('T', ' ').replace('Z', '');
export const fromDb = (s: string | null): string | null => (s ? `${s.replace(' ', 'T')}${s.includes('.') ? '' : '.000'}Z` : null);
export const nowDb = (): string => toDb(new Date());
