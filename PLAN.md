# Implementation Plan: Move Batch Apply to Settings Panel

## Overview
Move the "Apply mapped templates to all notes in folder" functionality from a command to buttons in the settings panel next to each template mapping.

## Current State
- The batch apply functionality exists as an Obsidian command in `commands.ts`
- It shows a folder selection modal, then applies templates to all markdown files in that folder
- The settings tab shows template mappings with "Preview" and "Remove" buttons

## Desired State
- Remove the command from the command palette
- Add an "Apply to all" button next to each template mapping in settings
- The button applies the mapped template to all markdown files in that specific folder

## Implementation Steps

### Step 1: Refactor Batch Processing Logic
**File: `src/commands.ts`**
- Extract the batch processing logic from `processFolderBatch()` into a public method
- Create `applyTemplateToFolderPath(folderPath: string)` that:
  - Gets the TFolder from the path
  - Reuses existing batch processing logic
  - Returns a promise that resolves when complete

### Step 2: Remove the Command
**File: `src/commands.ts`**
- Remove the `apply-template-to-folder` command registration
- Remove the `applyTemplateToFolder()` method (no longer needed)
- Keep all the batch processing helper methods as they'll be reused

### Step 3: Add Button to Settings
**File: `src/ui/settings-tab.ts`**
- In `createMappingSetting()`, add a new button between "Preview" and "Remove"
- Button text: "Apply to all"
- Button icon: "play" or "sync"
- On click:
  - Show confirmation dialog (reuse existing ConfirmationModal)
  - Call the new public method on commands instance
  - Show progress/completion notices

### Step 4: Update Tests
**File: `src/commands.test.ts`**
- Remove tests for the deleted command
- Add tests for the new public method
- Test that it can be called with a folder path

**File: `src/ui/settings-tab.test.ts`** (if exists)
- Add tests for the new button
- Test that clicking triggers the batch operation

### Step 5: Update Plugin Main
**File: `src/main.ts`**
- Ensure commands instance is accessible to settings tab
- Pass commands instance to SnowflakeSettingTab constructor

## Benefits of This Approach
1. **Simpler UX**: Users don't need to select a folder - it's implicit from the mapping
2. **More intuitive**: The action is right next to the configuration
3. **Reuses existing code**: All the batch processing logic remains unchanged
4. **Maintains safety**: Still shows confirmation dialog before bulk operations

## Technical Considerations
- The commands instance needs to be accessible from settings tab
- We need to handle the case where the folder no longer exists
- Progress notifications should still work the same way
- Error handling remains consistent

## Minimal Changes Required
1. Make `processFolderBatch` accept a folder path instead of TFolder
2. Add one button to settings UI
3. Wire up the button click to call the batch processor
4. Update tests

This is the simplest possible implementation that achieves the desired functionality.
