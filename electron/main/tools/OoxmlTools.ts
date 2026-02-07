/**
 * OoxmlTools - Tools for Office Open XML document validation and repair
 *
 * This tool group provides professional document validation capabilities
 * using the claude-office-skills Python scripts.
 */

import { Tool, ToolGroup } from '../tools/ToolManager';
import { getPythonBridge } from '../ooxml/PythonBridge';
import fs from 'fs';
import path from 'path';
import os from 'os';

const pythonBridge = getPythonBridge();

/**
 * Validate an Office document structure
 */
async function validateDocument(args: { filepath: string }): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: string;
}> {
  const { filepath } = args;

  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }

  // Create temp directory for unpacked content
  const tempDir = path.join(os.tmpdir(), `ooxml_validate_${Date.now()}`);

  try {
    // Unpack the document
    await pythonBridge.unpackDocx(filepath, tempDir);

    // Validate the unpacked content
    const result = await pythonBridge.validateDocx(tempDir, filepath);

    // Build summary
    const errorCount = result.errors.length;
    const warningCount = result.warnings.length;

    let summary = `Validation complete for: ${path.basename(filepath)}\n`;
    summary += `Status: ${result.valid ? '✓ Valid' : '✗ Invalid'}\n`;
    summary += `Errors: ${errorCount}\n`;
    summary += `Warnings: ${warningCount}`;

    if (errorCount > 0) {
      summary += '\n\nErrors:\n' + result.errors.map(e => `  - ${e}`).join('\n');
    }

    if (warningCount > 0) {
      summary += '\n\nWarnings:\n' + result.warnings.map(w => `  - ${w}`).join('\n');
    }

    return {
      ...result,
      summary
    };
  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Repair a corrupted Office document
 */
async function repairDocument(args: { filepath: string; output?: string }): Promise<{
  success: boolean;
  outputPath: string;
  message: string;
}> {
  const { filepath, output } = args;

  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }

  const outputPath = output || filepath.replace(/\.(\w+)$/, '_repaired.$1');

  try {
    // Unpack the document
    const tempDir = await pythonBridge.unpackDocx(filepath);

    // Validate to identify issues
    const validation = await pythonBridge.validateDocx(tempDir);

    // Re-pack the document (this often fixes minor corruption)
    await pythonBridge.packDocx(tempDir, outputPath);

    // Validate the repaired document
    const repairedTempDir = await pythonBridge.unpackDocx(outputPath);
    const repairedValidation = await pythonBridge.validateDocx(repairedTempDir);

    return {
      success: repairedValidation.valid,
      outputPath,
      message: repairedValidation.valid
        ? 'Document repaired successfully'
        : 'Document re-packed but still has validation issues'
    };
  } catch (error) {
    return {
      success: false,
      outputPath,
      message: `Repair failed: ${(error as Error).message}`
    };
  }
}

/**
 * Extract and analyze document structure
 */
async function analyzeStructure(args: { filepath: string }): Promise<{
  filepath: string;
  type: string;
  hasValidationErrors: boolean;
  structure: {
    parts: string[];
    relationships: number;
    media: number;
  };
}> {
  const { filepath } = args;

  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }

  const ext = path.extname(filepath).toLowerCase();
  const type = ext === '.docx' ? 'Word' : ext === '.pptx' ? 'PowerPoint' : ext === '.xlsx' ? 'Excel' : 'Unknown';

  // Unpack to analyze structure
  const tempDir = await pythonBridge.unpackDocx(filepath);

  const structure = {
    parts: [] as string[],
    relationships: 0,
    media: 0
  };

  try {
    // List all XML files
    const walkDir = (dir: string, base = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(base, entry.name);

        if (entry.isDirectory()) {
          walkDir(fullPath, relPath);
        } else if (entry.name.endsWith('.xml') || entry.name.endsWith('.rels')) {
          structure.parts.push(relPath);

          if (entry.name.includes('rel')) {
            structure.relationships++;
          }
        } else if (entry.name.match(/\.(png|jpg|jpeg|gif|emf|wmf)$/i)) {
          structure.media++;
        }
      }
    };

    walkDir(tempDir);

    // Validate
    const validation = await pythonBridge.validateDocx(tempDir);

    return {
      filepath,
      type,
      hasValidationErrors: !validation.valid,
      structure
    };
  } finally {
    // Cleanup
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Export the tool group
export const ooxmlToolGroup: ToolGroup = {
  name: 'ooxml',
  description: 'Office Open XML document validation and repair tools',
  keywords: ['validate', 'repair', 'check', 'fix', 'corrupt', 'structure', 'analyze'],
  triggers: {
    keywords: ['validate', 'repair', 'fix document', 'check document', 'corrupt'],
    fileExtensions: ['.docx', '.pptx', '.xlsx'],
    dependentTools: []
  },
  tools: [
    {
      name: 'validate_document',
      description: 'Validate an Office document structure and content integrity. Checks for XML well-formedness, OOXML compliance, relationship integrity, and content consistency. Returns detailed error and warning messages.',
      parameters: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Path to the Office document to validate (.docx, .pptx, .xlsx)'
          }
        },
        required: ['filepath']
      },
      handler: validateDocument
    },
    {
      name: 'repair_document',
      description: 'Attempt to repair a corrupted Office document by unpacking and re-packing it. This fixes common issues like minor XML corruption, missing relationship entries, and ZIP structure problems.',
      parameters: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Path to the corrupted Office document'
          },
          output: {
            type: 'string',
            description: 'Optional output path for the repaired document (default: original_repaired.ext)'
          }
        },
        required: ['filepath']
      },
      handler: repairDocument
    },
    {
      name: 'analyze_structure',
      description: 'Analyze the internal structure of an Office document. Returns information about document parts, relationships, media files, and validation status.',
      parameters: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Path to the Office document to analyze'
          }
        },
        required: ['filepath']
      },
      handler: analyzeStructure
    }
  ]
};

export default ooxmlToolGroup;
