#!/usr/bin/env node
/**
 * cli.ts — CLI entry point (commander-based)
 *
 * officecli-lite: Lightweight Office document CLI — memory optimized for Win7/8GB
 */

import { Command } from 'commander';
import { COMMANDS, getCommand, getCommandNames } from './commands';
import { formatOutput, truncateOutput } from './core/output';
import type { CLIOptions } from './types';

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
  .description('Add a new element')
  .action(async (filePath: string, elemPath: string, type: string) => {
    await runCommand('add', filePath, [elemPath, type], collectOptions());
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

  try {
    const result = await entry.handler(filePath, args, options);

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
