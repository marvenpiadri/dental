import { APPLICANTS, emptyApplication, fieldsFor, problems, toPayload } from './partnership-rules';

const ok = (over = {}) => ({ ...emptyApplication('become'), applicant: 'dentist' as const, name: 'Dr A', email: 'a@b.co', country: 'Morocco', city: 'Rabat', consent: true, ...over });

describe('partnership application', () => {
  it('accepts a complete membership application', () => expect(problems(ok())).toEqual([]));
  it('asks only for what the pathway needs', () => {
    expect(fieldsFor('become', 'dentist')).not.toContain('project');
    expect(fieldsFor('grow', 'clinicOwner')).toContain('chairs');
    expect(fieldsFor('build', 'investor')).toContain('project');
    expect(fieldsFor('build', 'investor')).not.toContain('licence');
  });
  it('requires clinic for Grow and the project for Build', () => {
    expect(problems(ok({ pathway: 'grow', applicant: 'clinicOwner' }))).toEqual(['clinic']);
    expect(problems(ok({ pathway: 'build', applicant: 'founder' }))).toEqual(['project']);
  });
  it('rejects a bad email, missing consent and an applicant type the pathway does not take', () => {
    expect(problems(ok({ email: 'nope' }))).toEqual(['email']);
    expect(problems(ok({ consent: false }))).toEqual(['consent']);
    expect(APPLICANTS.become).not.toContain('investor');
    expect(problems(ok({ applicant: 'investor' }))).toEqual(['applicant']);
  });
  it('never marks a payload as sent or accepted, and drops fields the pathway did not ask', () => {
    const p = toPayload(ok({ chairs: '4', name: ' Dr A ' }), new Date('2026-11-11T00:00:00Z'));
    expect(p['status']).toBe('prepared-not-sent');
    expect(p['name']).toBe('Dr A');
    expect(p).not.toHaveProperty('chairs');
  });
});
