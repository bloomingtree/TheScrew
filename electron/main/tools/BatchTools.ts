/**
 * BatchTools - Tools for batch processing Office documents
 *
 * This tool group provides efficient batch operations for processing
 * multiple documents at once, including text replacement and
 * template-based document generation.
 */

import { Tool, ToolGroup } from '../tools/ToolManager';
import { getPythonBridge } from '../ooxml/PythonBridge';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const pythonBridge = getPythonBridge();

/**
 * Batch replace text across multiple Office documents
 */
async function batchReplaceText(args: {
  files: string[];
  replacements: Record<string, string>;
  filePattern?: string;
}): Promise<{
  success: boolean;
  totalFiles: number;
  processed: number;
  failed: number;
  results: Array<{
    file: string;
    success: boolean;
    error?: string;
  }>;
}> {
  const { files, replacements, filePattern } = args;

  let filesToProcess = files;

  // If filePattern is provided, expand it
  if (filePattern) {
    const matchedFiles = await glob(filePattern, { windowsPathsNoEscape: true });
    filesToProcess = [...filesToProcess, ...matchedFiles];
  }

  // Filter to only existing Office files
  filesToProcess = filesToProcess.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.pptx', '.docx'].includes(ext) && fs.existsSync(f);
  });

  if (filesToProcess.length === 0) {
    return {
      success: false,
      totalFiles: 0,
      processed: 0,
      failed: 0,
      results: []
    };
  }

  try {
    const results = await pythonBridge.batchReplacePptx(filesToProcess, replacements);

    const processed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      success: failed === 0,
      totalFiles: filesToProcess.length,
      processed,
      failed,
      results
    };
  } catch (error) {
    return {
      success: false,
      totalFiles: filesToProcess.length,
      processed: 0,
      failed: filesToProcess.length,
      results: filesToProcess.map(f => ({
        file: f,
        success: false,
        error: (error as Error).message
      }))
    };
  }
}

/**
 * Batch create documents from a template
 */
async function batchCreateFromTemplate(args: {
  template: string;
  data: Array<Record<string, any>>;
  outputDir: string;
  nameField?: string;
}): Promise<{
  success: boolean;
  totalDocuments: number;
  created: number;
  failed: number;
  outputFiles: string[];
  results: Array<{
    name: string;
    success: boolean;
    path?: string;
    error?: string;
  }>;
}> {
  const { template, data, outputDir, nameField = 'name' } = args;

  if (!fs.existsSync(template)) {
    throw new Error(`Template file not found: ${template}`);
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    const results = await pythonBridge.batchCreateFromTemplate(
      template,
      data,
      outputDir,
      nameField
    );

    const created = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const outputFiles = results
      .filter(r => r.success)
      .map(r => r.message || '');

    return {
      success: failed === 0,
      totalDocuments: data.length,
      created,
      failed,
      outputFiles,
      results: results.map(r => ({
        name: r.file,
        success: r.success,
        path: r.message,
        error: r.error
      }))
    };
  } catch (error) {
    return {
      success: false,
      totalDocuments: data.length,
      created: 0,
      failed: data.length,
      outputFiles: [],
      results: data.map(d => ({
        name: String(d[nameField] || 'unknown'),
        success: false,
        error: (error as Error).message
      }))
    };
  }
}

/**
 * Extract text inventory from multiple documents
 */
async function batchExtractInventory(args: {
  files: string[];
  outputDir: string;
  filePattern?: string;
}): Promise<{
  success: boolean;
  totalFiles: number;
  extracted: number;
  failed: number;
  inventories: Array<{
    file: string;
    inventory: string;
    error?: string;
  }>;
}> {
  const { files, outputDir, filePattern } = args;

  let filesToProcess = files;

  if (filePattern) {
    const matchedFiles = await glob(filePattern, { windowsPathsNoEscape: true });
    filesToProcess = [...filesToProcess, ...matchedFiles];
  }

  // Filter to only existing Office files
  filesToProcess = filesToProcess.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.pptx', '.docx'].includes(ext) && fs.existsSync(f);
  });

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const inventories: Array<{
    file: string;
    inventory: string;
    error?: string;
  }> = [];

  let extracted = 0;
  let failed = 0;

  for (const file of filesToProcess) {
    const basename = path.basename(file, path.extname(file));
    const outputFile = path.join(outputDir, `${basename}_inventory.json`);

    try {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.pptx') {
        await pythonBridge.extractPptxInventory(file, outputFile);
      } else if (ext === '.docx') {
        await pythonBridge.extractPptxInventory(file, outputFile);
      }

      inventories.push({
        file,
        inventory: outputFile
      });
      extracted++;
    } catch (error) {
      inventories.push({
        file,
        inventory: '',
        error: (error as Error).message
      });
      failed++;
    }
  }

  return {
    success: failed === 0,
    totalFiles: filesToProcess.length,
    extracted,
    failed,
    inventories
  };
}

/**
 * Batch rearrange slides from multiple presentations
 */
async function batchRearrangePresentations(args: {
  presentations: Array<{
    template: string;
    output: string;
    slideOrder: string;
  }>;
}): Promise<{
  success: boolean;
  totalPresentations: number;
  processed: number;
  failed: number;
  results: Array<{
    template: string;
    output: string;
    success: boolean;
    error?: string;
  }>;
}> {
  const { presentations } = args;

  const results: Array<{
    template: string;
    output: string;
    success: boolean;
    error?: string;
  }> = [];

  let processed = 0;
  let failed = 0;

  for (const pres of presentations) {
    try {
      await pythonBridge.rearrangePptxSlides(pres.template, pres.output, pres.slideOrder);
      results.push({
        template: pres.template,
        output: pres.output,
        success: true
      });
      processed++;
    } catch (error) {
      results.push({
        template: pres.template,
        output: pres.output,
        success: false,
        error: (error as Error).message
      });
      failed++;
    }
  }

  return {
    success: failed === 0,
    totalPresentations: presentations.length,
    processed,
    failed,
    results
  };
}

/**
 * Batch generate thumbnails for presentations
 */
async function batchGenerateThumbnails(args: {
  files: string[];
  outputDir: string;
  cols?: number;
  filePattern?: string;
}): Promise<{
  success: boolean;
  totalFiles: number;
  generated: number;
  failed: number;
  thumbnails: Array<{
    file: string;
    thumbnail: string;
    error?: string;
  }>;
}> {
  const { files, outputDir, cols = 4, filePattern } = args;

  let filesToProcess = files;

  if (filePattern) {
    const matchedFiles = await glob(filePattern, { windowsPathsNoEscape: true });
    filesToProcess = [...filesToProcess, ...matchedFiles];
  }

  // Filter to only PPTX files
  filesToProcess = filesToProcess.filter(f => {
    return path.extname(f).toLowerCase() === '.pptx' && fs.existsSync(f);
  });

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const thumbnails: Array<{
    file: string;
    thumbnail: string;
    error?: string;
  }> = [];

  let generated = 0;
  let failed = 0;

  for (const file of filesToProcess) {
    const basename = path.basename(file, path.extname(file));
    const outputFile = path.join(outputDir, `${basename}_thumbnails.jpg`);

    try {
      await pythonBridge.generatePptxThumbnails(file, outputFile, cols);
      thumbnails.push({
        file,
        thumbnail: outputFile
      });
      generated++;
    } catch (error) {
      thumbnails.push({
        file,
        thumbnail: '',
        error: (error as Error).message
      });
      failed++;
    }
  }

  return {
    success: failed === 0,
    totalFiles: filesToProcess.length,
    generated,
    failed,
    thumbnails
  };
}

// Export the tool group
export const batchToolGroup: ToolGroup = {
  name: 'batch',
  description: 'Batch processing tools for Office documents',
  keywords: ['batch', 'bulk', 'multiple', 'many', 'all files'],
  triggers: {
    keywords: ['batch', 'bulk', 'multiple', 'all documents', 'all files', 'each document'],
    fileExtensions: [],
    dependentTools: []
  },
  tools: [
    {
      name: 'batch_replace_text',
      description: 'Replace text across multiple Office documents at once. Supports wildcards via filePattern to process all matching files. Only processes .pptx and .docx files.',
      parameters: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of file paths to process'
          },
          replacements: {
            type: 'object',
            description: 'Object mapping placeholder text to replacement values'
          },
          filePattern: {
            type: 'string',
            description: 'Optional glob pattern to find additional files (e.g., "docs/*.pptx")'
          }
        },
        required: ['replacements']
      },
      handler: batchReplaceText
    },
    {
      name: 'batch_create_from_template',
      description: 'Create multiple documents from a single template by filling it with different data. Each data object generates one output document. The nameField specifies which property to use for naming output files.',
      parameters: {
        type: 'object',
        properties: {
          template: {
            type: 'string',
            description: 'Path to the template file (.pptx or .docx)'
          },
          data: {
            type: 'array',
            items: { type: 'object' },
            description: 'Array of data objects, one for each document to create'
          },
          outputDir: {
            type: 'string',
            description: 'Directory where output files will be saved'
          },
          nameField: {
            type: 'string',
            description: 'Field name to use for naming files (default: "name")'
          }
        },
        required: ['template', 'data', 'outputDir']
      },
      handler: batchCreateFromTemplate
    },
    {
      name: 'batch_extract_inventory',
      description: 'Extract text inventory from multiple documents at once. Creates a JSON file for each document with structured text content. Useful for analyzing or searching across multiple documents.',
      parameters: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of file paths to process'
          },
          outputDir: {
            type: 'string',
            description: 'Directory where inventory JSON files will be saved'
          },
          filePattern: {
            type: 'string',
            description: 'Optional glob pattern to find additional files'
          }
        },
        required: ['outputDir']
      },
      handler: batchExtractInventory
    },
    {
      name: 'batch_rearrange_presentations',
      description: 'Rearrange slides for multiple PowerPoint presentations in one operation. Each presentation can have its own template, output file, and slide order.',
      parameters: {
        type: 'object',
        properties: {
          presentations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                template: { type: 'string' },
                output: { type: 'string' },
                slideOrder: { type: 'string' }
              },
              required: ['template', 'output', 'slideOrder']
            },
            description: 'Array of presentation rearrangement tasks'
          }
        },
        required: ['presentations']
      },
      handler: batchRearrangePresentations
    },
    {
      name: 'batch_generate_thumbnails',
      description: 'Generate thumbnail grid images for multiple PowerPoint presentations at once. Each presentation produces one thumbnail image showing all its slides.',
      parameters: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of presentation file paths'
          },
          outputDir: {
            type: 'string',
            description: 'Directory where thumbnail images will be saved'
          },
          cols: {
            type: 'number',
            description: 'Number of columns in thumbnail grid (default: 4)'
          },
          filePattern: {
            type: 'string',
            description: 'Optional glob pattern to find additional files'
          }
        },
        required: ['outputDir']
      },
      handler: batchGenerateThumbnails
    }
  ]
};

export default batchToolGroup;
