import { MAX_DOCUMENT_BYTES, fileProblem, formatSize } from './document-rules';

describe('fileProblem', () => {
  it('accepts photos, X-ray exports and PDFs', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) expect(fileProblem({ type, size: 1000 })).toBeNull();
  });
  it('refuses other types, even if the picker was bypassed', () => {
    expect(fileProblem({ type: 'text/html', size: 1000 })).toBe('type');
    expect(fileProblem({ type: 'image/svg+xml', size: 1000 })).toBe('type'); // svg can carry script
    expect(fileProblem({ type: '', size: 1000 })).toBe('type');
  });
  it('refuses empty and oversized files', () => {
    expect(fileProblem({ type: 'image/png', size: 0 })).toBe('size');
    expect(fileProblem({ type: 'image/png', size: MAX_DOCUMENT_BYTES + 1 })).toBe('size');
    expect(fileProblem({ type: 'image/png', size: MAX_DOCUMENT_BYTES })).toBeNull();
  });
});

describe('formatSize', () => {
  it('reads in KB below a megabyte and MB above', () => {
    expect(formatSize(100)).toBe('1 KB');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
