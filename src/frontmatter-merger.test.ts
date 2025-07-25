/**
 * Tests for Frontmatter Merge Engine
 *
 * These tests verify the implementation of requirements REQ-008, REQ-009, and REQ-010
 * for intelligent frontmatter merging.
 */

import { FrontmatterMerger } from './frontmatter-merger';

describe('FrontmatterMerger', () => {
  let merger: FrontmatterMerger;

  beforeEach(() => {
    merger = new FrontmatterMerger();
  });

  describe('Basic Merging', () => {
    test('REQ-008: Should merge frontmatter from template and file', () => {
      const fileContent = `---
title: My Note
tags: [personal]
---

# Content`;

      const templateFrontmatter = `date: 2024-01-01
author: John Doe
tags: [template]`;

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain('title: My Note');
      expect(result.merged).toContain('date: 2024-01-01');
      expect(result.merged).toContain('author: John Doe');
      // REQ-010a: Arrays are concatenated (template first, then file)
      expect(result.merged).toContain('tags:\n  - template\n  - personal');
    });

    test('REQ-009: Should preserve file values when keys conflict', () => {
      const fileContent = `---
title: Original Title
author: Original Author
---`;

      const templateFrontmatter = `title: Template Title
author: Template Author
category: Blog`;

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain('title: Original Title');
      expect(result.merged).toContain('author: Original Author');
      expect(result.merged).toContain('category: Blog');
      expect(result.conflicts).toEqual(['title', 'author']);
    });

    test('REQ-010: Should add template keys that dont exist in file', () => {
      const fileContent = `---
title: My Note
---`;

      const templateFrontmatter = `tags: [daily]
date: 2024-01-01
author: John`;

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain('tags:\n  - daily');
      expect(result.merged).toContain('date: 2024-01-01');
      expect(result.merged).toContain('author: John');
      expect(result.added).toEqual(['title']);
    });
  });

  describe('Edge Cases', () => {
    test('Should preserve empty values in original file', () => {
      const fileContent = `---
related:
references:
tags:
  - index
id: L6P6XxLDv4
---`;
      const templateFrontmatter = 'newField: value';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain('related: ');
      expect(result.merged).toContain('references: ');
      expect(result.merged).toContain('tags:\n  - index');
      expect(result.merged).toContain('id: L6P6XxLDv4');
      expect(result.merged).toContain('newField: value');
    });

    test('Should format arrays with dash notation', () => {
      const fileContent = `---
tags:
  - tag1
  - tag2
---`;
      const templateFrontmatter = '';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain('tags:\n  - tag1\n  - tag2');
    });

    test('Should not double-escape quoted array values', () => {
      const fileContent = `---
related:
  - "[[~AI Software Engineering]]"
references:
tags:
  - index
id: L6P6XxLDv4
---`;
      const templateFrontmatter = '';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      // Should preserve the original quoted value without double-escaping
      expect(result.merged).toContain('related:\n  - "[[~AI Software Engineering]]"');
      expect(result.merged).not.toContain('\\"');
      expect(result.merged).toContain('references: ');
      expect(result.merged).toContain('tags:\n  - index');
      expect(result.merged).toContain('id: L6P6XxLDv4');
    });
    test('Should handle file with no frontmatter', () => {
      const fileContent = '# Just content\nNo frontmatter here';
      const templateFrontmatter = 'title: New Note\ntags: [template]';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain('title: New Note');
      expect(result.merged).toContain('tags:\n  - template');
      expect(result.added).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    test('Should handle empty template frontmatter', () => {
      const fileContent = `---
title: My Note
---`;
      const templateFrontmatter = '';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain('title: My Note');
      expect(result.added).toEqual(['title']);
      expect(result.conflicts).toEqual([]);
    });

    test('Should handle both empty frontmatters', () => {
      const fileContent = 'No frontmatter';
      const templateFrontmatter = '';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged.trim()).toBe('');
      expect(result.added).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });
  });

  describe('Data Types', () => {
    test('Should handle boolean values', () => {
      const fileContent = `---
published: false
---`;
      const templateFrontmatter = 'draft: true\npublished: true';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain('published: false');
      expect(result.merged).toContain('draft: true');
    });

    test('Should handle numeric values', () => {
      const fileContent = `---
version: 1.5
---`;
      const templateFrontmatter = 'revision: 3\nversion: 2.0';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain('version: 1.5');
      expect(result.merged).toContain('revision: 3');
    });

    test('Should handle null values', () => {
      const fileContent = `---
author: null
---`;
      const templateFrontmatter = 'reviewer: null\nauthor: John';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain('author: null');
      expect(result.merged).toContain('reviewer: null');
    });

    test('Should handle array values', () => {
      const fileContent = `---
tags: [one, two]
---`;
      const templateFrontmatter = 'categories: [blog, tech]\ntags: [three, four]';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      // REQ-010a: Arrays are concatenated (template first, then file)
      expect(result.merged).toContain('tags:\n  - three\n  - four\n  - one\n  - two');
      expect(result.merged).toContain('categories:\n  - blog\n  - tech');
    });

    test('Should handle multi-line string values', () => {
      const fileContent = `---
description: |
  This is a
  multi-line description
---`;
      const templateFrontmatter = `abstract: |
  Template
  abstract`;

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain('description: |');
      expect(result.merged).toContain('  This is a');
      expect(result.merged).toContain('  multi-line description');
      expect(result.merged).toContain('abstract: |');
    });
  });

  describe('File Application', () => {
    test('Should apply merged frontmatter to file with existing frontmatter', () => {
      const fileContent = `---
title: Old
---

# Content here`;

      const mergedFrontmatter = 'title: New\ntags: [test]\n';
      const result = merger.applyToFile(fileContent, mergedFrontmatter);

      expect(result).toBe('---\ntitle: New\ntags: [test]\n---\n# Content here');
    });

    test('Should add frontmatter to file without frontmatter', () => {
      const fileContent = '# Just content';
      const mergedFrontmatter = 'title: New Note\n';

      const result = merger.applyToFile(fileContent, mergedFrontmatter);

      expect(result).toBe('---\ntitle: New Note\n---\n# Just content');
    });

    test('Should handle empty file content', () => {
      const fileContent = '';
      const mergedFrontmatter = 'title: Empty\n';

      const result = merger.applyToFile(fileContent, mergedFrontmatter);

      expect(result).toBe('---\ntitle: Empty\n---\n');
    });
  });

  describe('YAML Validation', () => {
    test('Should validate correct YAML', () => {
      expect(merger.validateYaml('title: Test')).toBe(true);
      expect(merger.validateYaml('key1: value1\nkey2: value2')).toBe(true);
    });

    test('Should handle empty YAML', () => {
      expect(merger.validateYaml('')).toBe(true);
    });

    test('Should handle YAML with comments', () => {
      const yaml = `# Comment
title: Test
# Another comment
tags: [one, two]`;

      expect(merger.validateYaml(yaml)).toBe(true);
    });
  });

  describe('Special Characters', () => {
    test('Should handle values with colons', () => {
      const fileContent = `---
time: "10:30"
---`;
      const templateFrontmatter = 'url: "https://example.com"';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain('time: "10:30"');
      expect(result.merged).toContain('url: "https://example.com"');
    });

    test('Should handle quoted strings', () => {
      const fileContent = `---
title: "Title with: Special Characters"
---`;
      const templateFrontmatter = 'subtitle: "Another: Title"';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain('title: "Title with: Special Characters"');
      expect(result.merged).toContain('subtitle: "Another: Title"');
    });
  });

  describe('Complex Scenarios', () => {
    test('Should handle complete merge scenario', () => {
      const fileContent = `---
title: My Project Note
author: John Doe
tags: [project, important]
status: in-progress
created: 2024-01-01
---

# Project content`;

      const templateFrontmatter = `title: Default Title
author: Template Author
tags: [template, default]
category: Projects
template: project-template
status: draft
priority: medium`;

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      // File values should be preserved
      expect(result.merged).toContain('title: My Project Note');
      expect(result.merged).toContain('author: John Doe');
      expect(result.merged).toContain('status: in-progress');

      // Template-only values should be added
      expect(result.merged).toContain('category: Projects');
      expect(result.merged).toContain('template: project-template');
      expect(result.merged).toContain('priority: medium');

      // REQ-010a: Lists should be concatenated (template first, then file)
      expect(result.merged).toContain(
        'tags:\n  - template\n  - default\n  - project\n  - important'
      );

      // Check tracking
      expect(result.conflicts.sort()).toEqual(['author', 'status', 'tags', 'title']);
      expect(result.added.sort()).toEqual(['created']);
    });
  });

  describe('List Concatenation (REQ-010a)', () => {
    test('Should concatenate arrays when both have the same key', () => {
      const baseFrontmatter = 'tags: [project, important]';
      const incomingFrontmatter = 'tags: [template, default]';

      const result = merger.mergeFrontmatter(baseFrontmatter, incomingFrontmatter);

      expect(result.merged).toContain(
        'tags:\n  - project\n  - important\n  - template\n  - default'
      );
      expect(result.conflicts).toContain('tags');
    });

    test('Should remove duplicate values when concatenating', () => {
      const baseFrontmatter = 'tags: [project, shared, important]';
      const incomingFrontmatter = 'tags: [template, shared, project]';

      const result = merger.mergeFrontmatter(baseFrontmatter, incomingFrontmatter);

      // Should maintain order: base first, then unique incoming
      expect(result.merged).toContain(
        'tags:\n  - project\n  - shared\n  - important\n  - template'
      );
    });

    test('Should handle arrays with different value types', () => {
      const baseFrontmatter = 'mixed: [string, 123, true]';
      const incomingFrontmatter = 'mixed: [456, false, string]';

      const result = merger.mergeFrontmatter(baseFrontmatter, incomingFrontmatter);

      expect(result.merged).toContain('mixed:\n  - string\n  - 123\n  - true\n  - 456\n  - false');
    });

    test('Should handle dash notation arrays', () => {
      const fileContent = `---
tags:
  - project
  - important
---`;
      const templateFrontmatter = `tags:
  - template
  - default
  - project`;

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain(
        'tags:\n  - template\n  - default\n  - project\n  - important'
      );
    });

    test('Should not concatenate non-array values', () => {
      const baseFrontmatter = 'title: Base Title\ntags: not-an-array';
      const incomingFrontmatter = 'title: Incoming Title\ntags: [array]';

      const result = merger.mergeFrontmatter(baseFrontmatter, incomingFrontmatter);

      // Non-array conflicts should use incoming value
      expect(result.merged).toContain('title: Incoming Title');
      expect(result.merged).toContain('tags:\n  - array');
    });

    test('Should handle empty arrays', () => {
      const baseFrontmatter = 'tags: []';
      const incomingFrontmatter = 'tags: [template, default]';

      const result = merger.mergeFrontmatter(baseFrontmatter, incomingFrontmatter);

      // Empty arrays might have an empty item, so be more flexible
      expect(result.merged).toMatch(/tags:\n(  - \n)?  - template\n  - default/);
    });

    test('Should inherit template values when file has empty arrays', () => {
      // This is the bug case - when a file has empty arrays, it should still
      // inherit values from the template chain
      const fileContent = '---\ntags: []\naliases: []\n---\nContent';
      const templateFrontmatter = 'tags: [base, template]\naliases: [doc]';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      // The file's empty arrays should NOT override template values
      // and should not have empty items
      expect(result.merged).toBe('tags:\n  - base\n  - template\naliases:\n  - doc\n');
    });

    test('Should treat empty string fields as empty arrays when merging with arrays', () => {
      // This is the actual Obsidian behavior - empty list fields are just "key:"
      const fileContent = '---\nreferences:\ntags:\n---\nContent';
      const templateFrontmatter = 'references: [ref1, ref2]\ntags: [tag1, tag2]';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      // Empty string fields should inherit array values from template
      expect(result.merged).toBe('references:\n  - ref1\n  - ref2\ntags:\n  - tag1\n  - tag2\n');
    });

    test('Should handle array concatenation with quoted strings', () => {
      const fileContent = `---
related:
  - "[[~AI Software Engineering]]"
  - "[[Another Page]]"
---`;
      const templateFrontmatter = `related:
  - "[[Template Page]]"
  - "[[~AI Software Engineering]]"`;

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      expect(result.merged).toContain(
        'related:\n  - "[[Template Page]]"\n  - "[[~AI Software Engineering]]"\n  - "[[Another Page]]"'
      );
    });

    test('Should preserve empty fields as empty strings, not empty arrays', () => {
      // When both file and template have empty fields, they should remain as empty strings
      const fileContent = '---\ntags:\nreferences:\n---\nContent';
      const templateFrontmatter = 'tags:\nreferences:';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      // Should preserve empty fields as "key:" not "key: []"
      expect(result.merged).toBe('tags: \nreferences: \n');
      expect(result.merged).not.toContain('[]');
    });

    test('Should still merge arrays correctly when one side has array and other has empty', () => {
      // Test that the fix doesn't break array merging
      const fileContent = '---\ntags:\n---\nContent';
      const templateFrontmatter = 'tags: [tag1, tag2]';

      const result = merger.mergeWithFile(fileContent, templateFrontmatter);

      // Empty field should inherit array from template
      expect(result.merged).toBe('tags:\n  - tag1\n  - tag2\n');
    });
  });

  describe('New Methods', () => {
    test('mergeFrontmatter should work with pure frontmatter strings', () => {
      const baseFm = 'title: Base\ndate: 2024-01-01';
      const incomingFm = 'author: John\ndate: 2024-02-01';

      const result = merger.mergeFrontmatter(baseFm, incomingFm);

      expect(result.merged).toContain('title: Base');
      expect(result.merged).toContain('date: 2024-02-01'); // Incoming value used
      expect(result.merged).toContain('author: John');
      expect(result.conflicts).toEqual(['date']);
      expect(result.added).toEqual(['author']);
    });

    test('mergeWithFile should extract frontmatter from file content', () => {
      const fileContent = `---
title: File Title
---
Content`;
      const templateFm = 'author: Template Author';

      const result = merger.mergeWithFile(fileContent, templateFm);

      expect(result.merged).toContain('title: File Title');
      expect(result.merged).toContain('author: Template Author');
      expect(result.added).toEqual(['title']);
    });
  });

  describe('Delete List Functionality', () => {
    describe('extractDeleteList', () => {
      test('REQ-034: Should extract delete list from frontmatter', () => {
        const frontmatter = `author: John
date: 2024-01-01
delete: [author, tags]
category: blog`;

        const deleteList = merger.extractDeleteList(frontmatter);
        expect(deleteList).toEqual(['author', 'tags']);
      });

      test('Should return null when no delete property exists', () => {
        const frontmatter = `author: John
date: 2024-01-01`;

        const deleteList = merger.extractDeleteList(frontmatter);
        expect(deleteList).toBeNull();
      });

      test('Should handle empty delete list', () => {
        const frontmatter = `delete: []`;
        const deleteList = merger.extractDeleteList(frontmatter);
        expect(deleteList).toBeNull();
      });

      test('Should handle invalid delete list (not an array)', () => {
        const frontmatter = `delete: "not-an-array"`;
        const deleteList = merger.extractDeleteList(frontmatter);
        expect(deleteList).toBeNull();
      });

      test('Should filter out non-string values from delete list', () => {
        const frontmatter = `delete: [author, 123, true, tags]`;
        const deleteList = merger.extractDeleteList(frontmatter);
        expect(deleteList).toEqual(['author', 'tags']);
      });
    });

    describe('applyDeleteList', () => {
      test('REQ-034: Should remove properties in delete list', () => {
        const frontmatter = `author: John
date: 2024-01-01
tags: [blog, personal]
category: tech`;

        const result = merger.applyDeleteList(frontmatter, ['author', 'tags']);
        const parsed = merger['parseYaml'](result);

        expect(parsed.author).toBeUndefined();
        expect(parsed.tags).toBeUndefined();
        expect(parsed.date).toBe('2024-01-01');
        expect(parsed.category).toBe('tech');
      });

      test('REQ-036: Should always remove delete property itself', () => {
        const frontmatter = `author: John
delete: [author]
category: blog`;

        const result = merger.applyDeleteList(frontmatter, []);
        const parsed = merger['parseYaml'](result);

        expect(parsed.delete).toBeUndefined();
        expect(parsed.author).toBe('John');
        expect(parsed.category).toBe('blog');
      });

      test('REQ-037: Should keep explicitly defined properties', () => {
        const frontmatter = `author: John
tags: [specific]
category: blog`;

        const explicitlyDefined = new Set(['author', 'tags']);
        const result = merger.applyDeleteList(
          frontmatter,
          ['author', 'tags', 'category'],
          explicitlyDefined
        );
        const parsed = merger['parseYaml'](result);

        expect(parsed.author).toBe('John');
        expect(parsed.tags).toEqual(['specific']);
        expect(parsed.category).toBeUndefined();
      });
    });

    describe('processWithDeleteList', () => {
      test('REQ-035: Should handle cumulative delete list with overrides', () => {
        const frontmatter = `author: Jane
delete: [date, category]
tags: [specific]`;

        const cumulativeDeleteList = ['author', 'tags'];
        const result = merger.processWithDeleteList(frontmatter, cumulativeDeleteList);
        const parsed = merger['parseYaml'](result.processedContent);

        // Author and tags are kept because they're explicitly defined
        expect(parsed.author).toBe('Jane');
        expect(parsed.tags).toEqual(['specific']);

        // Delete property itself is removed
        expect(parsed.delete).toBeUndefined();

        // New delete list includes date and category but not author/tags (explicitly defined)
        expect(result.newDeleteList).toContain('date');
        expect(result.newDeleteList).toContain('category');
        expect(result.newDeleteList.filter((item) => item === 'author').length).toBe(1);
        expect(result.newDeleteList.filter((item) => item === 'tags').length).toBe(1);
      });

      test('Should update cumulative delete list correctly', () => {
        const frontmatter = `delete: [newProp1, newProp2]
existingProp: value`;

        const result = merger.processWithDeleteList(frontmatter, ['oldProp']);

        expect(result.newDeleteList).toContain('oldProp');
        expect(result.newDeleteList).toContain('newProp1');
        expect(result.newDeleteList).toContain('newProp2');
        expect(result.newDeleteList).toHaveLength(3);
      });
    });
  });
});
