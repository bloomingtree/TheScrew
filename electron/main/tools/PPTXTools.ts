/**
 * PPTXTools - Tools for PowerPoint presentation manipulation
 *
 * This tool group provides comprehensive PPTX file operations including
 * reading, creating, rearranging slides, and batch text replacement.
 */

import { Tool, ToolGroup } from '../tools/ToolManager';
import { getPythonBridge } from '../ooxml/PythonBridge';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const pythonBridge = getPythonBridge();

/**
 * Read a PowerPoint presentation and extract its content
 */
async function readPptx(args: { filepath: string }): Promise<{
  filepath: string;
  slideCount: number;
  content: string;
  structure: {
    titles: string[];
    slideTexts: string[];
  };
}> {
  const { filepath } = args;

  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }

  // Extract inventory using Python script
  const tempJson = filepath.replace('.pptx', '_inventory.json');

  try {
    await pythonBridge.extractPptxInventory(filepath, tempJson);

    // Read the inventory JSON
    const inventoryContent = fs.readFileSync(tempJson, 'utf-8');
    const inventory = JSON.parse(inventoryContent);

    const slides = Object.keys(inventory);
    const titles: string[] = [];
    const slideTexts: string[] = [];

    for (const [slideId, slideData] of Object.entries(inventory)) {
      const data = slideData as any;
      if (data.title) {
        titles.push(data.title);
      }
      if (data.text) {
        slideTexts.push(data.text);
      }
    }

    return {
      filepath,
      slideCount: slides.length,
      content: `Presentation with ${slides.length} slides`,
      structure: {
        titles,
        slideTexts
      }
    };
  } finally {
    // Cleanup temp file
    if (fs.existsSync(tempJson)) {
      fs.unlinkSync(tempJson);
    }
  }
}

/**
 * Rearrange slides in a PowerPoint presentation
 */
async function rearrangeSlides(args: {
  template: string;
  output: string;
  slideOrder: string;
}): Promise<{
  success: boolean;
  output: string;
  slideCount: number;
  message: string;
}> {
  const { template, output, slideOrder } = args;

  if (!fs.existsSync(template)) {
    throw new Error(`Template file not found: ${template}`);
  }

  try {
    await pythonBridge.rearrangePptxSlides(template, output, slideOrder);

    // Read the new presentation to get slide count
    const result = await readPptx({ filepath: output });

    return {
      success: true,
      output,
      slideCount: result.slideCount,
      message: `Created presentation with ${result.slideCount} slides using order: ${slideOrder}`
    };
  } catch (error) {
    return {
      success: false,
      output,
      slideCount: 0,
      message: `Failed to rearrange slides: ${(error as Error).message}`
    };
  }
}

/**
 * Replace text in PowerPoint slides using JSON replacements
 */
async function replaceSlideText(args: {
  input: string;
  replacements: Record<string, any> | string;
  output: string;
}): Promise<{
  success: boolean;
  output: string;
  replacementsApplied: number;
  message: string;
}> {
  const { input, replacements, output } = args;

  if (!fs.existsSync(input)) {
    throw new Error(`Input file not found: ${input}`);
  }

  try {
    await pythonBridge.replacePptxText(input, replacements, output);

    // Count replacements (if replacements is an object)
    let count = 0;
    if (typeof replacements === 'object') {
      count = Object.keys(replacements).length;
    } else if (typeof replacements === 'string') {
      // Read JSON file to count
      if (fs.existsSync(replacements)) {
        const content = JSON.parse(fs.readFileSync(replacements, 'utf-8'));
        count = Object.keys(content).length;
      }
    }

    return {
      success: true,
      output,
      replacementsApplied: count,
      message: `Replaced ${count} text items in ${output}`
    };
  } catch (error) {
    return {
      success: false,
      output,
      replacementsApplied: 0,
      message: `Failed to replace text: ${(error as Error).message}`
    };
  }
}

/**
 * Generate thumbnail grid for PowerPoint slides
 */
async function generateThumbnails(args: {
  input: string;
  output: string;
  cols?: number;
}): Promise<{
  success: boolean;
  outputPath: string;
  message: string;
}> {
  const { input, output, cols = 4 } = args;

  if (!fs.existsSync(input)) {
    throw new Error(`Input file not found: ${input}`);
  }

  try {
    const outputPath = await pythonBridge.generatePptxThumbnails(input, output, cols);

    return {
      success: true,
      outputPath,
      message: `Generated thumbnail grid at ${outputPath}`
    };
  } catch (error) {
    return {
      success: false,
      outputPath: output,
      message: `Failed to generate thumbnails: ${(error as Error).message}`
    };
  }
}

/**
 * Create a PowerPoint presentation from HTML slides
 */
async function createFromHtml(args: {
  htmlSlides: string[];
  output: string;
  title?: string;
}): Promise<{
  success: boolean;
  output: string;
  slideCount: number;
  message: string;
}> {
  const { htmlSlides, output, title = 'Presentation' } = args;

  try {
    // Create a temporary HTML file with slides
    const tempHtml = path.join(path.dirname(output), '_temp_slides.html');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; }
    .slide {
      width: 1280px;
      height: 720px;
      page-break-after: always;
      position: relative;
      background: white;
      padding: 40px;
      box-sizing: border-box;
    }
    .slide h1 { font-size: 48px; margin-bottom: 20px; }
    .slide h2 { font-size: 36px; margin-bottom: 15px; }
    .slide p { font-size: 24px; line-height: 1.5; }
    .slide ul { font-size: 24px; }
  </style>
</head>
<body>
${htmlSlides.map(slide => `<div class="slide">${slide}</div>`).join('\n')}
</body>
</html>
    `;

    fs.writeFileSync(tempHtml, htmlContent);

    // Use LibreOffice to convert HTML to PPTX
    // This requires LibreOffice to be installed
    const libreOfficePath = process.env.LIBREOFFICE_PATH ||
      (process.platform === 'win32' ? 'soffice' : 'libreoffice');

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(libreOfficePath, [
        '--headless',
        '--convert-to', 'pptx',
        '--outdir', path.dirname(output),
        tempHtml
      ]);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`LibreOffice exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start LibreOffice: ${err.message}`));
      });
    });

    // Cleanup temp file
    fs.unlinkSync(tempHtml);

    return {
      success: true,
      output,
      slideCount: htmlSlides.length,
      message: `Created presentation with ${htmlSlides.length} slides`
    };
  } catch (error) {
    return {
      success: false,
      output,
      slideCount: 0,
      message: `Failed to create from HTML: ${(error as Error).message}. LibreOffice must be installed.`
    };
  }
}

// Export the tool group
export const pptxToolGroup: ToolGroup = {
  name: 'pptx',
  description: 'PowerPoint presentation manipulation tools',
  keywords: ['pptx', 'powerpoint', 'presentation', 'slides', 'deck'],
  triggers: {
    keywords: ['pptx', 'powerpoint', 'presentation', 'slides', 'slide', 'deck'],
    fileExtensions: ['.pptx', '.ppt'],
    dependentTools: []
  },
  tools: [
    {
      name: 'read_pptx',
      description: 'Read a PowerPoint presentation and extract slide content, titles, and text. Returns structured information about all slides in the presentation.',
      parameters: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Path to the PowerPoint (.pptx) file'
          }
        },
        required: ['filepath']
      },
      handler: readPptx
    },
    {
      name: 'rearrange_slides',
      description: 'Rearrange, duplicate, and delete slides in a PowerPoint presentation. The slideOrder parameter is a comma-separated list of slide indices (0-based) from the template. Example: "0,5,5,12,3" creates a 5-slide presentation: slides 0, 5, another copy of 5, 12, and 3.',
      parameters: {
        type: 'object',
        properties: {
          template: {
            type: 'string',
            description: 'Path to the template PowerPoint file'
          },
          output: {
            type: 'string',
            description: 'Path for the output PowerPoint file'
          },
          slideOrder: {
            type: 'string',
            description: 'Comma-separated slide indices (0-based), e.g., "0,5,5,12,3"'
          }
        },
        required: ['template', 'output', 'slideOrder']
      },
      handler: rearrangeSlides
    },
    {
      name: 'replace_slide_text',
      description: 'Batch replace text in PowerPoint slides. Takes a JSON object mapping placeholder text to replacement values, or a path to a JSON file with replacements. Only shapes with matching text are modified; other shapes remain unchanged.',
      parameters: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Path to the input PowerPoint file'
          },
          replacements: {
            'oneOf': [
              { type: 'object', description: 'JSON object with replacements' },
              { type: 'string', description: 'Path to JSON file with replacements' }
            ]
          },
          output: {
            type: 'string',
            description: 'Path for the output PowerPoint file'
          }
        },
        required: ['input', 'replacements', 'output']
      },
      handler: replaceSlideText
    },
    {
      name: 'generate_thumbnails',
      description: 'Generate a thumbnail grid image showing all slides in a PowerPoint presentation. Useful for quick visual overview of presentation content.',
      parameters: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Path to the PowerPoint file'
          },
          output: {
            type: 'string',
            description: 'Path for the output thumbnail image (jpg or png)'
          },
          cols: {
            type: 'number',
            description: 'Number of columns in thumbnail grid (default: 4)'
          }
        },
        required: ['input', 'output']
      },
      handler: generateThumbnails
    },
    {
      name: 'create_from_html',
      description: 'Create a PowerPoint presentation from HTML slides. Each HTML string becomes a slide. Requires LibreOffice to be installed on the system.',
      parameters: {
        type: 'object',
        properties: {
          htmlSlides: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of HTML content strings, one per slide'
          },
          output: {
            type: 'string',
            description: 'Path for the output PowerPoint file'
          },
          title: {
            type: 'string',
            description: 'Presentation title (default: "Presentation")'
          }
        },
        required: ['htmlSlides', 'output']
      },
      handler: createFromHtml
    }
  ]
};

export default pptxToolGroup;
