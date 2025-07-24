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
import type { ErrorContext } from './types';

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
    ErrorHandler.instance ??= new ErrorHandler();
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
  handleError(error: unknown, context: ErrorContext): string {
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
  handleErrorSilently(error: unknown, context: ErrorContext): string {
    const errorType = this.categorizeError(error);
    const userMessage = this.getUserMessage(errorType, context, error);

    // Log for debugging
    this.logError(error, context, errorType);

    return userMessage;
  }

  /**
   * Categorize the error type
   */
  private categorizeError(error: unknown): ErrorType {
    if (error === null || error === undefined) return ErrorType.UNKNOWN;

    const errorMessage = this.getErrorMessage(error).toLowerCase();

    if (this.isFileNotFoundError(errorMessage)) {
      return ErrorType.FILE_NOT_FOUND;
    }

    if (this.isPermissionError(errorMessage)) {
      return ErrorType.PERMISSION_DENIED;
    }

    if (this.isTemplateSyntaxError(errorMessage)) {
      return ErrorType.INVALID_TEMPLATE_SYNTAX;
    }

    if (this.isVariableError(errorMessage)) {
      return ErrorType.INVALID_VARIABLE;
    }

    return ErrorType.UNKNOWN;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private isFileNotFoundError(message: string): boolean {
    return (
      message.includes('file not found') ||
      message.includes('enoent') ||
      message.includes('no such file')
    );
  }

  private isPermissionError(message: string): boolean {
    return (
      message.includes('permission') ||
      message.includes('eacces') ||
      message.includes('access denied')
    );
  }

  private isTemplateSyntaxError(message: string): boolean {
    return message.includes('invalid template') || message.includes('template syntax');
  }

  private isVariableError(message: string): boolean {
    return message.includes('invalid variable') || message.includes('unknown variable');
  }

  /**
   * Get user-friendly error message based on error type and context
   */
  private getUserMessage(errorType: ErrorType, context: ErrorContext, error: unknown): string {
    switch (errorType) {
      case ErrorType.TEMPLATE_NOT_FOUND:
        return this.getTemplateNotFoundMessage(context);
      case ErrorType.FILE_NOT_FOUND:
        return this.getFileNotFoundMessage(context);
      case ErrorType.PERMISSION_DENIED:
        return this.getPermissionDeniedMessage(context);
      case ErrorType.INVALID_TEMPLATE_SYNTAX:
        return this.getInvalidSyntaxMessage(context);
      case ErrorType.INVALID_VARIABLE:
        return this.getInvalidVariableMessage(context);
      case ErrorType.MERGE_CONFLICT:
        return 'Error merging frontmatter. Using existing content.';
      default:
        return this.getGenericErrorMessage(context, error);
    }
  }

  private getTemplateNotFoundMessage(context: ErrorContext): string {
    const path = context.templatePath ?? 'unknown';
    return `Template not found: ${path}. Creating file without template.`;
  }

  private getFileNotFoundMessage(context: ErrorContext): string {
    if (context.operation === 'load_template') {
      return `Template file not found: ${context.templatePath ?? 'unknown'}`;
    }
    return `File not found: ${context.filePath ?? 'unknown'}`;
  }

  private getPermissionDeniedMessage(context: ErrorContext): string {
    if (context.operation === 'load_template') {
      const path = context.templatePath ?? 'unknown';
      return `Cannot read template (permission denied): ${path}. Creating file without template.`;
    }
    const path = context.filePath ?? context.templatePath ?? 'unknown';
    return `Permission denied accessing: ${path}`;
  }

  private getInvalidSyntaxMessage(context: ErrorContext): string {
    const path = context.templatePath ?? 'unknown';
    return `Template contains invalid syntax and will be used as-is: ${path}`;
  }

  private getInvalidVariableMessage(context: ErrorContext): string {
    const path = context.templatePath ?? 'unknown';
    return `Template contains invalid variables that will be left unchanged: ${path}`;
  }

  private getGenericErrorMessage(context: ErrorContext, error: unknown): string {
    const operation = this.getOperationDescription(context.operation);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return `Error ${operation}: ${errorMessage}`;
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
  private logError(error: unknown, context: ErrorContext, errorType: ErrorType): void {
    const logMessage = {
      timestamp: new Date().toISOString(),
      errorType,
      context,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name
            }
          : String(error)
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
    if (error !== null && error !== undefined && typeof error === 'object' && 'type' in error) {
      return (error as ExtendedError).type === type;
    }
    return false;
  }
}
