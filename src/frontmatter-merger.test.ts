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

      const result = merger.merge(fileContent, templateFrontmatter);

      expect(result.merged).toContain('title: My Note');
      expect(result.merged).toContain('date: 2024-01-01');
      expect(result.merged).toContain('author: John Doe');
      expect(result.merged).toContain('tags:\n  - personal'); // File value preserved
    });

    test('REQ-009: Should preserve file values when keys conflict', () => {
      const fileContent = `---
title: Original Title
author: Original Author
---`;

      const templateFrontmatter = `title: Template Title
author: Template Author
category: Blog`;

      const result = merger.merge(fileContent, templateFrontmatter);

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

      const result = merger.merge(fileContent, templateFrontmatter);

      expect(result.merged).toContain('tags:\n  - daily');
      expect(result.merged).toContain('date: 2024-01-01');
      expect(result.merged).toContain('author: John');
      expect(result.added).toEqual(['tags', 'date', 'author']);
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

      const result = merger.merge(fileContent, templateFrontmatter);

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

      const result = merger.merge(fileContent, templateFrontmatter);

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

      const result = merger.merge(fileContent, templateFrontmatter);

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

      const result = merger.merge(fileContent, templateFrontmatter);

      expect(result.merged).toContain('title: New Note');
      expect(result.merged).toContain('tags:\n  - template');
      expect(result.added).toEqual(['title', 'tags']);
      expect(result.conflicts).toEqual([]);
    });

    test('Should handle empty template frontmatter', () => {
      const fileContent = `---
title: My Note
---`;
      const templateFrontmatter = '';

      const result = merger.merge(fileContent, templateFrontmatter);

      expect(result.merged).toContain('title: My Note');
      expect(result.added).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    test('Should handle both empty frontmatters', () => {
      const fileContent = 'No frontmatter';
      const templateFrontmatter = '';

      const result = merger.merge(fileContent, templateFrontmatter);

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

      const result = merger.merge(fileContent, templateFrontmatter);

      expect(result.merged).toContain('published: false');
      expect(result.merged).toContain('draft: true');
    });

    test('Should handle numeric values', () => {
      const fileContent = `---
version: 1.5
---`;
      const templateFrontmatter = 'revision: 3\nversion: 2.0';

      const result = merger.merge(fileContent, templateFrontmatter);

      expect(result.merged).toContain('version: 1.5');
      expect(result.merged).toContain('revision: 3');
    });

    test('Should handle null values', () => {
      const fileContent = `---
author: null
---`;
      const templateFrontmatter = 'reviewer: null\nauthor: John';

      const result = merger.merge(fileContent, templateFrontmatter);

      expect(result.merged).toContain('author: null');
      expect(result.merged).toContain('reviewer: null');
    });

    test('Should handle array values', () => {
      const fileContent = `---
tags: [one, two]
---`;
      const templateFrontmatter = 'categories: [blog, tech]\ntags: [three, four]';

      const result = merger.merge(fileContent, templateFrontmatter);

      expect(result.merged).toContain('tags:\n  - one\n  - two');
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

      const result = merger.merge(fileContent, templateFrontmatter);

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

      expect(result).toBe('---\ntitle: New Note\n---\n\n# Just content');
    });

    test('Should handle empty file content', () => {
      const fileContent = '';
      const mergedFrontmatter = 'title: Empty\n';

      const result = merger.applyToFile(fileContent, mergedFrontmatter);

      expect(result).toBe('---\ntitle: Empty\n---\n\n');
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

      const result = merger.merge(fileContent, templateFrontmatter);

      expect(result.merged).toContain('time: "10:30"');
      expect(result.merged).toContain('url: "https://example.com"');
    });

    test('Should handle quoted strings', () => {
      const fileContent = `---
title: "Title with: Special Characters"
---`;
      const templateFrontmatter = 'subtitle: "Another: Title"';

      const result = merger.merge(fileContent, templateFrontmatter);

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

      const result = merger.merge(fileContent, templateFrontmatter);

      // File values should be preserved
      expect(result.merged).toContain('title: My Project Note');
      expect(result.merged).toContain('author: John Doe');
      expect(result.merged).toContain('tags:\n  - project\n  - important');
      expect(result.merged).toContain('status: in-progress');

      // Template-only values should be added
      expect(result.merged).toContain('category: Projects');
      expect(result.merged).toContain('template: project-template');
      expect(result.merged).toContain('priority: medium');

      // Check tracking
      expect(result.conflicts.sort()).toEqual(['author', 'status', 'tags', 'title']);
      expect(result.added.sort()).toEqual(['category', 'priority', 'template']);
    });
  });
});
