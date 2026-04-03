import { DirEntry } from './types.js';

/**
 * Parse user input into 8.3 filename components.
 * Splits on first dot, uppercases, space-pads to 8+3.
 */
export function parseName(input: string): { name: string; ext: string } {
  const dotIndex = input.indexOf('.');
  let rawName: string;
  let rawExt: string;

  if (dotIndex === -1) {
    rawName = input;
    rawExt = '';
  } else {
    rawName = input.substring(0, dotIndex);
    rawExt = input.substring(dotIndex + 1);
  }

  rawName = rawName.toUpperCase();
  rawExt = rawExt.toUpperCase();

  if (rawName.length === 0 || rawName.length > 8) {
    throw new Error(`Invalid filename: name part must be 1-8 characters, got "${rawName}"`);
  }
  if (rawExt.length > 3) {
    throw new Error(`Invalid filename: extension must be 0-3 characters, got "${rawExt}"`);
  }

  // Validate ASCII printable (no spaces or special control chars in input)
  const validChars = /^[A-Z0-9!#$%&'()\-@^_`{}~]+$/;
  if (!validChars.test(rawName)) {
    throw new Error(`Invalid filename: name contains invalid characters "${rawName}"`);
  }
  if (rawExt.length > 0 && !validChars.test(rawExt)) {
    throw new Error(`Invalid filename: extension contains invalid characters "${rawExt}"`);
  }

  const name = rawName.padEnd(8, ' ');
  const ext = rawExt.padEnd(3, ' ');

  return { name, ext };
}

/**
 * Format a directory entry's name for display as NAME.EXT (trimmed).
 */
export function formatName(entry: DirEntry): string {
  const name = entry.name.trimEnd();
  const ext = entry.ext.trimEnd();
  if (ext.length === 0) {
    return name;
  }
  return `${name}.${ext}`;
}
