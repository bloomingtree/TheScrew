/**
 * PDFTools - PDF document manipulation tools
 *
 * Based on claude-office-skills pdf functionality
 */

import { ToolGroup } from './ToolManager';
import { getPythonBridge } from '../ooxml/PythonBridge';

const pythonBridge = getPythonBridge();

/**
 * Merge multiple PDF files into one
 */
async function mergePdf(args: {
  inputs: string[];
  output: string;
}): Promise<{
  success: boolean;
  output: string;
  count: number;
  message: string;
}> {
  const { inputs, output } = args;

  try {
    await pythonBridge.mergePdf(inputs, output);

    return {
      success: true,
      output,
      count: inputs.length,
      message: `Merged ${inputs.length} PDF files into ${output}`,
    };
  } catch (error: any) {
    return {
      success: false,
      output,
      count: 0,
      message: `Failed to merge PDFs: ${error.message}`,
    };
  }
}

/**
 * Extract tables from PDF to Excel
 */
async function extractPdfTables(args: {
  filepath: string;
  output: string;
}): Promise<{
  success: boolean;
  filepath: string;
  output: string;
  tableCount?: number;
  message: string;
}> {
  const { filepath, output } = args;

  try {
    await pythonBridge.extractPdfTables(filepath, output);

    return {
      success: true,
      filepath,
      output,
      message: `Extracted tables from ${filepath} to ${output}`,
    };
  } catch (error: any) {
    return {
      success: false,
      filepath,
      output,
      message: `Failed to extract tables: ${error.message}`,
    };
  }
}

/**
 * Read PDF and extract text content
 */
async function readPdf(args: {
  filepath: string;
}): Promise<{
  success: boolean;
  filepath: string;
  content?: string;
  pageCount?: number;
  message: string;
}> {
  const { filepath } = args;

  try {
    // Execute via pythonBridge with Office Skills
    const result = await pythonBridge.executeOfficeSkill('pdf', 'read', { filepath });

    return {
      success: true,
      filepath,
      content: result.content,
      pageCount: result.pageCount,
      message: `PDF read: ${filepath}`,
    };
  } catch (error: any) {
    return {
      success: false,
      filepath,
      message: `Failed to read PDF: ${error.message}`,
    };
  }
}

// Export tool group
export const pdfToolGroup: ToolGroup = {
  name: 'pdf',
  description: 'PDF document operations - merge, extract tables, and read content',
  keywords: [
    'pdf', 'adobe', 'acrobat',
    '表单', 'form', '合并', 'merge', '提取', 'extract'
  ],
  triggers: {
    keywords: [
      'pdf', 'adobe', 'acrobat',
      '表单', 'form', '合并', 'merge', '提取', 'extract'
    ],
    fileExtensions: ['.pdf'],
    dependentTools: []
  },
  tools: [
    {
      name: 'merge_pdf',
      description: 'Merge multiple PDF files into a single PDF document. The pages are appended in the order provided.',
      parameters: {
        type: 'object',
        properties: {
          inputs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of PDF file paths to merge'
          },
          output: {
            type: 'string',
            description: 'Path for the merged output PDF file'
          }
        },
        required: ['inputs', 'output']
      },
      handler: mergePdf
    },
    {
      name: 'extract_pdf_tables',
      description: 'Extract tables from PDF file and save them to an Excel file. Uses pdfplumber for accurate table extraction.',
      parameters: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Path to the PDF file to extract tables from'
          },
          output: {
            type: 'string',
            description: 'Path for the output Excel file (.xlsx)'
          }
        },
        required: ['filepath', 'output']
      },
      handler: extractPdfTables
    },
    {
      name: 'read_pdf',
      description: 'Read PDF file and extract text content. Returns the full text and page count.',
      parameters: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Path to the PDF file to read'
          }
        },
        required: ['filepath']
      },
      handler: readPdf
    }
  ]
};

export default pdfToolGroup;
