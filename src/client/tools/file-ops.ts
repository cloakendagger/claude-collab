/**
 * File operation tool definitions for Anthropic SDK
 * These tools allow Claude to interact with the local filesystem
 */

import type Anthropic from '@anthropic-ai/sdk';

export const FILE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file. Path must be relative to the project root directory. Use this to read source code, configuration files, or any text files needed for the task.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path from project root (e.g., "src/index.ts" or "package.json")'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file. Creates parent directories if they don\'t exist. Path must be relative to project root. Use this to create new files or overwrite existing ones.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path from project root (e.g., "src/newfile.ts")'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_directory',
    description: 'List all files and directories in a given directory. Path must be relative to project root. Returns file names, types (file/directory), and relative paths.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to project root (e.g., "src" or "src/client"). Use "." for project root.'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'search_files',
    description: 'Search for files matching a glob pattern. Useful for finding files by name or extension across the project. Returns array of matching file paths.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern to match files (e.g., "**/*.ts" for all TypeScript files, "src/**/*.test.ts" for test files in src)'
        }
      },
      required: ['pattern']
    }
  }
];

export interface ToolResult {
  success: boolean;
  path?: string;
  content?: string;
  entries?: Array<{
    name: string;
    type: 'file' | 'directory';
    path: string;
  }>;
  matches?: string[];
  count?: number;
  size?: number;
  bytesWritten?: number;
  error?: string;
  suggestion?: string;
}
