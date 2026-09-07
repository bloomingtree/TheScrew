#!/usr/bin/env node
/**
 * cli.ts — CLI entry point (commander-based)
 *
 * officecli-lite: Lightweight Office document CLI — memory optimized for Win7/8GB
 */

import { Command } from 'commander';
import { COMMANDS, getCommand, getCommandNames } from './commands';
import { formatOutput, truncateOutput } from './core/output';
import { withFileLock } from './core/file-lock';
import type { CLIOptions } from './types';

/** 写命令集合：会修改文件，需要加锁防并发覆盖 */
const WRITE_COMMANDS = new Set(['create', 'set', 'add', 'remove', 'replace', 'merge', 'batch', 'applyStyle', 'clone', 'newslide']);

const VERSION = '1.0.0';

const program = new Command();

program
  .name('officecli-lite')
  .description('Lightweight Office document CLI — memory optimized for Win7/8GB')
  .version(VERSION);

// ── Global options (applied to all subcommands) ────────────────
program
  .option('--json', 'Output results as JSON')
  .option('--max-output <chars>', 'Maximum output length (0 = unlimited)', '0')
  .option('--verbose', 'Verbose logging');

// ── Sub-commands ───────────────────────────────────────────────

// create
program
  .command('create <file>')
  .description('Create a new Office document')
  .action(async (filePath: string) => {
    await runCommand('create', filePath, [], collectOptions());
  });

// view
program
  .command('view <file>')
  .description('View document structure/content')
  .action(async (filePath: string) => {
    await runCommand('view', filePath, [], collectOptions());
  });

// get
program
  .command('get <file> <path> <property>')
  .description('Get an element property')
  .action(async (filePath: string, elemPath: string, prop: string) => {
    await runCommand('get', filePath, [elemPath, prop], collectOptions());
  });

// set
program
  .command('set <file> <path> <propValue>')
  .description('Set an element property (format: prop=value)')
  .action(async (filePath: string, elemPath: string, propValue: string) => {
    await runCommand('set', filePath, [elemPath, propValue], collectOptions());
  });

// add
program
  .command('add <file> <path> <type>')
  .description('Add a new element (paragraph/pageBreak/table/row/column)')
  .option('--rows <n>', 'Number of rows for table type', '2')
  .option('--cols <n>', 'Number of cols for table type', '2')
  .option('--text <txt>', 'Initial text for paragraph type')
  .action(async (filePath: string, elemPath: string, type: string, cmdOpts: { rows?: string; cols?: string; text?: string }) => {
    const opts = collectOptions();
    if (cmdOpts.rows) opts.rows = cmdOpts.rows;
    if (cmdOpts.cols) opts.cols = cmdOpts.cols;
    if (cmdOpts.text !== undefined) opts.text = cmdOpts.text;
    await runCommand('add', filePath, [elemPath, type], opts);
  });

// remove
program
  .command('remove <file> <path>')
  .description('Remove an element')
  .action(async (filePath: string, elemPath: string) => {
    await runCommand('remove', filePath, [elemPath], collectOptions());
  });

// find
program
  .command('find <file> <pattern>')
  .description('Search for text in the document')
  .action(async (filePath: string, pattern: string) => {
    await runCommand('find', filePath, [pattern], collectOptions());
  });

// replace
program
  .command('replace <file> <old> <new>')
  .description('Replace text in the document')
  .action(async (filePath: string, oldText: string, newText: string) => {
    await runCommand('replace', filePath, [oldText, newText], collectOptions());
  });

// merge
program
  .command('merge <file>')
  .description('Merge data into a template')
  .requiredOption('--data <json>', 'JSON data to merge')
  .action(async (filePath: string, cmdOpts: { data: string }) => {
    const opts = collectOptions();
    opts.data = cmdOpts.data;
    await runCommand('merge', filePath, [], opts);
  });

// batch
program
  .command('batch <file>')
  .description('Execute batch commands from stdin')
  .action(async (filePath: string) => {
    await runCommand('batch', filePath, [], collectOptions());
  });

// raw
program
  .command('raw <file>')
  .description('Raw XML access')
  .requiredOption('--xpath <xp>', 'XPath expression')
  .action(async (filePath: string, cmdOpts: { xpath: string }) => {
    const opts = collectOptions();
    opts.xpath = cmdOpts.xpath;
    await runCommand('raw', filePath, [], opts);
  });

// applyStyle
program
  .command('applyStyle <target> <template>')
  .description('Apply styles from a template document to the target')
  .action(async (targetPath: string, templatePath: string) => {
    await runCommand('applyStyle', targetPath, [templatePath], collectOptions());
  });

// validate
program
  .command('validate <file>')
  .description('Validate document structure (checks OOXML compliance)')
  .action(async (filePath: string) => {
    await runCommand('validate', filePath, [], collectOptions());
  });

// clone — 复制模板 pptx 并清空 slides，保留主题/版式/母版/媒体
program
  .command('clone <target> <template>')
  .description('Create a new .pptx that copies a template\'s theme/masters/layouts/media but contains no slides')
  .action(async (targetPath: string, templatePath: string) => {
    await runCommand('clone', targetPath, [templatePath], collectOptions());
  });

// layouts — 列出版式及占位符
program
  .command('layouts <file>')
  .description('List slide layouts with placeholders, backgrounds, and theme fonts')
  .action(async (filePath: string) => {
    await runCommand('layouts', filePath, [], collectOptions());
  });

// newslide — 按版式新增一页
program
  .command('newslide <file>')
  .description('Add a slide using a slide layout (placeholders copied from layout, text inherits layout styles)')
  .requiredOption('--layout <n>', 'Layout number (see layouts command)')
  .option('--title <t>', 'Text for title/ctrTitle placeholder')
  .option('--subtitle <t>', 'Text for subTitle placeholder')
  .option('--texts <json>', 'JSON array (or single string) of texts for body placeholders, in order; \\n splits paragraphs')
  .action(async (filePath: string, cmdOpts: { layout: string; title?: string; subtitle?: string; texts?: string }) => {
    const opts = collectOptions();
    opts.layout = cmdOpts.layout;
    if (cmdOpts.title !== undefined) opts.title = cmdOpts.title;
    if (cmdOpts.subtitle !== undefined) opts.subtitle = cmdOpts.subtitle;
    if (cmdOpts.texts !== undefined) opts.texts = cmdOpts.texts;
    await runCommand('newslide', filePath, [], opts);
  });

// ── Helpers ────────────────────────────────────────────────────

/**
 * Collect global CLI options from the parent program.
 */
function collectOptions(): CLIOptions {
  const globalOpts = program.opts();
  return {
    json: globalOpts.json === true,
    maxOutput: parseInt(globalOpts.maxOutput ?? '0', 10),
    verbose: globalOpts.verbose === true,
    xpath: undefined,
    data: undefined,
    rows: undefined,
    cols: undefined,
    text: undefined,
  };
}

/**
 * Execute a command and print the result.
 */
async function runCommand(
  name: string,
  filePath: string,
  args: string[],
  options: CLIOptions,
): Promise<void> {
  const entry = getCommand(name);
  if (!entry) {
    console.error(`Unknown command: ${name}`);
    process.exit(1);
  }

  if (options.verbose) {
    console.error(`[verbose] command=${name} file=${filePath} args=${JSON.stringify(args)}`);
  }

  // 写命令整体加文件锁（batch 在锁内递归调用 handler，不会重入此层）
  const exec = () => entry.handler(filePath, args, options);
  const wrapped = WRITE_COMMANDS.has(name) ? () => withFileLock(filePath, exec) : exec;

  try {
    const result = await wrapped();

    let output: string;
    if (result.success) {
      if (result.data !== undefined) {
        output = formatOutput(result.data, options.json);
      } else {
        output = result.message ?? 'OK';
      }
    } else {
      output = options.json
        ? JSON.stringify({ error: result.error, success: false }, null, 2)
        : `Error: ${result.error}`;
    }

    // Apply truncation if maxOutput is set
    const maxOutput = options.maxOutput ?? 0;
    if (maxOutput > 0) {
      output = truncateOutput(output, maxOutput);
    }

    console.log(output);

    if (!result.success) {
      process.exit(1);
    }
  } catch (err: unknown) {
    const message = (err as Error).message ?? String(err);
    if (options.json) {
      console.log(JSON.stringify({ error: message, success: false }, null, 2));
    } else {
      console.error(`Error: ${message}`);
    }
    process.exit(1);
  }
}

// ── Run ────────────────────────────────────────────────────────
program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(`Fatal: ${(err as Error).message ?? err}`);
  process.exit(1);
});
