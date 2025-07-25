import { ErrorHandler, ErrorType, ErrorHandlerTestUtils } from './error-handler';
import { ErrorContext } from './types';
import { Notice } from 'obsidian';

// Mock Obsidian Notice
jest.mock('obsidian', () => ({
  Notice: jest.fn()
}));

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;
  let consoleErrorSpy: jest.SpyInstance;
  const mockNotice = Notice as jest.MockedClass<typeof Notice>;

  beforeEach(() => {
    errorHandler = ErrorHandler.getInstance();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockNotice.mockClear();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Error Categorization', () => {
    it('should categorize file not found errors correctly', () => {
      const context: ErrorContext = {
        operation: 'load_template',
        templatePath: 'test.md'
      };

      const errors = [
        new Error('File not found'),
        new Error('ENOENT: no such file or directory'),
        new Error('No such file exists')
      ];

      errors.forEach((error) => {
        errorHandler.handleErrorSilently(error, context);
        const lastCall = consoleErrorSpy.mock.calls[consoleErrorSpy.mock.calls.length - 1];
        expect(lastCall[1].errorType).toBe(ErrorType.FILE_NOT_FOUND);
      });
    });

    it('should categorize permission errors correctly', () => {
      const context: ErrorContext = {
        operation: 'load_template',
        templatePath: 'test.md'
      };

      const errors = [
        new Error('Permission denied'),
        new Error('EACCES: permission denied'),
        new Error('Access denied to file')
      ];

      errors.forEach((error) => {
        errorHandler.handleErrorSilently(error, context);
        const lastCall = consoleErrorSpy.mock.calls[consoleErrorSpy.mock.calls.length - 1];
        expect(lastCall[1].errorType).toBe(ErrorType.PERMISSION_DENIED);
      });
    });

    it('should categorize template syntax errors correctly', () => {
      const context: ErrorContext = {
        operation: 'apply_template',
        templatePath: 'test.md'
      };

      const errors = [
        new Error('Invalid template syntax'),
        new Error('Template syntax error at line 5')
      ];

      errors.forEach((error) => {
        errorHandler.handleErrorSilently(error, context);
        const lastCall = consoleErrorSpy.mock.calls[consoleErrorSpy.mock.calls.length - 1];
        expect(lastCall[1].errorType).toBe(ErrorType.INVALID_TEMPLATE_SYNTAX);
      });
    });

    it('should categorize variable errors correctly', () => {
      const context: ErrorContext = {
        operation: 'apply_template',
        templatePath: 'test.md'
      };

      const errors = [
        new Error('Invalid variable name'),
        new Error('Unknown variable: {{custom}}')
      ];

      errors.forEach((error) => {
        errorHandler.handleErrorSilently(error, context);
        const lastCall = consoleErrorSpy.mock.calls[consoleErrorSpy.mock.calls.length - 1];
        expect(lastCall[1].errorType).toBe(ErrorType.INVALID_VARIABLE);
      });
    });

    it('should default to UNKNOWN for unrecognized errors', () => {
      const context: ErrorContext = {
        operation: 'apply_template',
        filePath: 'test.md'
      };

      const error = new Error('Something unexpected happened');
      errorHandler.handleErrorSilently(error, context);

      const lastCall = consoleErrorSpy.mock.calls[consoleErrorSpy.mock.calls.length - 1];
      expect(lastCall[1].errorType).toBe(ErrorType.UNKNOWN);
    });
  });

  describe('User-Friendly Messages', () => {
    it('should provide user-friendly message for missing template (REQ-026)', () => {
      const context: ErrorContext = {
        operation: 'load_template',
        templatePath: 'daily.md'
      };

      const error = new Error('File not found');
      const message = errorHandler.handleErrorSilently(error, context);

      expect(message).toBe('Template file not found: daily.md');
    });

    it('should provide permission denied message (REQ-029)', () => {
      const context: ErrorContext = {
        operation: 'load_template',
        templatePath: 'restricted.md'
      };

      const error = new Error('Permission denied');
      const message = errorHandler.handleErrorSilently(error, context);

      expect(message).toBe(
        'Cannot read template (permission denied): restricted.md. ' +
          'Creating file without template.'
      );
    });

    it('should provide invalid syntax message (REQ-027)', () => {
      const context: ErrorContext = {
        operation: 'apply_template',
        templatePath: 'broken.md'
      };

      const error = new Error('Invalid template syntax');
      const message = errorHandler.handleErrorSilently(error, context);

      expect(message).toBe(
        'Template contains invalid syntax and will be used as-is: ' + 'broken.md'
      );
    });

    it('should provide invalid variable message (REQ-028)', () => {
      const context: ErrorContext = {
        operation: 'apply_template',
        templatePath: 'custom.md'
      };

      const error = new Error('Unknown variable: {{custom}}');
      const message = errorHandler.handleErrorSilently(error, context);

      expect(message).toBe(
        'Template contains invalid variables that will be left unchanged: ' + 'custom.md'
      );
    });

    it('should provide merge conflict message', () => {
      const context: ErrorContext = {
        operation: 'merge_frontmatter',
        filePath: 'Notes/test.md'
      };

      const error = new Error('Merge conflict in frontmatter');
      errorHandler.handleError(error, context);

      expect(mockNotice).toHaveBeenCalledWith(
        'Error merging frontmatter: Merge conflict in frontmatter'
      );
    });
  });

  describe('Error Logging', () => {
    it('should log all errors to console', () => {
      const context: ErrorContext = {
        operation: 'apply_template',
        filePath: 'test.md',
        templatePath: 'test.md'
      };

      const error = new Error('Test error');
      errorHandler.handleErrorSilently(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Snowflake Plugin Error]',
        expect.objectContaining({
          timestamp: expect.any(String),
          errorType: expect.any(String),
          context,
          error: expect.objectContaining({
            message: 'Test error',
            name: 'Error'
          })
        })
      );
    });

    it('should handle non-Error objects', () => {
      const context: ErrorContext = {
        operation: 'apply_template',
        filePath: 'test.md'
      };

      const error = 'String error';
      errorHandler.handleErrorSilently(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Snowflake Plugin Error]',
        expect.objectContaining({
          error: 'String error'
        })
      );
    });

    it('should log additional details in debug mode', () => {
      ErrorHandlerTestUtils.setDebugMode(errorHandler, true);

      const context: ErrorContext = {
        operation: 'apply_template',
        filePath: 'test.md'
      };

      const error = new Error('Debug test');
      errorHandler.handleErrorSilently(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[Snowflake Debug] Full error details:', error);

      ErrorHandlerTestUtils.setDebugMode(errorHandler, false);
    });
  });

  describe('handleError vs handleErrorSilently', () => {
    it('should show Notice when using handleError', () => {
      const context: ErrorContext = {
        operation: 'apply_template',
        filePath: 'test.md'
      };

      const error = new Error('Test error');
      errorHandler.handleError(error, context);

      expect(mockNotice).toHaveBeenCalled();
    });

    it('should not show Notice when using handleErrorSilently', () => {
      const context: ErrorContext = {
        operation: 'apply_template',
        filePath: 'test.md'
      };

      const error = new Error('Test error');
      errorHandler.handleErrorSilently(error, context);

      expect(mockNotice).not.toHaveBeenCalled();
    });
  });

  describe('Extended Error Creation', () => {
    it('should create ExtendedError with context', () => {
      const context: ErrorContext = {
        operation: 'load_template',
        templatePath: 'test.md'
      };

      const originalError = new Error('Original error');
      const extendedError = ErrorHandlerTestUtils.createError(
        errorHandler,
        'Extended error message',
        ErrorType.FILE_NOT_FOUND,
        context,
        originalError
      );

      expect(extendedError.message).toBe('Extended error message');
      expect(extendedError.type).toBe(ErrorType.FILE_NOT_FOUND);
      expect(extendedError.context).toBe(context);
      expect(extendedError.originalError).toBe(originalError);
    });
  });

  describe('Error Type Checking', () => {
    it('should correctly identify error types', () => {
      const context: ErrorContext = {
        operation: 'load_template',
        templatePath: 'test.md'
      };

      const extendedError = ErrorHandlerTestUtils.createError(
        errorHandler,
        'Test error',
        ErrorType.TEMPLATE_NOT_FOUND,
        context
      );

      expect(
        ErrorHandlerTestUtils.isErrorType(errorHandler, extendedError, ErrorType.TEMPLATE_NOT_FOUND)
      ).toBe(true);
      expect(
        ErrorHandlerTestUtils.isErrorType(errorHandler, extendedError, ErrorType.FILE_NOT_FOUND)
      ).toBe(false);
    });

    it('should handle non-error objects', () => {
      expect(ErrorHandlerTestUtils.isErrorType(errorHandler, null, ErrorType.UNKNOWN)).toBe(false);
      expect(ErrorHandlerTestUtils.isErrorType(errorHandler, 'string', ErrorType.UNKNOWN)).toBe(
        false
      );
      expect(ErrorHandlerTestUtils.isErrorType(errorHandler, {}, ErrorType.UNKNOWN)).toBe(false);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ErrorHandler.getInstance();
      const instance2 = ErrorHandler.getInstance();

      expect(instance1).toBe(instance2);
    });
  });
});
