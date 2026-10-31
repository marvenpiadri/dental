import type { ToothEdit } from '../odontogram/engine/edits';

/** What a built-in act records on the tooth when it is saved: a crown shows as a crown, an extraction as a missing tooth... Acts not listed (filling needs surfaces) are charted by hand in the editor. */
export const ACT_CHART: Record<string, ToothEdit> = {
  crown: { kind: 'restoration', value: 'crown|metal-ceramic' },
  extraction: { kind: 'selection', value: 'no-tooth-after-extraction' },
  implant: { kind: 'selection', value: 'implant' },
  'root-canal': { kind: 'endo', value: 'endo-filling' },
};
