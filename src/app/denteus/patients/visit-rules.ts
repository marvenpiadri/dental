import { PrescriptionLine, VisitNote } from '../models/dental.models';

/** Prescription lines that name a drug; blank rows left in the form are dropped. */
export const usableLines = (lines: readonly PrescriptionLine[]): PrescriptionLine[] =>
  lines.map((l) => ({ drug: l.drug.trim(), dosage: l.dosage.trim(), duration: l.duration.trim() })).filter((l) => l.drug);

export interface VisitDraft { complaint: string; findings: string; care: string; lines: readonly PrescriptionLine[] }

/** A note must say something: an empty one would only add noise to the file. Returns the note's content, or null. */
export function noteContent(draft: VisitDraft): Pick<VisitNote, 'complaint' | 'findings' | 'care' | 'prescription'> | null {
  const complaint = draft.complaint.trim();
  const findings = draft.findings.trim();
  const care = draft.care.trim();
  const prescription = usableLines(draft.lines);
  if (!complaint && !findings && !care && !prescription.length) return null;
  const content: Pick<VisitNote, 'complaint' | 'findings' | 'care' | 'prescription'> = {};
  if (complaint) content.complaint = complaint;
  if (findings) content.findings = findings;
  if (care) content.care = care;
  if (prescription.length) content.prescription = prescription;
  return content;
}
