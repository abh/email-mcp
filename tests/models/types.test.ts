import { describe, it, expect } from 'vitest';
import {
  ProviderType,
  FolderType,
  isProviderSupported,
} from '../../src/models/types.js';

describe('ProviderType', () => {
  it('has all expected providers', () => {
    expect(ProviderType.Gmail).toBe('gmail');
    expect(ProviderType.Outlook).toBe('outlook');
    expect(ProviderType.ICloud).toBe('icloud');
    expect(ProviderType.IMAP).toBe('imap');
  });
});

describe('FolderType', () => {
  it('has all expected folder types', () => {
    expect(FolderType.Inbox).toBe('inbox');
    expect(FolderType.Sent).toBe('sent');
    expect(FolderType.Drafts).toBe('drafts');
    expect(FolderType.Trash).toBe('trash');
    expect(FolderType.Spam).toBe('spam');
    expect(FolderType.Archive).toBe('archive');
    expect(FolderType.Other).toBe('other');
  });
});

describe('isProviderSupported', () => {
  it('returns true for supported providers', () => {
    expect(isProviderSupported('gmail')).toBe(true);
    expect(isProviderSupported('outlook')).toBe(true);
    expect(isProviderSupported('icloud')).toBe(true);
    expect(isProviderSupported('imap')).toBe(true);
  });

  it('returns false for unsupported providers', () => {
    expect(isProviderSupported('yahoo')).toBe(false);
    expect(isProviderSupported('')).toBe(false);
  });
});
