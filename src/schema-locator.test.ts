/**
 * Tests for schema-locator
 */

import { findSchemaFile, _resetWarningCacheForTests } from './schema-locator';
import { Vault, TFile } from 'obsidian';

class MockVault implements Partial<Vault> {
  private files: Map<string, TFile> = new Map();

  addFile(path: string): void {
    const file = new TFile();
    file.path = path;
    file.name = path.split('/').pop() ?? '';
    this.files.set(path, file);
  }

  getAbstractFileByPath(path: string): TFile | null {
    return this.files.get(path) ?? null;
  }
}

describe('findSchemaFile', () => {
  let vault: MockVault;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    _resetWarningCacheForTests();
    vault = new MockVault();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('Returns null when no schema exists', () => {
    expect(findSchemaFile(vault as unknown as Vault, 'Projects')).toBeNull();
  });

  test('Finds the flat form in a subfolder', () => {
    vault.addFile('Projects/.schema.yaml');
    expect(findSchemaFile(vault as unknown as Vault, 'Projects')).toEqual({
      schemaPath: 'Projects/.schema.yaml',
      matchAnchor: 'Projects',
      templateAnchor: 'Projects'
    });
  });

  test('Finds the flat form at the vault root', () => {
    vault.addFile('.schema.yaml');
    expect(findSchemaFile(vault as unknown as Vault, '')).toEqual({
      schemaPath: '.schema.yaml',
      matchAnchor: '',
      templateAnchor: ''
    });
  });

  test('Finds the folder form in a subfolder', () => {
    vault.addFile('Projects/.schema/schema.yaml');
    expect(findSchemaFile(vault as unknown as Vault, 'Projects')).toEqual({
      schemaPath: 'Projects/.schema/schema.yaml',
      matchAnchor: 'Projects',
      templateAnchor: 'Projects/.schema'
    });
  });

  test('Finds the folder form at the vault root', () => {
    vault.addFile('.schema/schema.yaml');
    expect(findSchemaFile(vault as unknown as Vault, '')).toEqual({
      schemaPath: '.schema/schema.yaml',
      matchAnchor: '',
      templateAnchor: '.schema'
    });
  });

  test('Folder form wins when both forms are present', () => {
    vault.addFile('Projects/.schema.yaml');
    vault.addFile('Projects/.schema/schema.yaml');
    const result = findSchemaFile(vault as unknown as Vault, 'Projects');
    expect(result?.schemaPath).toBe('Projects/.schema/schema.yaml');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect((warnSpy.mock.calls[0][0] as string).toLowerCase()).toContain('both');
  });

  test('Conflict warning fires only once per directory', () => {
    vault.addFile('A/.schema.yaml');
    vault.addFile('A/.schema/schema.yaml');
    findSchemaFile(vault as unknown as Vault, 'A');
    findSchemaFile(vault as unknown as Vault, 'A');
    findSchemaFile(vault as unknown as Vault, 'A');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test('Treats `/` as the vault root', () => {
    vault.addFile('.schema.yaml');
    expect(findSchemaFile(vault as unknown as Vault, '/')).toEqual({
      schemaPath: '.schema.yaml',
      matchAnchor: '',
      templateAnchor: ''
    });
  });
});
