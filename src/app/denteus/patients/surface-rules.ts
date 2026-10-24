/** Mesial, occlusal (or incisal), distal, buccal, lingual: the five faces a dentist records. Kept in this order. */
export const SURFACES = ['M', 'O', 'D', 'B', 'L'] as const;
export type Surface = (typeof SURFACES)[number];

/** Adds the surface, or removes it when it is already there; the result keeps the M O D B L order. */
export const toggleSurface = (current: readonly string[], surface: Surface): Surface[] =>
  SURFACES.filter((s) => (s === surface ? !current.includes(s) : current.includes(s)));

/** Baby teeth in FDI notation, as the dentist faces the patient. */
export const CHILD_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65].map(String);
export const CHILD_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75].map(String);
