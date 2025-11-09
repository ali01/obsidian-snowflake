import { matchesExclusionPattern, processExclusionPatterns } from './pattern-matcher';

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
      expect(matchesExclusionPattern('backup/old-data.md', patterns)).toBe(false); // Missing middle directory
    });

    test('Should match directory patterns (ending with /)', () => {
      const patterns = ['Archive/', 'Drafts/'];

      // Files directly under the directory
      expect(matchesExclusionPattern('Archive/old-file.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Drafts/draft.md', patterns)).toBe(true);

      // Files in nested subdirectories
      expect(matchesExclusionPattern('Archive/2023/data.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Drafts/work/notes.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Archive/a/b/c/deep.md', patterns)).toBe(true);

      // Files not under the directory
      expect(matchesExclusionPattern('Current/file.md', patterns)).toBe(false);
      expect(matchesExclusionPattern('Archive-related.md', patterns)).toBe(false);
      expect(matchesExclusionPattern('MyArchive/file.md', patterns)).toBe(false);
    });

    test('Should match nested directory patterns', () => {
      const patterns = ['Projects/Archive/', 'Work/Old/'];

      // Match files in nested directories
      expect(matchesExclusionPattern('Projects/Archive/old.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Work/Old/data.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Projects/Archive/sub/deep.md', patterns)).toBe(true);

      // Don't match files outside the directories
      expect(matchesExclusionPattern('Projects/Current/file.md', patterns)).toBe(false);
      expect(matchesExclusionPattern('Work/New/file.md', patterns)).toBe(false);
      expect(matchesExclusionPattern('Archive/file.md', patterns)).toBe(false);
    });

    test('Should handle mixed patterns (directory and glob)', () => {
      const patterns = ['Archive/', '*.tmp', '**/draft-*'];

      // Directory pattern matches
      expect(matchesExclusionPattern('Archive/file.md', patterns)).toBe(true);
      expect(matchesExclusionPattern('Archive/sub/file.md', patterns)).toBe(true);

      // Glob pattern matches
      expect(matchesExclusionPattern('test.tmp', patterns)).toBe(true);
      expect(matchesExclusionPattern('folder/draft-123.md', patterns)).toBe(true);

      // No match
      expect(matchesExclusionPattern('Current/file.md', patterns)).toBe(false);
    });
  });

  describe('processExclusionPatterns', () => {
    test('Should handle empty input', () => {
      expect(processExclusionPatterns('')).toEqual({
        patterns: [],
        isValid: true,
        errors: []
      });

      expect(processExclusionPatterns('   ')).toEqual({
        patterns: [],
        isValid: true,
        errors: []
      });
    });

    test('Should process valid patterns', () => {
      const input = '*.tmp\nREADME.md\n**/draft-*';
      const result = processExclusionPatterns(input);

      expect(result).toEqual({
        patterns: ['*.tmp', 'README.md', '**/draft-*'],
        isValid: true,
        errors: []
      });
    });

    test('Should normalize patterns', () => {
      const input = '  /pattern.md  \n\n  another.md\n   ';
      const result = processExclusionPatterns(input);

      expect(result).toEqual({
        patterns: ['pattern.md', 'another.md'],
        isValid: true,
        errors: []
      });
    });

    test('Should skip empty lines', () => {
      const input = 'first.md\n\n\nsecond.md\n   \nthird.md';
      const result = processExclusionPatterns(input);

      expect(result).toEqual({
        patterns: ['first.md', 'second.md', 'third.md'],
        isValid: true,
        errors: []
      });
    });

    test('Should detect null characters', () => {
      const input = 'good.md\nbad\0pattern.md\nanother.md';
      const result = processExclusionPatterns(input);

      expect(result).toEqual({
        patterns: ['good.md', 'another.md'],
        isValid: false,
        errors: ['Line 2: Pattern contains invalid null character']
      });
    });

    test('Should handle multiple errors', () => {
      const input = 'test\0.md\n\ngood.md\n\0bad.md';
      const result = processExclusionPatterns(input);

      expect(result).toEqual({
        patterns: ['good.md'],
        isValid: false,
        errors: [
          'Line 1: Pattern contains invalid null character',
          'Line 4: Pattern contains invalid null character'
        ]
      });
    });
  });
});
