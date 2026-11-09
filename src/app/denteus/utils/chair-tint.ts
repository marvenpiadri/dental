import type { Chair } from '../models/dental.models';

/** Muted hues, readable under dark text in light mode and light text in dark mode once mixed into the theme background. */
export const CHAIR_TINTS = ['#5b7fa6', '#b08d3c', '#b5707a', '#4f8f8a', '#8a74b0', '#b8774f'] as const;

/**
 * A chair's colour: the one set on the chair, else the next default in the order the clinic lists its chairs.
 * The block's tint says which chair; its left bar (the dentist's colour) says who.
 */
export function chairTint(chairs: readonly Chair[], id: string): string {
  const chair = chairs.find((c) => c.id === id);
  if (chair?.color) return chair.color;
  const i = chairs.findIndex((c) => c.id === id);
  return CHAIR_TINTS[(i < 0 ? 0 : i) % CHAIR_TINTS.length];
}
