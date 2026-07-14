#!/usr/bin/env node

import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { openImage, saveImage, createImage } from './lib/image.js';
import { formatName } from './lib/filename.js';
import { calcSectorCount } from './lib/directory.js';
import { SECTORS_PER_DISK, MAX_DISKS } from './lib/constants.js';
import {
  addFile, removeFile, listFiles, extractFile,
  defragment, clearImage, imageInfo,
} from './lib/operations.js';

const program = new Command();

program
  .name('cffs')
  .description('CompactFlash Filesystem Image Tool for A.C. Wright 6502 Project')
  .version('1.1.0');

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

/**
 * Parse and validate a disk bank number (0 to MAX_DISKS-1).
 */
function parseDisk(value: string): number {
  const disk = parseInt(value, 10);
  if (!Number.isInteger(disk) || disk < 0 || disk >= MAX_DISKS) {
    throw new Error(`Invalid disk: "${value}". Must be 0-${MAX_DISKS - 1}.`);
  }
  return disk;
}

// ── create ──────────────────────────────────────────────────────────────────
program
  .command('create')
  .description('Create a blank CompactFlash image')
  .argument('<image>', 'Path to image file to create')
  .option('-s, --size <size>', 'Image size (e.g. 1M, 512K); one disk bank is 1M', '1M')
  .option('-D, --disks <count>', `Size by disk-bank count (1 MB each); overrides --size`)
  .action((image: string, opts: { size: string; disks?: string }) => {
    let totalBytes: number;
    if (opts.disks !== undefined) {
      const disks = parseInt(opts.disks, 10);
      if (!Number.isInteger(disks) || disks < 1 || disks > MAX_DISKS) {
        console.error(`Error: --disks must be 1-${MAX_DISKS}`);
        process.exit(1);
      }
      totalBytes = disks * SECTORS_PER_DISK * 512;
    } else {
      totalBytes = parseSize(opts.size);
    }
    if (totalBytes % 512 !== 0) {
      console.error('Error: size must be a multiple of 512 bytes');
      process.exit(1);
    }
    const totalSectors = totalBytes / 512;
    const buf = createImage(totalSectors);
    saveImage(image, buf);
    const diskCount = Math.floor(totalSectors / SECTORS_PER_DISK);
    console.log(`Created ${image} (${totalBytes.toLocaleString()} bytes, ${totalSectors.toLocaleString()} sectors, ${diskCount} disk${diskCount === 1 ? '' : 's'})`);
  });

// ── list ────────────────────────────────────────────────────────────────────
program
  .command('list')
  .description('List files on a disk in the image')
  .argument('<image>', 'Path to image file')
  .option('-d, --disk <n>', 'Disk bank to operate on (0-255)', parseDisk, 0)
  .action((image: string, opts: { disk: number }) => {
    const buf = openImage(image);
    const files = listFiles(buf, opts.disk);

    console.log(`Disk ${opts.disk}`);
    if (files.length === 0) {
      console.log('No files on disk.');
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
  .description('Add a host file to a disk in the image')
  .argument('<image>', 'Path to image file')
  .argument('<file>', 'Host file to add')
  .option('-n, --name <name>', 'Target 8.3 filename (default: source filename)')
  .option('-d, --disk <n>', 'Disk bank to operate on (0-255)', parseDisk, 0)
  .action((image: string, file: string, opts: { name?: string; disk: number }) => {
    const buf = openImage(image);
    addFile(buf, file, opts.disk, opts.name);
    saveImage(image, buf);
    console.log(`Added ${opts.name ?? file} to disk ${opts.disk} of ${image}`);
  });

// ── remove ──────────────────────────────────────────────────────────────────
program
  .command('remove')
  .description('Delete a file entry from a disk in the image')
  .argument('<image>', 'Path to image file')
  .argument('<name>', 'Filename to remove (8.3 format)')
  .option('-d, --disk <n>', 'Disk bank to operate on (0-255)', parseDisk, 0)
  .action((image: string, name: string, opts: { disk: number }) => {
    const buf = openImage(image);
    removeFile(buf, name, opts.disk);
    saveImage(image, buf);
    console.log(`Removed ${name} from disk ${opts.disk} of ${image}`);
  });

// ── extract ─────────────────────────────────────────────────────────────────
program
  .command('extract')
  .description('Extract a file from a disk in the image to the host filesystem')
  .argument('<image>', 'Path to image file')
  .argument('<name>', 'Filename to extract (8.3 format)')
  .argument('[output]', 'Output path (default: original filename)')
  .option('-d, --disk <n>', 'Disk bank to operate on (0-255)', parseDisk, 0)
  .action((image: string, name: string, output: string | undefined, opts: { disk: number }) => {
    const buf = openImage(image);
    extractFile(buf, name, output, opts.disk);
    console.log(`Extracted ${name} from disk ${opts.disk} of ${image}`);
  });

// ── defrag ──────────────────────────────────────────────────────────────────
program
  .command('defrag')
  .description('Defragment a disk in the image (compact files)')
  .argument('<image>', 'Path to image file')
  .option('-d, --disk <n>', 'Disk bank to operate on (0-255)', parseDisk, 0)
  .action((image: string, opts: { disk: number }) => {
    const buf = openImage(image);
    defragment(buf, opts.disk);
    saveImage(image, buf);
    console.log(`Defragmented disk ${opts.disk} of ${image}`);
  });

// ── clear ───────────────────────────────────────────────────────────────────
program
  .command('clear')
  .description("Clear a disk's directory entries")
  .argument('<image>', 'Path to image file')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('-d, --disk <n>', 'Disk bank to operate on (0-255)', parseDisk, 0)
  .action(async (image: string, opts: { yes?: boolean; disk: number }) => {
    if (!opts.yes) {
      const rl = createInterface({ input: stdin, output: stdout });
      const answer = await rl.question(`Clear all entries on disk ${opts.disk} of ${image}? [y/N] `);
      rl.close();
      if (answer.toLowerCase() !== 'y') {
        console.log('Aborted.');
        return;
      }
    }
    const buf = openImage(image);
    clearImage(buf, opts.disk);
    saveImage(image, buf);
    console.log(`Cleared all directory entries on disk ${opts.disk} of ${image}`);
  });

// ── info ────────────────────────────────────────────────────────────────────
program
  .command('info')
  .description('Display statistics for a disk in the image')
  .argument('<image>', 'Path to image file')
  .option('-d, --disk <n>', 'Disk bank to operate on (0-255)', parseDisk, 0)
  .action((image: string, opts: { disk: number }) => {
    const buf = openImage(image);
    const info = imageInfo(buf, opts.disk);
    console.log(`Image size:       ${(info.totalSectors * 512).toLocaleString()} bytes (${info.totalSectors.toLocaleString()} sectors)`);
    console.log(`Disks:            ${info.totalDisks} × 1 MB (showing disk ${info.disk})`);
    console.log(`Directory:        ${info.usedEntries}/16 entries used, ${info.freeEntries} free`);
    console.log(`Data sectors:     ${info.usedDataSectors} used, ${info.freeDataSectors.toLocaleString()} free (of ${(SECTORS_PER_DISK - 1).toLocaleString()} per disk)`);
    console.log(`Next free sector: ${info.nextFreeSector} (disk-relative)`);
  });

// Run, surfacing operational errors as clean one-line messages instead of
// raw Node stack traces. Commander's own usage errors are left untouched.
program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});
