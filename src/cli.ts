#!/usr/bin/env node

import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { openImage, saveImage, createImage } from './lib/image.js';
import { formatName } from './lib/filename.js';
import { calcSectorCount } from './lib/directory.js';
import {
  addFile, removeFile, listFiles, extractFile,
  defragment, clearImage, imageInfo,
} from './lib/operations.js';

const program = new Command();

program
  .name('cffs')
  .description('CompactFlash Filesystem Image Tool for A.C. Wright 6502 Project')
  .version('1.0.0');

/**
 * Parse a size string like "32M", "512K", "1G", or a plain number (bytes).
 */
function parseSize(value: string): number {
  const match = value.match(/^(\d+)\s*([KMGkmg])?[Bb]?$/);
  if (!match) {
    throw new Error(`Invalid size format: "${value}". Use e.g. 32M, 512K, or bytes.`);
  }
  const num = parseInt(match[1], 10);
  const unit = (match[2] ?? '').toUpperCase();
  switch (unit) {
    case 'K': return num * 1024;
    case 'M': return num * 1024 * 1024;
    case 'G': return num * 1024 * 1024 * 1024;
    default: return num;
  }
}

// ── create ──────────────────────────────────────────────────────────────────
program
  .command('create')
  .description('Create a blank CompactFlash image')
  .argument('<image>', 'Path to image file to create')
  .option('-s, --size <size>', 'Image size (e.g. 32M, 512K)', '32M')
  .action((image: string, opts: { size: string }) => {
    const totalBytes = parseSize(opts.size);
    if (totalBytes % 512 !== 0) {
      console.error('Error: size must be a multiple of 512 bytes');
      process.exit(1);
    }
    const totalSectors = totalBytes / 512;
    const buf = createImage(totalSectors);
    saveImage(image, buf);
    console.log(`Created ${image} (${totalBytes.toLocaleString()} bytes, ${totalSectors.toLocaleString()} sectors)`);
  });

// ── list ────────────────────────────────────────────────────────────────────
program
  .command('list')
  .description('List files in the image')
  .argument('<image>', 'Path to image file')
  .action((image: string) => {
    const buf = openImage(image);
    const files = listFiles(buf);

    if (files.length === 0) {
      console.log('No files in image.');
      return;
    }

    console.log('Name          Size     Start  Sectors');
    console.log('────────────  ───────  ─────  ───────');
    for (const f of files) {
      const display = formatName(f).padEnd(12);
      const size = f.fileSize.toString().padStart(7);
      const start = f.startSector.toString().padStart(5);
      const sectors = calcSectorCount(f.fileSize).toString().padStart(7);
      console.log(`${display}  ${size}  ${start}  ${sectors}`);
    }
  });

// ── add ─────────────────────────────────────────────────────────────────────
program
  .command('add')
  .description('Add a host file to the image')
  .argument('<image>', 'Path to image file')
  .argument('<file>', 'Host file to add')
  .option('-n, --name <name>', 'Target 8.3 filename (default: source filename)')
  .action((image: string, file: string, opts: { name?: string }) => {
    const buf = openImage(image);
    addFile(buf, file, opts.name);
    saveImage(image, buf);
    console.log(`Added ${opts.name ?? file} to ${image}`);
  });

// ── remove ──────────────────────────────────────────────────────────────────
program
  .command('remove')
  .description('Delete a file entry from the image')
  .argument('<image>', 'Path to image file')
  .argument('<name>', 'Filename to remove (8.3 format)')
  .action((image: string, name: string) => {
    const buf = openImage(image);
    removeFile(buf, name);
    saveImage(image, buf);
    console.log(`Removed ${name} from ${image}`);
  });

// ── extract ─────────────────────────────────────────────────────────────────
program
  .command('extract')
  .description('Extract a file from the image to the host filesystem')
  .argument('<image>', 'Path to image file')
  .argument('<name>', 'Filename to extract (8.3 format)')
  .argument('[output]', 'Output path (default: original filename)')
  .action((image: string, name: string, output?: string) => {
    const buf = openImage(image);
    extractFile(buf, name, output);
    console.log(`Extracted ${name} from ${image}`);
  });

// ── defrag ──────────────────────────────────────────────────────────────────
program
  .command('defrag')
  .description('Defragment the image (compact files)')
  .argument('<image>', 'Path to image file')
  .action((image: string) => {
    const buf = openImage(image);
    defragment(buf);
    saveImage(image, buf);
    console.log(`Defragmented ${image}`);
  });

// ── clear ───────────────────────────────────────────────────────────────────
program
  .command('clear')
  .description('Clear all directory entries')
  .argument('<image>', 'Path to image file')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (image: string, opts: { yes?: boolean }) => {
    if (!opts.yes) {
      const rl = createInterface({ input: stdin, output: stdout });
      const answer = await rl.question(`Clear all entries in ${image}? [y/N] `);
      rl.close();
      if (answer.toLowerCase() !== 'y') {
        console.log('Aborted.');
        return;
      }
    }
    const buf = openImage(image);
    clearImage(buf);
    saveImage(image, buf);
    console.log(`Cleared all directory entries in ${image}`);
  });

// ── info ────────────────────────────────────────────────────────────────────
program
  .command('info')
  .description('Display image statistics')
  .argument('<image>', 'Path to image file')
  .action((image: string) => {
    const buf = openImage(image);
    const info = imageInfo(buf);
    console.log(`Image size:       ${(info.totalSectors * 512).toLocaleString()} bytes (${info.totalSectors.toLocaleString()} sectors)`);
    console.log(`Directory:        ${info.usedEntries}/16 entries used, ${info.freeEntries} free`);
    console.log(`Data sectors:     ${info.usedDataSectors} used, ${info.freeDataSectors.toLocaleString()} free`);
    console.log(`Next free sector: ${info.nextFreeSector}`);
  });

program.parse();
