/**
 * Tests for Template Variable Processing Engine
 *
 * These tests verify that all requirements are properly implemented
 * for template variable processing.
 */

import {
    TemplateVariableProcessor,
    createTemplateProcessor
} from './template-variables';
import { MarkdownFile } from './types';

// Mock file for testing
function createMockFile(basename: string): MarkdownFile {
    return {
        basename,
        extension: 'md',
        path: `test/${basename}.md`,
        name: `${basename}.md`,
        parent: null,
        vault: null,
        stat: {
            ctime: Date.now(),
            mtime: Date.now(),
            size: 0
        }
    } as MarkdownFile;
}

describe('TemplateVariableProcessor', () => {
    let processor: TemplateVariableProcessor;
    let mockFile: MarkdownFile;

    beforeEach(() => {
        processor = new TemplateVariableProcessor();
        mockFile = createMockFile('Test Note');
    });

    describe('Variable Replacement', () => {
        test('REQ-011: Should replace {{title}} with filename', async () => {
            const template = 'Title: {{title}}';
            const result = await processor.processTemplate(
                template,
                mockFile
            );

            expect(result.content).toBe('Title: Test Note');
            expect(result.variables.title).toBe('Test Note');
        });

        test('REQ-012: Should replace {{date}} with YYYY-MM-DD format', async () => {
            const template = 'Date: {{date}}';
            const result = await processor.processTemplate(
                template,
                mockFile
            );

            // Check format matches YYYY-MM-DD
            expect(result.content).toMatch(/Date: \d{4}-\d{2}-\d{2}/);
            expect(result.variables.date).toMatch(/\d{4}-\d{2}-\d{2}/);
        });

        test('REQ-013: Should replace {{time}} with HH:mm format', async () => {
            const template = 'Time: {{time}}';
            const result = await processor.processTemplate(
                template,
                mockFile
            );

            // Check format matches HH:mm
            expect(result.content).toMatch(/Time: \d{2}:\d{2}/);
            expect(result.variables.time).toMatch(/\d{2}:\d{2}/);
        });

        test('REQ-015: Should replace {{snowflake_id}} with 10-char ID', async () => {
            const template = 'ID: {{snowflake_id}}';
            const result = await processor.processTemplate(
                template,
                mockFile
            );

            // Check ID is 10 alphanumeric characters
            expect(result.content).toMatch(/ID: [a-zA-Z0-9]{10}/);
            expect(result.variables.snowflake_id).toMatch(/^[a-zA-Z0-9]{10}$/);
            expect(result.hasSnowflakeId).toBe(true);
        });

        test('REQ-016: Multiple {{snowflake_id}} should use same value', async () => {
            const template = 'ID1: {{snowflake_id}}, ID2: {{snowflake_id}}';
            const result = await processor.processTemplate(
                template,
                mockFile
            );

            // Extract both IDs
            const matches = result.content.match(/[a-zA-Z0-9]{10}/g);
            expect(matches).toHaveLength(2);
            expect(matches[0]).toBe(matches[1]); // Same ID
        });

        test('Should not generate ID if not in template', async () => {
            const template = 'Title: {{title}}';
            const result = await processor.processTemplate(
                template,
                mockFile
            );

            expect(result.variables.snowflake_id).toBeUndefined();
            expect(result.hasSnowflakeId).toBe(false);
        });
    });

    describe('Custom Formats', () => {
        test('REQ-014: Should use custom date format', async () => {
            processor.setDateFormat('DD/MM/YYYY');
            const template = 'Date: {{date}}';
            const result = await processor.processTemplate(
                template,
                mockFile
            );

            // Check custom format
            expect(result.content).toMatch(/Date: \d{2}\/\d{2}\/\d{4}/);
        });

        test('REQ-014: Should use custom time format', async () => {
            processor.setTimeFormat('hh:mm A');
            const template = 'Time: {{time}}';
            const result = await processor.processTemplate(
                template,
                mockFile
            );

            // Check custom format (12-hour with AM/PM)
            expect(result.content).toMatch(/Time: \d{2}:\d{2} (AM|PM)/);
        });

        test('Factory should create processor with custom formats', () => {
            const custom = createTemplateProcessor('MM-DD-YYYY', 'HH:mm:ss');
            expect(custom).toBeInstanceOf(TemplateVariableProcessor);
        });
    });

    describe('Error Handling', () => {
        test('REQ-027: Should leave malformed variables unchanged', async () => {
            const template = 'Bad: {{invalid_var}} Good: {{title}}';
            const result = await processor.processTemplate(
                template,
                mockFile
            );

            expect(result.content).toBe('Bad: {{invalid_var}} Good: Test Note');
        });

        test('REQ-028: Should identify invalid variables', () => {
            const template = '{{title}} {{bad1}} {{date}} {{bad2}}';
            const invalid = processor.validateTemplate(template);

            expect(invalid).toEqual(['bad1', 'bad2']);
        });

        test('Should handle empty template', async () => {
            const result = await processor.processTemplate('', mockFile);
            expect(result.content).toBe('');
        });

        test('Should handle template with no variables', async () => {
            const template = 'Just plain text';
            const result = await processor.processTemplate(
                template,
                mockFile
            );
            expect(result.content).toBe('Just plain text');
        });
    });

    describe('Variable Information', () => {
        test('Should list available variables', () => {
            const vars = processor.getAvailableVariables();
            expect(vars).toContain('title');
            expect(vars).toContain('date');
            expect(vars).toContain('time');
            expect(vars).toContain('snowflake_id');
        });

        test('Should handle duplicate invalid variables', () => {
            const template = '{{bad}} {{bad}} {{bad}}';
            const invalid = processor.validateTemplate(template);

            expect(invalid).toEqual(['bad']); // No duplicates
        });
    });

    describe('Complex Templates', () => {
        test('Should process multiple different variables', async () => {
            const template = `---
title: {{title}}
date: {{date}}
id: {{snowflake_id}}
---

# {{title}}
Created at {{time}} on {{date}}`;

            const result = await processor.processTemplate(
                template,
                mockFile
            );

            // Check all variables were replaced
            expect(result.content).toContain('title: Test Note');
            expect(result.content).toContain('# Test Note');
            expect(result.content).not.toContain('{{');
            expect(result.content).not.toContain('}}');
        });

        test('Should handle variables with surrounding text', async () => {
            const template = 'prefix{{title}}suffix';
            const result = await processor.processTemplate(
                template,
                mockFile
            );

            expect(result.content).toBe('prefixTest Notesuffix');
        });
    });
});
