/** Clinics subscribed to Dontalist, shown on /clinics. Add an entry only when the clinic has subscribed and agreed to be listed.
 *  `url` is where a click goes: the clinic's own page or booking link. `photo` is optional (a path under public/, or an https URL); without it the card shows initials. */
export interface Clinic { id: string; name: string; city: string; address: string; url: string; photo?: string }
export const CLINICS: Clinic[] = [];
