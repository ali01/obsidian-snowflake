/**
 * Centralized Error Handler
 *
 * REQ-026: If a template file doesn't exist when needed, then the plugin
 * shall create the new file empty and show a notice.
 *
 * REQ-027: If a template contains malformed variable syntax, then the plugin
 * shall leave it unchanged in the output.
 *
 * REQ-028: When encountering invalid template variables, the plugin shall show
 * a warning to help users fix their templates.
 *
 * REQ-029: If the plugin cannot read a template due to permissions, then
 * the plugin shall show a user-friendly error and create the file without a
 * template.
 */

import { Notice } from 'obsidian';
import { ErrorContext } from './types';

/**
 * Error types that can occur in the plugin
 */
export enum ErrorType {
    TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    INVALID_TEMPLATE_SYNTAX = 'INVALID_TEMPLATE_SYNTAX',
    INVALID_VARIABLE = 'INVALID_VARIABLE',
    MERGE_CONFLICT = 'MERGE_CONFLICT',
    UNKNOWN = 'UNKNOWN'
}

/**
 * Extended error information
 */
export interface ExtendedError extends Error {
    type: ErrorType;
    context: ErrorContext;
    originalError?: Error;
}

/**
 * ErrorHandler: Centralized error handling for the plugin
 *
 * Purpose: Provides consistent error handling, user-friendly messages,
 * and debugging information throughout the plugin.
 */
export class ErrorHandler {
    private static instance: ErrorHandler;
    private debugMode: boolean = false;

    /**
     * Get singleton instance
     */
    static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    /**
     * Enable/disable debug mode
     */
    setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }

    /**
     * Handle an error with appropriate user feedback
     *
     * @param error - The error to handle
     * @param context - Context about where the error occurred
     * @returns User-friendly error message
     */
    handleError(error: Error | unknown, context: ErrorContext): string {
        const errorType = this.categorizeError(error);
        const userMessage = this.getUserMessage(errorType, context, error);

        // Log for debugging
        this.logError(error, context, errorType);

        // Show user notice
        new Notice(userMessage);

        return userMessage;
    }

    /**
     * Handle error without showing notice (for cases where caller handles UI)
     */
    handleErrorSilently(error: Error | unknown, context: ErrorContext): string {
        const errorType = this.categorizeError(error);
        const userMessage = this.getUserMessage(errorType, context, error);

        // Log for debugging
        this.logError(error, context, errorType);

        return userMessage;
    }

    /**
     * Categorize the error type
     */
    private categorizeError(error: Error | unknown): ErrorType {
        if (!error) return ErrorType.UNKNOWN;

        const errorMessage = error instanceof Error ?
            error.message.toLowerCase() : String(error).toLowerCase();

        // File not found errors
        if (errorMessage.includes('file not found') ||
            errorMessage.includes('enoent') ||
            errorMessage.includes('no such file')) {
            return ErrorType.FILE_NOT_FOUND;
        }

        // Permission errors
        if (errorMessage.includes('permission') ||
            errorMessage.includes('eacces') ||
            errorMessage.includes('access denied')) {
            return ErrorType.PERMISSION_DENIED;
        }

        // Template syntax errors
        if (errorMessage.includes('invalid template') ||
            errorMessage.includes('template syntax')) {
            return ErrorType.INVALID_TEMPLATE_SYNTAX;
        }

        // Variable errors
        if (errorMessage.includes('invalid variable') ||
            errorMessage.includes('unknown variable')) {
            return ErrorType.INVALID_VARIABLE;
        }

        return ErrorType.UNKNOWN;
    }

    /**
     * Get user-friendly error message based on error type and context
     */
    private getUserMessage(
        errorType: ErrorType,
        context: ErrorContext,
        error: Error | unknown
    ): string {
        switch (errorType) {
            case ErrorType.TEMPLATE_NOT_FOUND:
                // REQ-026: Specific message for missing template
                return `Template not found: ${context.templatePath || 'unknown'}. ` +
                    'Creating file without template.';

            case ErrorType.FILE_NOT_FOUND:
                if (context.operation === 'load_template') {
                    return `Template file not found: ${context.templatePath || 'unknown'}`;
                }
                return `File not found: ${context.filePath || 'unknown'}`;

            case ErrorType.PERMISSION_DENIED:
                // REQ-029: User-friendly message for permission errors
                if (context.operation === 'load_template') {
                    return `Cannot read template (permission denied): ` +
                        `${context.templatePath || 'unknown'}. Creating file without template.`;
                }
                return `Permission denied accessing: ` +
                    `${context.filePath || context.templatePath || 'unknown'}`;

            case ErrorType.INVALID_TEMPLATE_SYNTAX:
                // REQ-027: Inform about malformed syntax
                return `Template contains invalid syntax and will be used as-is: ` +
                    `${context.templatePath || 'unknown'}`;

            case ErrorType.INVALID_VARIABLE:
                // REQ-028: Warning for invalid variables
                return `Template contains invalid variables that will be left unchanged: ` +
                    `${context.templatePath || 'unknown'}`;

            case ErrorType.MERGE_CONFLICT:
                return `Error merging frontmatter. Using existing content.`;

            default:
                // Generic error message with operation context
                const operation = this.getOperationDescription(context.operation);
                return `Error ${operation}: ` +
                    `${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }

    /**
     * Get human-readable operation description
     */
    private getOperationDescription(operation: string): string {
        switch (operation) {
            case 'load_template':
                return 'loading template';
            case 'apply_template':
                return 'applying template';
            case 'merge_frontmatter':
                return 'merging frontmatter';
            default:
                return 'processing';
        }
    }

    /**
     * Log error for debugging
     */
    private logError(error: Error | unknown, context: ErrorContext, errorType: ErrorType): void {
        const logMessage = {
            timestamp: new Date().toISOString(),
            errorType,
            context,
            error: error instanceof Error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : String(error)
        };

        // Always log errors to console
        console.error('[Snowflake Plugin Error]', logMessage);

        // In debug mode, show more details
        if (this.debugMode) {
            console.error('[Snowflake Debug] Full error details:', error);
        }
    }

    /**
     * Create an ExtendedError with context
     */
    createError(
        message: string,
        type: ErrorType,
        context: ErrorContext,
        originalError?: Error
    ): ExtendedError {
        const error = new Error(message) as ExtendedError;
        error.type = type;
        error.context = context;
        error.originalError = originalError;
        return error;
    }

    /**
     * Check if an error is a specific type
     */
    isErrorType(error: unknown, type: ErrorType): boolean {
        if (error && typeof error === 'object' && 'type' in error) {
            return (error as ExtendedError).type === type;
        }
        return false;
    }
}
