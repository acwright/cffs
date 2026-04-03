import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { SECTOR_SIZE, FLAG_USED, DATA_START } from './constants.js';
import { DirEntry } from './types.js';
import { parseName, formatName } from './filename.js';
import { writeSector } from './image.js';
import {
  readDirectory, writeDirectory, findFile, findFreeSlot,
  calcNextSector, calcSectorCount,
} from './directory.js';

/**
 * Add a host file to the image. Optionally rename with targetName (8.3 format).
 */
export function addFile(buf: Buffer, hostPath: string, targetName?: string): void {
  const data = readFileSync(hostPath);

  if (data.length > 0xFFFF) {
    throw new Error(`File too large: ${data.length} bytes (max 65535)`);
  }

  const nameInput = targetName ?? basename(hostPath);
  const { name, ext } = parseName(nameInput);

  const entries = readDirectory(buf);

  // If file with same name exists, clear old entry (overwrite behavior matches BIOS FsSaveFile)
  const existing = findFile(entries, name, ext);
  if (existing) {
    existing.flags = 0;
  }

  const slotIndex = findFreeSlot(entries);
  if (slotIndex === -1) {
    throw new Error('Directory is full (16 entries maximum)');
  }

  // Recalculate next sector after potentially clearing old entry
  const startSector = calcNextSector(entries);

  // Check that the file data fits in the image
  const sectorCount = calcSectorCount(data.length);
  const endByte = (startSector + sectorCount) * SECTOR_SIZE;
  if (endByte > buf.length) {
    throw new Error(`Not enough space in image: need sector ${startSector + sectorCount - 1}, image has ${buf.length / SECTOR_SIZE} sectors`);
  }

  // Write file data to sectors
  for (let i = 0; i < sectorCount; i++) {
    const chunk = Buffer.alloc(SECTOR_SIZE);
    const srcOffset = i * SECTOR_SIZE;
    const remaining = Math.min(SECTOR_SIZE, data.length - srcOffset);
    if (remaining > 0) {
      data.copy(chunk, 0, srcOffset, srcOffset + remaining);
    }
    writeSector(buf, startSector + i, chunk);
  }

  // Update directory entry
  entries[slotIndex] = {
    name,
    ext,
    flags: FLAG_USED,
    startSector,
    fileSize: data.length,
    index: slotIndex,
  };

  writeDirectory(buf, entries);
}

/**
 * Remove a file by name (clears flags only, no compaction — matches BIOS FsDeleteFile).
 */
export function removeFile(buf: Buffer, nameInput: string): void {
  const { name, ext } = parseName(nameInput);
  const entries = readDirectory(buf);
  const entry = findFile(entries, name, ext);

  if (!entry) {
    throw new Error(`File not found: ${nameInput}`);
  }

  entry.flags = 0;
  writeDirectory(buf, entries);
}

/**
 * List all in-use directory entries.
 */
export function listFiles(buf: Buffer): DirEntry[] {
  return readDirectory(buf).filter((e) => (e.flags & FLAG_USED) !== 0);
}

/**
 * Extract a file from the image to the host filesystem.
 */
export function extractFile(buf: Buffer, nameInput: string, outputPath?: string): void {
  const { name, ext } = parseName(nameInput);
  const entries = readDirectory(buf);
  const entry = findFile(entries, name, ext);

  if (!entry) {
    throw new Error(`File not found: ${nameInput}`);
  }

  const sectorCount = calcSectorCount(entry.fileSize);
  const output = Buffer.alloc(entry.fileSize);

  for (let i = 0; i < sectorCount; i++) {
    const offset = (entry.startSector + i) * SECTOR_SIZE;
    const srcSlice = buf.subarray(offset, offset + SECTOR_SIZE);
    const dstOffset = i * SECTOR_SIZE;
    const remaining = Math.min(SECTOR_SIZE, entry.fileSize - dstOffset);
    srcSlice.copy(output, dstOffset, 0, remaining);
  }

  const outPath = outputPath ?? formatName(entry);
  writeFileSync(outPath, output);
}

/**
 * Defragment the image: sort used entries by startSector, rewrite contiguously from LBA 1.
 */
export function defragment(buf: Buffer): void {
  const entries = readDirectory(buf);
  const usedEntries = entries
    .filter((e) => (e.flags & FLAG_USED) !== 0)
    .sort((a, b) => a.startSector - b.startSector);

  let currentSector = DATA_START;

  for (const entry of usedEntries) {
    const sectorCount = calcSectorCount(entry.fileSize);

    // Only move if not already in the right spot
    if (entry.startSector !== currentSector) {
      // Read file data from current location
      const fileData = Buffer.alloc(sectorCount * SECTOR_SIZE);
      for (let i = 0; i < sectorCount; i++) {
        const srcOffset = (entry.startSector + i) * SECTOR_SIZE;
        buf.copy(fileData, i * SECTOR_SIZE, srcOffset, srcOffset + SECTOR_SIZE);
      }

      // Write to new location
      for (let i = 0; i < sectorCount; i++) {
        const chunk = fileData.subarray(i * SECTOR_SIZE, (i + 1) * SECTOR_SIZE);
        writeSector(buf, currentSector + i, chunk);
      }

      entry.startSector = currentSector;
    }

    currentSector += sectorCount;
  }

  // Zero out any sectors after the last used file (reclaim space)
  const totalSectors = buf.length / SECTOR_SIZE;
  for (let s = currentSector; s < totalSectors; s++) {
    buf.fill(0, s * SECTOR_SIZE, (s + 1) * SECTOR_SIZE);
  }

  // Write updated directory
  writeDirectory(buf, entries);
}

/**
 * Clear all directory entries (zero the directory sector).
 */
export function clearImage(buf: Buffer): void {
  const sector = Buffer.alloc(SECTOR_SIZE);
  writeSector(buf, 0, sector);
}

/**
 * Return image stats.
 */
export function imageInfo(buf: Buffer): {
  totalSectors: number;
  usedEntries: number;
  freeEntries: number;
  nextFreeSector: number;
  usedDataSectors: number;
  freeDataSectors: number;
} {
  const entries = readDirectory(buf);
  const usedEntries = entries.filter((e) => (e.flags & FLAG_USED) !== 0);
  const nextFreeSector = calcNextSector(entries);
  const totalSectors = buf.length / SECTOR_SIZE;

  let usedDataSectors = 0;
  for (const e of usedEntries) {
    usedDataSectors += calcSectorCount(e.fileSize);
  }

  return {
    totalSectors,
    usedEntries: usedEntries.length,
    freeEntries: entries.length - usedEntries.length,
    nextFreeSector,
    usedDataSectors,
    freeDataSectors: totalSectors - 1 - usedDataSectors, // -1 for directory sector
  };
}
