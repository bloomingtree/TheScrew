/**
 * PythonBridge - Bridge layer for calling @zero-employee/office-skills Python scripts
 *
 * This module provides a TypeScript interface to the office-skills NPM package,
 * which wraps Python scripts for Office document manipulation.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Type definitions for validation results
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Type definitions for batch results
export interface BatchResult {
  file: string;
  success: boolean;
  error?: string;
  message?: string;
}

// Type definitions for inventory results
export interface InventoryData {
  slides?: Record<string, any>;
  paragraphs?: Array<{
    text: string;
    level?: number;
    alignment?: string;
  }>;
}

/**
 * PythonBridge class for calling office-skills Python scripts
 */
export class PythonBridge {
  private officeSkillsPath: string;
  private pythonPath: string;
  private skillsPath: string;

  constructor(options?: { officeSkillsPath?: string; pythonPath?: string; skillsPath?: string }) {
    // Path to the installed @zero-employee/office-skills package
    this.officeSkillsPath = options?.officeSkillsPath ||
      path.resolve(process.cwd(), 'node_modules', '@zero-employee', 'office-skills');

    // Path to the Office runtime directory
    this.skillsPath = options?.skillsPath ||
      path.resolve(__dirname, '..', 'runtime', 'office');

    // Find Python executable
    this.pythonPath = options?.pythonPath || this._findPython();
  }

  /**
   * Find Python executable on the system
   */
  private _findPython(): string {
    const commands = ['python', 'python3', 'py'];

    for (const cmd of commands) {
      try {
        const result = spawn(cmd, ['--version'], { stdio: 'ignore' });
        return cmd;
      } catch {
        // Continue to next command
      }
    }

    return 'python'; // Default fallback
  }

  /**
   * Run a Python script from office-skills
   */
  private async _runScript(scriptPath: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      // Use skillsPath for local scripts in electron/main/skills/office/
      const fullPath = path.join(this.skillsPath, scriptPath);

      if (!fs.existsSync(fullPath)) {
        return reject(new Error(`Script not found: ${fullPath}`));
      }

      const python = spawn(this.pythonPath, [fullPath, ...args], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      python.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Script failed (code ${code}): ${stderr || stdout}`));
        }
      });

      python.on('error', (err) => {
        reject(new Error(`Failed to start Python: ${err.message}`));
      });
    });
  }

  // ==================== DOCX Operations ====================

  /**
   * Unpack a DOCX file to extract XML content
   */
  async unpackDocx(filepath: string, outputDir?: string): Promise<string> {
    const dir = outputDir || path.join(os.tmpdir(), `docx_${Date.now()}`);

    await this._runScript('ooxml/scripts/unpack.py', [filepath, dir]);

    return dir;
  }

  /**
   * Pack an unpacked directory back into a DOCX file
   */
  async packDocx(inputDir: string, outputFile: string): Promise<void> {
    await this._runScript('ooxml/scripts/pack.py', [inputDir, outputFile]);
  }

  /**
   * Validate a DOCX file structure
   */
  async validateDocx(dir: string, original?: string): Promise<ValidationResult> {
    try {
      const args = original ? [dir, '--original', original] : [dir];
      const output = await this._runScript('ooxml/scripts/validate.py', args);

      // Parse validation output
      return {
        valid: !output.includes('ERROR'),
        errors: this._extractErrors(output, 'ERROR'),
        warnings: this._extractErrors(output, 'WARNING')
      };
    } catch (error) {
      return {
        valid: false,
        errors: [(error as Error).message],
        warnings: []
      };
    }
  }

  // ==================== PPTX Operations ====================

  /**
   * Extract text inventory from a PPTX file
   */
  async extractPptxInventory(filepath: string, outputFile?: string): Promise<InventoryData> {
    const output = outputFile || path.join(os.tmpdir(), `pptx_inventory_${Date.now()}.json`);

    await this._runScript('pptx/scripts/inventory.py', [filepath, output]);

    // Read and parse the JSON output
    if (fs.existsSync(output)) {
      const content = fs.readFileSync(output, 'utf-8');
      return JSON.parse(content);
    }

    return {};
  }

  /**
   * Rearrange slides in a PPTX file
   */
  async rearrangePptxSlides(template: string, output: string, slideOrder: string): Promise<void> {
    await this._runScript('pptx/scripts/rearrange.py', [template, output, slideOrder]);
  }

  /**
   * Replace text in PPTX file using JSON replacements
   */
  async replacePptxText(input: string, replacements: Record<string, any> | string, output: string): Promise<void> {
    let replacementsJson = replacements;

    // If replacements is an object, create a temp JSON file
    if (typeof replacements === 'object') {
      const tempFile = path.join(os.tmpdir(), `replacements_${Date.now()}.json`);
      fs.writeFileSync(tempFile, JSON.stringify(replacements, null, 2));
      replacementsJson = tempFile;
    }

    await this._runScript('pptx/scripts/replace.py', [input, replacementsJson as string, output]);
  }

  /**
   * Generate thumbnail grid for PPTX slides
   */
  async generatePptxThumbnails(input: string, output: string, cols: number = 4): Promise<string> {
    await this._runScript('pptx/scripts/thumbnail.py', [input, output, '--cols', cols.toString()]);
    return output;
  }

  // ==================== Batch Operations ====================

  /**
   * Batch replace text across multiple PPTX files
   */
  async batchReplacePptx(files: string[], replacements: Record<string, any>): Promise<BatchResult[]> {
    const results: BatchResult[] = [];

    for (const file of files) {
      try {
        await this.replacePptxText(file, replacements, file);
        results.push({ file, success: true });
      } catch (error) {
        results.push({
          file,
          success: false,
          error: (error as Error).message
        });
      }
    }

    return results;
  }

  /**
   * Batch create documents from template
   */
  async batchCreateFromTemplate(
    template: string,
    dataList: Record<string, any>[],
    outputDir: string,
    nameField: string = 'name'
  ): Promise<BatchResult[]> {
    const results: BatchResult[] = [];

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const data of dataList) {
      try {
        const filename = data[nameField] || `document_${Date.now()}`;
        const ext = path.extname(template);
        const outputPath = path.join(outputDir, `${filename}${ext}`);

        // Copy template to output
        fs.copyFileSync(template, outputPath);

        // Apply replacements
        const replacements = this._flattenObject(data);
        await this.replacePptxText(outputPath, replacements, outputPath);

        results.push({ file: filename, success: true, message: outputPath });
      } catch (error) {
        results.push({
          file: data[nameField] || 'unknown',
          success: false,
          error: (error as Error).message
        });
      }
    }

    return results;
  }

  // ==================== Helper Methods ====================

  /**
   * Extract errors from validation output
   */
  private _extractErrors(output: string, keyword: string): string[] {
    const lines = output.split('\n');
    return lines
      .filter(line => line.includes(keyword))
      .map(line => line.replace(`${keyword}:`, '').trim());
  }

  /**
   * Flatten nested object for template replacement
   */
  private _flattenObject(obj: Record<string, any>, prefix: string = ''): Record<string, string> {
    const result: Record<string, string> = {};

    for (const key in obj) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(result, this._flattenObject(obj[key], newKey));
      } else {
        result[newKey] = String(obj[key]);
      }
    }

    return result;
  }

  // ==================== Office Skills Integration ====================

  /**
   * Execute an Office Skill script
   */
  async executeOfficeSkill(category: string, scriptName: string, args: Record<string, any> = {}): Promise<any> {
    const scriptPath = path.join(this.skillsPath, category, 'scripts', scriptName);

    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Office skill script not found: ${scriptPath}`);
    }

    // Convert args object to command line arguments
    const scriptArgs: string[] = [];
    for (const [key, value] of Object.entries(args)) {
      if (key.startsWith('_')) continue; // Skip internal args
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        scriptArgs.push(...value.map(String));
      } else if (typeof value === 'boolean') {
        if (value) scriptArgs.push(`--${key}`);
      } else {
        scriptArgs.push(`--${key}`, String(value));
      }
    }

    const output = await this._runPythonScript(scriptPath, scriptArgs);

    // Try to parse JSON output
    try {
      return JSON.parse(output);
    } catch {
      return { output };
    }
  }

  /**
   * Run a Python script directly
   */
  private async _runPythonScript(scriptPath: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const python = spawn(this.pythonPath, [scriptPath, ...args], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      python.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Script failed (code ${code}): ${stderr || stdout}`));
        }
      });

      python.on('error', (err) => {
        reject(new Error(`Failed to start Python: ${err.message}`));
      });
    });
  }

  // ==================== Excel Operations ====================

  /**
   * Recalculate Excel formulas using LibreOffice
   */
  async recalcExcel(filepath: string): Promise<{ success: boolean; errors?: string[] }> {
    const recalcPath = path.join(this.skillsPath, 'xlsx', 'scripts', 'recalc.py');

    if (!fs.existsSync(recalcPath)) {
      // Fallback: return success if script not available
      console.warn('Excel recalc script not found, skipping validation');
      return { success: true };
    }

    try {
      const output = await this._runPythonScript(recalcPath, [filepath, filepath]);

      // Parse for errors
      const errors: string[] = [];
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('ERROR') || line.includes('#REF!') || line.includes('#DIV/0!')) {
          errors.push(line.trim());
        }
      }

      return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    } catch (error) {
      return { success: false, errors: [(error as Error).message] };
    }
  }

  // ==================== PDF Operations ====================

  /**
   * Merge multiple PDF files
   */
  async mergePdf(inputs: string[], output: string): Promise<void> {
    const scriptPath = path.join(this.skillsPath, 'pdf', 'scripts', 'merge.py');

    if (!fs.existsSync(scriptPath)) {
      throw new Error(`PDF merge script not found: ${scriptPath}`);
    }

    const args = [...inputs, '--output', output];
    await this._runPythonScript(scriptPath, args);
  }

  /**
   * Extract tables from PDF to Excel
   */
  async extractPdfTables(filepath: string, output: string): Promise<void> {
    const scriptPath = path.join(this.skillsPath, 'pdf', 'scripts', 'extract_tables.py');

    if (!fs.existsSync(scriptPath)) {
      throw new Error(`PDF table extraction script not found: ${scriptPath}`);
    }

    await this._runPythonScript(scriptPath, [filepath, '--output', output]);
  }
}

// Singleton instance
let bridgeInstance: PythonBridge | null = null;

/**
 * Get the singleton PythonBridge instance
 */
export function getPythonBridge(): PythonBridge {
  if (!bridgeInstance) {
    bridgeInstance = new PythonBridge();
  }
  return bridgeInstance;
}

export default PythonBridge;
