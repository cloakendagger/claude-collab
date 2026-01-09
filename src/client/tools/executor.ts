/**
 * Tool executor for file operations
 * Executes tools on the local filesystem with security validation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import type { ToolResult } from './file-ops.js';

export class ToolExecutor {
  private projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
  }

  /**
   * Execute a tool by name
   */
  async execute(toolName: string, input: any): Promise<string> {
    // Security: Validate paths are within project root
    if (input.path) {
      const fullPath = path.resolve(this.projectRoot, input.path);
      if (!fullPath.startsWith(this.projectRoot)) {
        return JSON.stringify({
          success: false,
          error: 'Path must be within project root',
          suggestion: 'Use relative paths from the project directory'
        } as ToolResult);
      }
    }

    try {
      switch (toolName) {
        case 'read_file':
          return await this.readFile(input.path);
        case 'write_file':
          return await this.writeFile(input.path, input.content);
        case 'list_directory':
          return await this.listDirectory(input.path);
        case 'search_files':
          return await this.searchFiles(input.pattern);
        default:
          return JSON.stringify({
            success: false,
            error: `Unknown tool: ${toolName}`
          } as ToolResult);
      }
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message
      } as ToolResult);
    }
  }

  /**
   * Read a file
   */
  private async readFile(relativePath: string): Promise<string> {
    const fullPath = path.resolve(this.projectRoot, relativePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');

      return JSON.stringify({
        success: true,
        path: relativePath,
        content,
        size: content.length
      } as ToolResult);
    } catch (error: any) {
      // Check if file doesn't exist
      if (error.code === 'ENOENT') {
        return JSON.stringify({
          success: false,
          path: relativePath,
          error: `File not found: ${relativePath}`,
          suggestion: 'This file may not exist in your local project. Ensure all team members have synced the latest code from git, or check if the file path is correct.'
        } as ToolResult);
      }

      // Check if it's a directory
      if (error.code === 'EISDIR') {
        return JSON.stringify({
          success: false,
          path: relativePath,
          error: `Path is a directory, not a file: ${relativePath}`,
          suggestion: 'Use list_directory tool to list directory contents'
        } as ToolResult);
      }

      // Other errors
      return JSON.stringify({
        success: false,
        path: relativePath,
        error: `Error reading file: ${error.message}`
      } as ToolResult);
    }
  }

  /**
   * Write a file
   */
  private async writeFile(relativePath: string, content: string): Promise<string> {
    const fullPath = path.resolve(this.projectRoot, relativePath);

    try {
      // Create parent directories if they don't exist
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      // Write the file
      await fs.writeFile(fullPath, content, 'utf-8');

      return JSON.stringify({
        success: true,
        path: relativePath,
        bytesWritten: content.length
      } as ToolResult);
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        path: relativePath,
        error: `Error writing file: ${error.message}`
      } as ToolResult);
    }
  }

  /**
   * List directory contents
   */
  private async listDirectory(relativePath: string): Promise<string> {
    const fullPath = path.resolve(this.projectRoot, relativePath);

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      const files = entries.map(entry => ({
        name: entry.name,
        type: (entry.isDirectory() ? 'directory' : 'file') as 'file' | 'directory',
        path: path.join(relativePath, entry.name)
      }));

      return JSON.stringify({
        success: true,
        path: relativePath,
        entries: files,
        count: files.length
      } as ToolResult);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return JSON.stringify({
          success: false,
          path: relativePath,
          error: `Directory not found: ${relativePath}`,
          suggestion: 'Check if the directory path is correct'
        } as ToolResult);
      }

      if (error.code === 'ENOTDIR') {
        return JSON.stringify({
          success: false,
          path: relativePath,
          error: `Path is not a directory: ${relativePath}`,
          suggestion: 'Use read_file tool to read file contents'
        } as ToolResult);
      }

      return JSON.stringify({
        success: false,
        path: relativePath,
        error: `Error listing directory: ${error.message}`
      } as ToolResult);
    }
  }

  /**
   * Search for files matching a pattern
   */
  private async searchFiles(pattern: string): Promise<string> {
    try {
      const matches = await glob(pattern, {
        cwd: this.projectRoot,
        nodir: false, // Include directories
        dot: true // Include hidden files
      });

      return JSON.stringify({
        success: true,
        pattern,
        matches: matches.sort(),
        count: matches.length
      } as ToolResult);
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        pattern,
        error: `Error searching files: ${error.message}`,
        suggestion: 'Check if the glob pattern is valid'
      } as ToolResult);
    }
  }

  /**
   * Get the project root directory
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }
}
