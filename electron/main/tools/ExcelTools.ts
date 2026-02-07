/**
 * ExcelTools - Excel spreadsheet manipulation tools
 *
 * Based on claude-office-skills xlsx functionality
 */

import { ToolGroup } from './ToolManager';
import { getPythonBridge } from '../ooxml/PythonBridge';

const pythonBridge = getPythonBridge();

/**
 * Create a new Excel spreadsheet
 */
async function createExcel(args: {
  filepath: string;
  data?: Record<string, any>;
  sheets?: Record<string, any[]>;
}): Promise<{
  success: boolean;
  filepath: string;
  message: string;
}> {
  const { filepath } = args;

  try {
    // Execute via pythonBridge with Office Skills
    // The actual implementation will use the Python scripts from claude-office-skills
    await pythonBridge.executeOfficeSkill('xlsx', 'create', args);

    return {
      success: true,
      filepath,
      message: `Excel file created: ${filepath}`,
    };
  } catch (error: any) {
    return {
      success: false,
      filepath,
      message: `Failed to create Excel: ${error.message}`,
    };
  }
}

/**
 * Recalculate Excel formulas using LibreOffice
 * Ensures zero formula errors
 */
async function recalcExcel(args: {
  filepath: string;
}): Promise<{
  success: boolean;
  filepath: string;
  errors?: string[];
  message: string;
}> {
  const { filepath } = args;

  try {
    const result = await pythonBridge.recalcExcel(filepath);

    return {
      success: result.success,
      filepath,
      errors: result.errors,
      message: result.success
        ? 'Excel formulas recalculated successfully'
        : `Excel recalc completed with ${result.errors?.length || 0} errors`,
    };
  } catch (error: any) {
    return {
      success: false,
      filepath,
      message: `Failed to recalc Excel: ${error.message}`,
    };
  }
}

/**
 * Read Excel file and extract content
 */
async function readExcel(args: {
  filepath: string;
}): Promise<{
  success: boolean;
  filepath: string;
  sheets?: string[];
  data?: Record<string, any[]>;
  message: string;
}> {
  const { filepath } = args;

  try {
    // Execute via pythonBridge with Office Skills
    const result = await pythonBridge.executeOfficeSkill('xlsx', 'read', { filepath });

    return {
      success: true,
      filepath,
      sheets: result.sheets,
      data: result.data,
      message: `Excel file read: ${filepath}`,
    };
  } catch (error: any) {
    return {
      success: false,
      filepath,
      message: `Failed to read Excel: ${error.message}`,
    };
  }
}

// Export tool group
export const xlsxToolGroup: ToolGroup = {
  name: 'xlsx',
  description: 'Excel spreadsheet operations - create, read, and recalculate formulas',
  keywords: [
    'excel', 'xlsx', 'spreadsheet', '财务', '工作簿',
    '表格', '电子表格', 'sheet', '公式', '单元格',
    '.xlsx', '.xls'
  ],
  triggers: {
    keywords: [
      'excel', 'xlsx', 'spreadsheet', '财务', '工作簿',
      '表格', '电子表格', 'sheet', '公式', '单元格'
    ],
    fileExtensions: ['.xlsx', '.xls'],
    dependentTools: []
  },
  tools: [
    {
      name: 'create_excel',
      description: 'Create a new Excel spreadsheet with data and formulas. Supports multiple sheets. Use openpyxl for reliable Excel file creation.',
      parameters: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Path for the output Excel file (.xlsx)'
          },
          data: {
            type: 'object',
            description: 'Optional data object with cell values and formulas'
          },
          sheets: {
            type: 'object',
            description: 'Dictionary of sheet names to 2D arrays of data'
          }
        },
        required: ['filepath']
      },
      handler: createExcel
    },
    {
      name: 'recalc_excel',
      description: 'Recalculate all formulas in Excel using LibreOffice to ensure zero formula errors. Validates formula syntax and dependencies.',
      parameters: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Path to the Excel file to recalculate'
          }
        },
        required: ['filepath']
      },
      handler: recalcExcel
    },
    {
      name: 'read_excel',
      description: 'Read Excel file and extract sheet data. Returns sheet names and cell values as 2D arrays.',
      parameters: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Path to the Excel file to read'
          }
        },
        required: ['filepath']
      },
      handler: readExcel
    }
  ]
};

export default xlsxToolGroup;
