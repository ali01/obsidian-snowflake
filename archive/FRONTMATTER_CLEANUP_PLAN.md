# Frontmatter Cleanup Implementation Plan
STATUS: IMPLEMENTED

## Requirement Overview (REQ-038)
When applying a template chain to an existing file, if the file has properties that:
1. Were NOT added as part of the template chain, AND
2. Are empty (have no values)

Then Snowflake shall remove those properties.

## Current Architecture Analysis

### Key Components
1. **TemplateApplicator** (`src/template-applicator.ts`)
   - Orchestrates template application
   - Handles template chain loading and merging
   - Calls FrontmatterMerger for frontmatter processing

2. **FrontmatterMerger** (`src/frontmatter-merger.ts`)
   - Handles intelligent frontmatter merging
   - Already tracks which properties come from templates vs files
   - Manages property precedence and list concatenation

3. **Template Chain Processing**
   - Templates are loaded and merged in order (parent → child)
   - Each template's properties are accumulated
   - Delete lists are already handled for property exclusion

## Implementation Strategy

### Core Approach
Track template-provided properties throughout the merge process and clean up empty properties that don't originate from templates.

### Detailed Steps

#### Step 1: Track Template Properties
- Modify `FrontmatterMerger` to maintain a set of all properties provided by templates
- This includes properties from all templates in the inheritance chain
- Account for properties that might be excluded by delete lists

#### Step 2: Identify Empty Properties
- After merging, parse the final frontmatter
- Identify properties with empty values:
  - Empty string (`""` or whitespace only)
  - Null values
  - Empty arrays (`[]`)
  - Note: Do NOT consider `false` or `0` as empty

#### Step 3: Implement Cleanup Logic
- Create a new method in `FrontmatterMerger`: `cleanupEmptyProperties`
- This method will:
  1. Parse the merged frontmatter
  2. Identify empty properties
  3. Remove properties that are empty AND not from templates
  4. Return cleaned frontmatter

#### Step 4: Integrate into Application Flow
- Modify `TemplateApplicator.applyProcessedTemplate` to:
  1. Track template properties during merge
  2. Apply cleanup after frontmatter merge
  3. Ensure cleanup happens before final file write

## Implementation Details

### 1. Modify FrontmatterMerger Interface
```typescript
interface MergeContext {
  templateProperties: Set<string>;  // All properties from templates
  mergedContent: string;           // The merged frontmatter
}
```

### 2. Update Merge Methods
- `mergeFrontmatter`: Track properties from both inputs
- `mergeWithFile`: Pass template properties to merge context
- `mergeWithDeleteList`: Maintain property tracking through delete list processing

### 3. Add Cleanup Method
```typescript
public cleanupEmptyProperties(
  frontmatterContent: string,
  templateProperties: Set<string>
): string
```

### 4. Define "Empty" Values
- Empty string: `""` or whitespace only
- Null: `null`
- Empty array: `[]`
- NOT empty: `false`, `0`, `undefined` (undefined means property doesn't exist)

### 5. Update TemplateApplicator
- Modify `processFrontmatter` to get template properties from merge
- Apply cleanup before returning processed content
- Ensure cleanup only happens for existing files (not new files)

## Edge Cases to Handle

### 1. Multi-line Values
- Empty multi-line strings (e.g., `description: |` with no content)
- Should be treated as empty

### 2. Complex Values
- Objects should not be considered empty (even if `{}`)
- Preserve all non-primitive values

### 3. Variable Processing
- Properties with unprocessed variables (e.g., `{{date}}`) should not be considered empty
- Cleanup should happen after variable processing

### 4. Delete List Interaction
- Properties removed by delete lists should not affect cleanup
- Only track properties that actually make it to the final template

### 5. New vs Existing Files
- Cleanup should ONLY apply to existing files
- New files should get all template properties, even if empty

## Testing Strategy

### Unit Tests
1. **Test empty value detection**
   - Various empty formats (string, null, array)
   - Non-empty edge cases (false, 0)

2. **Test property tracking**
   - Single template
   - Template chain (inheritance)
   - With delete lists

3. **Test cleanup logic**
   - Empty properties from file (should remove)
   - Empty properties from template (should keep)
   - Non-empty properties from file (should keep)

4. **Test integration**
   - Full template application with cleanup
   - Verify file content after application

### Manual Testing Scenarios
1. Apply template to file with empty `author:` field
2. Apply template chain where parent has empty properties
3. Apply template with delete list and empty properties
4. Apply template to file with various empty value types

## Rollback Considerations
- Feature should be backward compatible
- Existing behavior preserved for files without empty properties
- Add feature flag if needed for gradual rollout

## Performance Considerations
- Cleanup adds minimal overhead (one extra parse/format cycle)
- Only applies to existing files with frontmatter
- Set operations for property tracking are O(1)

## Success Criteria
1. Empty properties not from templates are removed
2. All template properties are preserved (even if empty)
3. Non-empty properties are never removed
4. Existing tests continue to pass
5. New tests cover all edge cases
6. No performance regression

## Implementation Order
1. Add property tracking to FrontmatterMerger
2. Implement empty value detection
3. Create cleanup method
4. Update merge methods to track properties
5. Integrate cleanup into TemplateApplicator
6. Write comprehensive tests
7. Manual testing and validation
8. Update documentation
