// shortcut: the default country is Morocco (212). Move it to clinic setup for clinics elsewhere.
const COUNTRY_CODE = '212';

/** Digits WhatsApp wants (country code first, no "+"), or null when the number can't be one. */
export function whatsappNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = COUNTRY_CODE + digits.slice(1); // 06 12 34 56 78 -> 212 6 12 34 56 78
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** Click-to-chat link with the message already typed; the clinic presses send. */
export function reminderLink(phone: string, message: string): string | null {
  const number = whatsappNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}
