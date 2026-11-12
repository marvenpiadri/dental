/** Who provides the money. A universal concept: no country needs its own payment system. */
export const PAYER_TYPES = ['patient', 'public', 'private', 'mutual', 'employer', 'other'] as const;
export type PayerType = (typeof PAYER_TYPES)[number];

/** A named payer the clinic deals with: an insurance company, a mutual, an employer. Patients are the default and need no record. */
export interface Payer { id: string; type: Exclude<PayerType, 'patient'>; name: string; hidden?: boolean }

/** Payer types a clinic in this country usually has, as suggestions only. Anything else can be switched on by hand. */
export const PAYER_PRESETS: Record<string, { types: PayerType[]; names: Partial<Record<PayerType, string[]>> }> = {
  MA: { types: ['patient', 'public', 'private', 'mutual', 'other'], names: { public: ['CNSS', 'CNOPS'], mutual: ['Mutuelle'] } },
  FR: { types: ['patient', 'public', 'mutual', 'private', 'other'], names: { public: ['Assurance Maladie'], mutual: ['Mutuelle'] } },
  US: { types: ['patient', 'private', 'employer', 'other'], names: {} },
  AE: { types: ['patient', 'private', 'other'], names: {} },
};
export const DEFAULT_PAYER_TYPES: PayerType[] = ['patient', 'public', 'private', 'mutual', 'other'];

export const payerTypesFor = (country: string | undefined): PayerType[] => PAYER_PRESETS[country ?? '']?.types ?? DEFAULT_PAYER_TYPES;

/** The payer types switched on, always including the patient. */
export function enabledTypes(configured: readonly PayerType[] | undefined, country: string | undefined): PayerType[] {
  const list = configured?.length ? configured : payerTypesFor(country);
  return PAYER_TYPES.filter((t) => t === 'patient' || list.includes(t));
}

/** Suggested directory entries for the country, minus names the clinic already has. */
export function suggestedPayers(country: string | undefined, existing: readonly Payer[], newId: () => string): Payer[] {
  const have = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  const out: Payer[] = [];
  for (const [type, names] of Object.entries(PAYER_PRESETS[country ?? '']?.names ?? {}) as [Exclude<PayerType, 'patient'>, string[]][])
    for (const name of names) if (!have.has(name.toLowerCase())) out.push({ id: newId(), type, name });
  return out;
}

/** Validation of a payer entry: a name, and no other payer of the same type with that name. */
export function payerProblem(p: Pick<Payer, 'id' | 'type' | 'name'>, all: readonly Payer[]): 'name' | 'duplicate' | null {
  const n = p.name.trim().toLowerCase();
  if (!n) return 'name';
  return all.some((x) => x.id !== p.id && x.type === p.type && x.name.trim().toLowerCase() === n) ? 'duplicate' : null;
}

/** A payer cannot be removed once a payment points at it; it is hidden instead and stays on the history. */
export const payerInUse = (id: string, payments: readonly { payerId?: string }[]): boolean => payments.some((p) => p.payerId === id);
