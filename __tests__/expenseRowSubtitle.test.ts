import { describe, expect, it } from 'vitest';
import { rowSubtitle, rowTitle } from '@/lib/utils/expenseRowSubtitle';

// UM4 P12 / D-UM11: the category never shows on both lines of a compact row.
describe('rowSubtitle', () => {
  it('is empty for a row with no note, no sub-category and no account: the title already says «Alimentari»', () => {
    expect(rowTitle({ notes: undefined, categoryName: 'Alimentari' })).toBe('Alimentari');
    expect(rowSubtitle({ notes: undefined, categoryName: 'Alimentari', subCategoryName: undefined })).toBe('');
  });

  it('is the sub-category when the row has one and no note', () => {
    expect(rowSubtitle({ notes: '', categoryName: 'Alimentari', subCategoryName: 'Spesa' })).toBe('Spesa');
  });

  it('is the account when there is no note and no sub-category', () => {
    expect(rowSubtitle({ notes: '  ', categoryName: 'Alimentari' }, 'Conto BNL')).toBe('Conto BNL');
  });

  it('prefers the sub-category to the account', () => {
    expect(rowSubtitle({ categoryName: 'Alimentari', subCategoryName: 'Spesa' }, 'Conto BNL')).toBe('Spesa');
  });

  it('names the category on the second line when the note took the title', () => {
    const withNote = { notes: 'Cena da Mario', categoryName: 'Ristoranti', subCategoryName: 'Cene' };
    expect(rowTitle(withNote)).toBe('Cena da Mario');
    expect(rowSubtitle(withNote)).toBe('Ristoranti · Cene');
    expect(rowSubtitle({ notes: 'Cena da Mario', categoryName: 'Ristoranti' })).toBe('Ristoranti');
  });

  it('never prints the category on the second line when it is already the title', () => {
    const noNote = { notes: undefined, categoryName: 'Alimentari', subCategoryName: 'Spesa' };
    expect(rowTitle(noNote)).toBe('Alimentari');
    expect(rowSubtitle(noNote, 'Conto BNL')).not.toContain('Alimentari');
  });
});
