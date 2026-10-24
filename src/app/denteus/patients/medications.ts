/**
 * Names offered while typing a prescription line. Names only, never doses: the dentist decides those.
 * shortcut: a short built-in list of common dental drugs, free text still accepted. Make it editable in clinic setup if clinics ask.
 */
export const MEDICATIONS: readonly string[] = [
  'Amoxicillin', 'Amoxicillin + clavulanic acid', 'Spiramycin', 'Metronidazole', 'Spiramycin + metronidazole', 'Clindamycin',
  'Paracetamol', 'Ibuprofen', 'Ketoprofen', 'Diclofenac', 'Tramadol', 'Prednisolone',
  'Chlorhexidine mouthwash', 'Sodium bicarbonate mouthwash', 'Fluoride gel', 'Hyaluronic acid gel',
];
