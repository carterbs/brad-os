#!/usr/bin/env tsx
/**
 * Codemod: Convert print() calls to DebugLogger calls
 *
 * Uses tree-sitter to find print() call expressions in Swift files,
 * then applies transformation rules to convert them to DebugLogger.
 *
 * Usage:
 *   npx tsx scripts/codemod-print-to-logger.ts           # Apply changes
 *   npx tsx scripts/codemod-print-to-logger.ts --dry-run  # Preview changes
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT_DIR = path.resolve(import.meta.dirname ?? __dirname, '..');
const IOS_APP_DIR = path.join(ROOT_DIR, 'ios/BradOS/BradOS');
const DEBUG_DIR = path.join(IOS_APP_DIR, 'Debug');
const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PrintCall {
  /** Byte offset of the start of the `print(` call expression */
  startByte: number;
  /** Byte offset of the end of the call expression (after closing `)`) */
  endByte: number;
  /** The full text of the print call */
  text: string;
  /** The argument text inside print("...") */
  argText: string;
  /** Line number (1-indexed) in the file */
  line: number;
}

interface Replacement {
  startByte: number;
  endByte: number;
  newText: string;
  severity: 'info' | 'warn' | 'error';
  /** Whether the surrounding #if DEBUG block was unwrapped */
  debugBlockUnwrapped: boolean;
}

interface DebugBlock {
  /** Byte offset of the start of `#if DEBUG\n` */
  startByte: number;
  /** Byte offset of the end of `#endif` (including newline if present) */
  endByte: number;
  /** Whether the block only contains print statements (and whitespace) */
  onlyPrints: boolean;
  /** The print calls inside this block */
  printCalls: PrintCall[];
}

// ---------------------------------------------------------------------------
// Severity detection
// ---------------------------------------------------------------------------

const ERROR_PATTERN = /\b(fail(ed|ure|ing)?|error|expired|crash(ed|ing)?)\b/i;
const WARN_PATTERN = /(⚠️|\bwarning\b|\bskip(ped|ping)?\b)/i;

function detectSeverity(message: string): 'info' | 'warn' | 'error' {
  if (ERROR_PATTERN.test(message)) return 'error';
  if (WARN_PATTERN.test(message)) return 'warn';
  return 'info';
}

// ---------------------------------------------------------------------------
// Source tag extraction
// ---------------------------------------------------------------------------

// Matches optional emoji prefix, then [SourceTag], then the rest of the message
// Emojis are multi-byte, so match any non-ASCII + spaces before the bracket
const SOURCE_TAG_RE = /^(?:[\s\u{0080}-\u{FFFF}\u{10000}-\u{10FFFF}]*\s*)?\[([A-Za-z0-9_]+)\]\s*/u;

interface ParsedMessage {
  source: string | null;
  cleanMessage: string;
}

function parseMessage(argText: string): ParsedMessage {
  // The argText is the content inside print("...") — it's a Swift string literal
  // We need to work with the raw string content (between the quotes)
  const match = SOURCE_TAG_RE.exec(argText);
  if (match) {
    return {
      source: match[1],
      cleanMessage: argText.slice(match[0].length),
    };
  }
  return { source: null, cleanMessage: argText };
}

// ---------------------------------------------------------------------------
// Build DebugLogger replacement
// ---------------------------------------------------------------------------

function buildDebugLoggerCall(argText: string): { call: string; severity: 'info' | 'warn' | 'error' } {
  const severity = detectSeverity(argText);
  const { source, cleanMessage } = parseMessage(argText);

  let call: string;
  if (source) {
    call = `DebugLogger.${severity}("${cleanMessage}", attributes: ["source": "${source}"])`;
  } else {
    call = `DebugLogger.${severity}("${cleanMessage}")`;
  }

  return { call, severity };
}

// ---------------------------------------------------------------------------
// Find all .swift files (excluding Debug/ directory)
// ---------------------------------------------------------------------------

function findSwiftFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(d: string): void {
    // Skip the Debug directory
    if (d === DEBUG_DIR || d.startsWith(DEBUG_DIR + '/')) return;

    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.swift')) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results.sort();
}

// ---------------------------------------------------------------------------
// Extract print() calls using tree-sitter
// ---------------------------------------------------------------------------

async function findPrintCalls(source: string, parser: any, SwiftLang: any): Promise<PrintCall[]> {
  parser.setLanguage(SwiftLang);
  const tree = parser.parse(source);
  const calls: PrintCall[] = [];

  function visit(node: any): void {
    if (node.type === 'call_expression') {
      // Check if the function being called is `print`
      const fnNode = node.childForFieldName('function') ?? node.namedChildren[0];
      if (fnNode && fnNode.type === 'simple_identifier' && fnNode.text === 'print') {
        const callArgs = node.childForFieldName('arguments') ?? node.namedChildren[1];
        if (callArgs) {
          // Extract the argument text — everything between the parens
          const fullText = node.text as string;
          // Find the argument substring: strip `print(` and trailing `)`
          const argStart = fullText.indexOf('(');
          const argEnd = fullText.lastIndexOf(')');
          if (argStart !== -1 && argEnd !== -1) {
            let argText = fullText.slice(argStart + 1, argEnd).trim();
            // Strip surrounding quotes from string literals
            if (argText.startsWith('"') && argText.endsWith('"')) {
              argText = argText.slice(1, -1);
            }
            calls.push({
              startByte: node.startIndex,
              endByte: node.endIndex,
              text: fullText,
              argText,
              line: node.startPosition.row + 1,
            });
          }
        }
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      visit(node.child(i));
    }
  }

  visit(tree.rootNode);
  return calls;
}

// ---------------------------------------------------------------------------
// Detect #if DEBUG blocks and whether they only contain prints
// ---------------------------------------------------------------------------

function findDebugBlocks(source: string, printCalls: PrintCall[]): DebugBlock[] {
  const blocks: DebugBlock[] = [];
  const ifDebugRe = /^([^\S\n]*)#if DEBUG[^\S\n]*$/gm;

  let match: RegExpExecArray | null;
  while ((match = ifDebugRe.exec(source)) !== null) {
    const blockStart = match.index;
    const indent = match[1];

    // Find the matching #endif at the same indentation level
    // Account for nested #if blocks
    const afterDirective = match.index + match[0].length;
    let depth = 1;
    let endifStart = -1;
    let endifEnd = -1;
    // Escape indent for regex (it's just spaces/tabs, but be safe)
    const escapedIndent = indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const endifRe = new RegExp(`^${escapedIndent}#(if|endif)\\b`, 'gm');
    endifRe.lastIndex = afterDirective;

    let m: RegExpExecArray | null;
    while ((m = endifRe.exec(source)) !== null) {
      if (m[1] === 'if') {
        depth++;
      } else {
        depth--;
        if (depth === 0) {
          endifStart = m.index;
          // Find end of the #endif line
          const lineEnd = source.indexOf('\n', endifStart);
          endifEnd = lineEnd === -1 ? source.length : lineEnd + 1;
          break;
        }
      }
    }

    if (endifStart === -1) continue;

    // Extract the content between #if DEBUG and #endif
    const contentStart = afterDirective + 1; // skip the newline after #if DEBUG
    const contentEnd = endifStart;
    const content = source.slice(contentStart, contentEnd);

    // Check if this block is inside a larger #if DEBUG (e.g., a function-level block)
    // We only want to unwrap blocks that directly wrap print statements
    // For this, check if the block is a simple "wrapper" — content is only print calls and whitespace

    // Find which print calls fall within this block's byte range
    const containedPrints = printCalls.filter(
      (p) => p.startByte >= contentStart && p.endByte <= contentEnd
    );

    // Check if content is ONLY print statements (and whitespace)
    let contentWithoutPrints = content;
    // Remove print call texts from content (working backwards to preserve offsets)
    const sortedPrints = [...containedPrints].sort((a, b) => b.startByte - a.startByte);
    for (const p of sortedPrints) {
      const relStart = p.startByte - contentStart;
      const relEnd = p.endByte - contentStart;
      contentWithoutPrints =
        contentWithoutPrints.slice(0, relStart) + contentWithoutPrints.slice(relEnd);
    }

    const onlyPrints = containedPrints.length > 0 && contentWithoutPrints.trim() === '';

    blocks.push({
      startByte: blockStart,
      endByte: endifEnd,
      onlyPrints,
      printCalls: containedPrints,
    });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Generate diff for dry-run mode
// ---------------------------------------------------------------------------

function generateDiff(filePath: string, original: string, modified: string): string {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const lines: string[] = [];
  const relPath = path.relative(ROOT_DIR, filePath);

  lines.push(`--- a/${relPath}`);
  lines.push(`+++ b/${relPath}`);

  // Simple line-by-line diff
  const maxLen = Math.max(origLines.length, modLines.length);
  let inHunk = false;
  let hunkStart = -1;

  for (let i = 0; i < maxLen; i++) {
    const origLine = origLines[i] ?? '';
    const modLine = modLines[i] ?? '';
    if (origLine !== modLine) {
      if (!inHunk) {
        hunkStart = Math.max(0, i - 2);
        inHunk = true;
        // Print context before
        for (let j = hunkStart; j < i; j++) {
          lines.push(` ${origLines[j]}`);
        }
      }
      if (i < origLines.length) lines.push(`-${origLine}`);
      if (i < modLines.length) lines.push(`+${modLine}`);
    } else {
      if (inHunk) {
        // Print a couple of context lines after, then end hunk
        lines.push(` ${origLine}`);
        if (i + 1 < maxLen && origLines[i + 1] === modLines[i + 1]) {
          lines.push(` ${origLines[i + 1]}`);
          inHunk = false;
          lines.push('');
        }
      }
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Process a single file
// ---------------------------------------------------------------------------

interface FileResult {
  modified: boolean;
  printCount: number;
  infoCount: number;
  warnCount: number;
  errorCount: number;
  debugBlocksUnwrapped: number;
}

function processFile(
  filePath: string,
  source: string,
  printCalls: PrintCall[],
): FileResult {
  const result: FileResult = {
    modified: false,
    printCount: 0,
    infoCount: 0,
    warnCount: 0,
    errorCount: 0,
    debugBlocksUnwrapped: 0,
  };

  if (printCalls.length === 0) return result;

  // Find #if DEBUG blocks
  const debugBlocks = findDebugBlocks(source, printCalls);

  // Build replacements
  const replacements: Replacement[] = [];

  // Track which print calls are inside unwrappable debug blocks
  const printsInUnwrappableBlocks = new Set<PrintCall>();
  for (const block of debugBlocks) {
    if (block.onlyPrints) {
      for (const p of block.printCalls) {
        printsInUnwrappableBlocks.add(p);
      }
    }
  }

  // First handle unwrappable debug blocks (replace the whole block)
  for (const block of debugBlocks) {
    if (!block.onlyPrints) continue;

    // Build replacement text for the entire block
    // Get the indentation of the #if DEBUG line
    const blockLineStart = source.lastIndexOf('\n', block.startByte - 1) + 1;
    const ifDebugLine = source.slice(blockLineStart, source.indexOf('\n', block.startByte));
    const blockIndent = ifDebugLine.match(/^(\s*)/)?.[1] ?? '';

    // Build the replacement lines — each print becomes a DebugLogger call at the same indent
    const loggerLines: string[] = [];
    const severities: Array<'info' | 'warn' | 'error'> = [];
    for (const p of block.printCalls) {
      const { call, severity } = buildDebugLoggerCall(p.argText);
      // Get the indentation of the original print line
      const printLineStart = source.lastIndexOf('\n', p.startByte - 1) + 1;
      const printLine = source.slice(printLineStart, p.startByte);
      const printIndent = printLine.match(/^(\s*)/)?.[1] ?? blockIndent;
      loggerLines.push(`${printIndent}${call}`);
      severities.push(severity);
    }

    // The replacement replaces from blockLineStart to block.endByte
    replacements.push({
      startByte: blockLineStart,
      endByte: block.endByte,
      newText: loggerLines.join('\n') + '\n',
      severity: 'info', // doesn't matter for block-level
      debugBlockUnwrapped: true,
    });

    // Count severities
    for (const sev of severities) {
      if (sev === 'info') result.infoCount++;
      else if (sev === 'warn') result.warnCount++;
      else result.errorCount++;
    }
    result.printCount += block.printCalls.length;
    result.debugBlocksUnwrapped++;
  }

  // Handle individual print calls NOT in unwrappable blocks
  for (const p of printCalls) {
    if (printsInUnwrappableBlocks.has(p)) continue;

    const { call, severity } = buildDebugLoggerCall(p.argText);
    replacements.push({
      startByte: p.startByte,
      endByte: p.endByte,
      newText: call,
      severity,
      debugBlockUnwrapped: false,
    });

    result.printCount++;
    if (severity === 'info') result.infoCount++;
    else if (severity === 'warn') result.warnCount++;
    else result.errorCount++;
  }

  if (replacements.length === 0) return result;
  result.modified = true;

  // Apply replacements in reverse order to preserve byte offsets
  replacements.sort((a, b) => b.startByte - a.startByte);

  let modified = source;
  for (const r of replacements) {
    modified = modified.slice(0, r.startByte) + r.newText + modified.slice(r.endByte);
  }

  if (DRY_RUN) {
    const diff = generateDiff(filePath, source, modified);
    if (diff.trim()) {
      console.log(diff);
      console.log();
    }
  } else {
    fs.writeFileSync(filePath, modified, 'utf-8');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Dynamic import of web-tree-sitter
  const { Parser, Language } = await import('web-tree-sitter');
  await Parser.init();
  const parser = new Parser();

  // Load Swift grammar from tree-sitter-wasms
  const wasmPath = path.join(
    ROOT_DIR,
    'node_modules/tree-sitter-wasms/out/tree-sitter-swift.wasm'
  );
  if (!fs.existsSync(wasmPath)) {
    console.error(`Swift WASM grammar not found at ${wasmPath}`);
    console.error('Run: npm install web-tree-sitter tree-sitter-wasms');
    process.exit(1);
  }
  const SwiftLang = await Language.load(wasmPath);

  // Find all Swift files
  const swiftFiles = findSwiftFiles(IOS_APP_DIR);
  console.log(`Found ${swiftFiles.length} Swift files to scan`);
  if (DRY_RUN) console.log('(dry-run mode — no files will be modified)\n');

  let totalFiles = 0;
  let totalPrints = 0;
  let totalInfo = 0;
  let totalWarn = 0;
  let totalError = 0;
  let totalDebugUnwrapped = 0;

  for (const filePath of swiftFiles) {
    const source = fs.readFileSync(filePath, 'utf-8');
    const printCalls = await findPrintCalls(source, parser, SwiftLang);

    if (printCalls.length === 0) continue;

    const result = processFile(filePath, source, printCalls);

    if (result.modified) {
      totalFiles++;
      totalPrints += result.printCount;
      totalInfo += result.infoCount;
      totalWarn += result.warnCount;
      totalError += result.errorCount;
      totalDebugUnwrapped += result.debugBlocksUnwrapped;
    }
  }

  // Print summary
  console.log(`Codemod ${DRY_RUN ? '(dry-run) ' : ''}complete!`);
  console.log(`  Files modified: ${totalFiles}`);
  console.log(`  print() calls converted: ${totalPrints}`);
  console.log(`    → DebugLogger.info: ${totalInfo}`);
  console.log(`    → DebugLogger.warn: ${totalWarn}`);
  console.log(`    → DebugLogger.error: ${totalError}`);
  console.log(`  #if DEBUG blocks unwrapped: ${totalDebugUnwrapped}`);
}

main().catch((err) => {
  console.error('Codemod failed:', err);
  process.exit(1);
});
