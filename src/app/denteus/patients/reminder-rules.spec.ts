import { reminderLink, whatsappNumber } from './reminder-rules';

describe('whatsappNumber', () => {
  it('turns local Moroccan numbers into international ones', () => {
    expect(whatsappNumber('06 12 34 56 78')).toBe('212612345678');
    expect(whatsappNumber('0612-345678')).toBe('212612345678');
  });
  it('keeps numbers that already carry a country code', () => {
    expect(whatsappNumber('+212 612345678')).toBe('212612345678');
    expect(whatsappNumber('00212612345678')).toBe('212612345678');
    expect(whatsappNumber('+33 6 12 34 56 78')).toBe('33612345678');
  });
  it('rejects what cannot be a phone number', () => {
    for (const bad of ['', '123', 'abc', '06123']) expect(whatsappNumber(bad)).toBeNull();
  });
});

describe('reminderLink', () => {
  it('encodes the message', () => {
    expect(reminderLink('0612345678', 'Hi & bye')).toBe('https://wa.me/212612345678?text=Hi%20%26%20bye');
  });
  it('is null without a usable number', () => {
    expect(reminderLink('12', 'x')).toBeNull();
  });
});
