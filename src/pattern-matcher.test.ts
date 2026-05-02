import { matchesExclusionPattern, matchesGlob, globToRegex } from './pattern-matcher';

describe('PatternMatcher', () => {
  describe('matchesExclusionPattern', () => {
    test('Should return false for empty patterns', () => {
      expect(matchesExclusionPattern('test.md', [])).toBe(false);
      expect(matchesExclusionPattern('test.md', null as any)).toBe(false);
      expect(matchesExclusionPattern('test.md', undefined as any)).toBe(false);
    });

    test('Should match exact filenames', () => {
      const patterns = ['README.md', 'index.md'];

      expect(matchesExclusionPattern('README.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('index.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('other.md', patterns)).toBe(false);
    });

    test('Should match with single asterisk wildcard', () => {
      const patterns = ['*.tmp', 'draft-*', '*-backup.md'];

      expect(matchesExclusionPattern('file.tmp', patterns)).toBe(true);
      expect(matchesExclusionPattern('draft-123.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('old-backup.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('file.md', patterns)).toBe(false);
    });

    test('Should match with question mark wildcard', () => {
      const patterns = ['test?.md', '???.txt'];

      expect(matchesExclusionPattern('test1.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('testA.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('test12.md', patterns)).toBe(false);
      expect(matchesExclusionPattern('abc.txt', patterns)).toBe(true);
      expect(matchesExclusionPattern('abcd.txt', patterns)).toBe(false);
    });

    test('Should match with double asterisk for directories', () => {
      const patterns = ['**/README.md', 'archive/**', '**/draft-*'];

      expect(matchesExclusionPattern('folder/README.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('a/b/c/README.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('archive/file.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('archive/sub/deep/file.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('folder/draft-123.md', patterns)).toBe(true);
    });

    test('Should match against basename when path provided', () => {
      const patterns = ['README.md'];

      expect(matchesExclusionPattern('folder/README.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('deep/nested/README.md', patterns)).toBe(true);
    });

    test('Should handle empty patterns in array', () => {
      const patterns = ['', '  ', 'valid.md'];

      expect(matchesExclusionPattern('valid.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('other.md', patterns)).toBe(false);
    });

    test('Should handle complex patterns', () => {
      const patterns = ['**/test-*.tmp', 'backup/*/old-*'];

      expect(matchesExclusionPattern('folder/test-123.tmp', patterns)).toBe(true);
      expect(matchesExclusionPattern('backup/2024/old-data.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('backup/old-data.md', patterns)).toBe(false);
    });

    test('Should match directory patterns (ending with /)', () => {
      const patterns = ['Archive/', 'Drafts/'];

      expect(matchesExclusionPattern('Archive/old-file.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Drafts/draft.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Archive/2023/data.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Drafts/work/notes.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Archive/a/b/c/deep.md', patterns)).toBe(true);

      expect(matchesExclusionPattern('Current/file.md', patterns)).toBe(false);
      expect(matchesExclusionPattern('Archive-related.md', patterns)).toBe(false);
      expect(matchesExclusionPattern('MyArchive/file.md', patterns)).toBe(false);
    });

    test('Should match nested directory patterns', () => {
      const patterns = ['Projects/Archive/', 'Work/Old/'];

      expect(matchesExclusionPattern('Projects/Archive/old.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Work/Old/data.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Projects/Archive/sub/deep.md', patterns)).toBe(true);

      expect(matchesExclusionPattern('Projects/Current/file.md', patterns)).toBe(false);
      expect(matchesExclusionPattern('Work/New/file.md', patterns)).toBe(false);
      expect(matchesExclusionPattern('Archive/file.md', patterns)).toBe(false);
    });

    test('Should handle mixed patterns (directory and glob)', () => {
      const patterns = ['Archive/', '*.tmp', '**/draft-*'];

      expect(matchesExclusionPattern('Archive/file.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Archive/sub/file.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('test.tmp', patterns)).toBe(true);
      expect(matchesExclusionPattern('folder/draft-123.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Current/file.md', patterns)).toBe(false);
    });
  });

  describe('matchesGlob', () => {
    test('Should match exactly the full string', () => {
      expect(matchesGlob('Web/App/note.md', 'Web/**')).toBe(true);
      expect(matchesGlob('Web/App/note.md', 'Web/*')).toBe(false);
      expect(matchesGlob('Web/note.md', 'Web/*')).toBe(true);
    });

    test('Should respect star vs double-star semantics', () => {
      expect(matchesGlob('a/b/c.md', '*.md')).toBe(false); // single * stops at /
      expect(matchesGlob('c.md', '*.md')).toBe(true);
      expect(matchesGlob('a/b/c.md', '**/*.md')).toBe(true);
    });

    test('Should return false for empty pattern', () => {
      expect(matchesGlob('any.md', '')).toBe(false);
      expect(matchesGlob('any.md', '   ')).toBe(false);
    });
  });

  describe('globToRegex', () => {
    test('Anchors the pattern to the full string', () => {
      const re = globToRegex('foo*.md');
      expect(re.test('foo123.md')).toBe(true);
      expect(re.test('xfoo123.md')).toBe(false);
      expect(re.test('foo.mdx')).toBe(false);
    });
  });
});
