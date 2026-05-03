/**
 * Tests for schema-locator
 */

import { findSchemaFile, _resetWarningCacheForTests } from './schema-locator';
import type { Vault } from 'obsidian';

class MockVault {
  private files: Set<string> = new Set();

  public adapter = {
    exists: async (path: string): Promise<boolean> => this.files.has(path)
  };

  addFile(path: string): void {
    this.files.add(path);
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

  test('Returns null when no schema exists', async () => {
    expect(await findSchemaFile(vault as unknown as Vault, 'Projects')).toBeNull();
  });

  test('Finds the flat YAML form in a subfolder', async () => {
    vault.addFile('Projects/.schema.yaml');
    expect(await findSchemaFile(vault as unknown as Vault, 'Projects')).toEqual({
      schemaPath: 'Projects/.schema.yaml',
      matchAnchor: 'Projects',
      templateAnchor: 'Projects'
    });
  });

  test('Finds the flat YAML form at the vault root', async () => {
    vault.addFile('.schema.yaml');
    expect(await findSchemaFile(vault as unknown as Vault, '')).toEqual({
      schemaPath: '.schema.yaml',
      matchAnchor: '',
      templateAnchor: ''
    });
  });

  test('Finds the folder form in a subfolder', async () => {
    vault.addFile('Projects/.schema/schema.yaml');
    expect(await findSchemaFile(vault as unknown as Vault, 'Projects')).toEqual({
      schemaPath: 'Projects/.schema/schema.yaml',
      matchAnchor: 'Projects',
      templateAnchor: 'Projects/.schema'
    });
  });

  test('Finds the folder form at the vault root', async () => {
    vault.addFile('.schema/schema.yaml');
    expect(await findSchemaFile(vault as unknown as Vault, '')).toEqual({
      schemaPath: '.schema/schema.yaml',
      matchAnchor: '',
      templateAnchor: '.schema'
    });
  });

  test('Folder form wins over flat YAML when both are present', async () => {
    vault.addFile('Projects/.schema.yaml');
    vault.addFile('Projects/.schema/schema.yaml');
    const result = await findSchemaFile(vault as unknown as Vault, 'Projects');
    expect(result?.schemaPath).toBe('Projects/.schema/schema.yaml');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test('Conflict warning fires only once per directory', async () => {
    vault.addFile('A/.schema.yaml');
    vault.addFile('A/.schema/schema.yaml');
    await findSchemaFile(vault as unknown as Vault, 'A');
    await findSchemaFile(vault as unknown as Vault, 'A');
    await findSchemaFile(vault as unknown as Vault, 'A');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test('Treats `/` as the vault root', async () => {
    vault.addFile('.schema.yaml');
    expect(await findSchemaFile(vault as unknown as Vault, '/')).toEqual({
      schemaPath: '.schema.yaml',
      matchAnchor: '',
      templateAnchor: ''
    });
  });
});
