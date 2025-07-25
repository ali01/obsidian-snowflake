# Implementation Plan: "delete" Property Feature
# STATUS: IMPLEMENTED

## Overview

This document outlines the implementation plan for adding the "delete" property feature to the Snowflake plugin. This feature allows templates to exclude specific properties from inheritance by listing them in a special "delete" frontmatter property.

## Requirements Summary

- **REQ-034**: Templates can have `delete: [prop1, prop2]` to exclude properties from inheritance
- **REQ-035**: Exclusions cascade but can be overridden by explicit redefinition
- **REQ-036**: The "delete" property itself must not appear in final files
- **REQ-037**: Explicit definitions in a template override its own delete list

## Architecture Analysis

### Current Flow
1. `TemplateApplicator.mergeTemplates()` handles template inheritance
2. Templates are merged from root to leaf using `FrontmatterMerger.mergeFrontmatter()`
3. Each merge preserves file values over template values (except arrays which concatenate)

### Key Insight
The edge case (property deleted then re-added) is naturally handled if we:
1. Apply delete exclusions AFTER merging at each step
2. Only exclude properties that aren't explicitly defined in the current template

## Implementation Strategy

### Phase 1: Data Structure Updates

#### New Type Definitions (in `types.ts`)
```typescript
interface DeleteListProcessingResult {
  // The frontmatter content after delete list processing
  processedContent: string;
  // Properties that were excluded
  excludedProperties: string[];
  // The delete list from this template (if any)
  deleteList: string[] | delete;
}
```

### Phase 2: Core Implementation

#### 1. Modify `FrontmatterMerger` class

**New Method**: `extractDeleteList(frontmatterContent: string): string[] | delete`
- Parses frontmatter to extract the "delete" property value
- Returns array of property names or delete if not present
- Uses existing YAML parsing logic

**New Method**: `applyDeleteList(frontmatterContent: string, deleteList: string[]): string`
- Takes parsed frontmatter and a delete list
- Removes properties that are in the delete list
- Always removes the "delete" property itself
- Returns cleaned frontmatter

**Modify**: `mergeFrontmatter()` method signature
- Add optional parameter: `previousDeleteList?: string[]`
- This tracks cumulative exclusions from parent templates

#### 2. Modify `TemplateApplicator` class

**Update**: `mergeTemplates()` method
- Track cumulative delete list through the merge chain
- Apply delete exclusions after each merge step
- Ensure "delete" property is removed from final result

### Phase 3: Detailed Algorithm

#### Template Merge Algorithm with Delete Lists

1. **Initialize**
   - Start with empty accumulated frontmatter
   - Start with empty cumulative delete list

2. **For each template in chain (root to leaf)**:
   a. Split template into frontmatter and body

   b. Extract delete list from current template's frontmatter

   c. Merge frontmatter:
      - Use existing merge logic (incoming overrides base)
      - Arrays concatenate as before

   d. Apply exclusions:
      - Remove properties that are in cumulative delete list
      - BUT keep properties explicitly defined in current template

   e. Update cumulative delete list:
      - Add current template's delete list items
      - Remove items that are explicitly defined in current template

   f. Remove "delete" property from merged result

3. **Final cleanup**
   - Ensure "delete" property is not in final frontmatter
   - Return merged content

#### Example Walkthrough

Template A:
```yaml
author: John
date: 2024-01-01
tags: [base]
```

Template B (inherits A):
```yaml
delete: [author, tags]
category: blog
```

Template C (inherits B):
```yaml
author: Jane
tags: [specific]
```

**Processing Steps:**

1. Start with Template A
   - Accumulated: `author: John, date: 2024-01-01, tags: [base]`
   - Cumulative delete: `[]`

2. Merge Template B
   - After merge: `author: John, date: 2024-01-01, tags: [base], category: blog, delete: [author, tags]`
   - Apply exclusions: Remove `author` and `tags` (they're in B's delete list and not defined in B)
   - Result: `date: 2024-01-01, category: blog`
   - Update cumulative delete: `[author, tags]`

3. Merge Template C
   - After merge: `date: 2024-01-01, category: blog, author: Jane, tags: [specific]`
   - Apply exclusions: Would exclude based on cumulative delete, BUT `author` and `tags` are explicitly defined in C, so they stay
   - Remove "delete" property
   - Final: `date: 2024-01-01, category: blog, author: Jane, tags: [specific]`

### Phase 4: Testing Strategy

#### Test Cases to Add

1. **Basic Delete List** (`frontmatter-merger.test.ts`)
   - Template with delete list excludes properties
   - Verify "delete" property itself is removed

2. **Delete List with Explicit Override** (`frontmatter-merger.test.ts`)
   - Template has both `tags: [mine]` and `delete: [tags]`
   - Verify `tags: [mine]` is kept

3. **Inheritance Chain with Delete** (`template-applicator.test.ts`)
   - Three-level inheritance matching the example
   - Verify correct exclusion and re-addition

4. **Array Handling** (`template-applicator.test.ts`)
   - Delete list with array properties
   - Ensure arrays are fully excluded, not just emptied

5. **Edge Cases** (`frontmatter-merger.test.ts`)
   - Empty delete list: `delete: []`
   - Invalid delete list: `delete: "not-an-array"`
   - Delete list with non-existent properties

### Phase 5: Implementation Order

1. **Add type definitions** in `types.ts`
2. **Implement `extractDeleteList()`** in `FrontmatterMerger`
3. **Implement `applyDeleteList()`** in `FrontmatterMerger`
4. **Add tests** for new methods
5. **Update `mergeTemplates()`** in `TemplateApplicator`
6. **Add integration tests** for full inheritance chain
7. **Run all tests** to ensure no regressions

## Success Criteria

1. All new tests pass
2. All existing tests continue to pass
3. The edge case (delete then re-add) works correctly
4. "delete" property never appears in final files
5. No performance regression in template application

## Notes

- This implementation leverages the existing merge order (root to leaf) to naturally handle the inheritance
- The key insight is that exclusions are cumulative but can be overridden by explicit redefinition
- We're modifying the merge process minimally to maintain compatibility
