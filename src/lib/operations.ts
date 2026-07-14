import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { SECTOR_SIZE, FLAG_USED, DATA_START, SECTORS_PER_DISK } from './constants.js';
import { DirEntry } from './types.js';
import { parseName, formatName } from './filename.js';
import { writeSector, diskBaseLba, validateDisk } from './image.js';
import {
  readDirectory, writeDirectory, findFile, findFreeSlot,
  calcNextSector, calcSectorCount,
} from './directory.js';

/**
 * Add a host file to the given disk. Optionally rename with targetName (8.3 format).
 * Start sectors are disk-relative; a file may not spill past its disk's region.
 */
export function addFile(buf: Buffer, hostPath: string, disk = 0, targetName?: string): void {
  validateDisk(buf, disk);
  const data = readFileSync(hostPath);

  if (data.length > 0xFFFF) {
    throw new Error(`File too large: ${data.length} bytes (max 65535)`);
  }

  const nameInput = targetName ?? basename(hostPath);
  const { name, ext } = parseName(nameInput);

  const entries = readDirectory(buf, disk);

  // If file with same name exists, clear old entry (overwrite behavior matches BIOS FsSaveFile)
  const existing = findFile(entries, name, ext);
  if (existing) {
    existing.flags = 0;
  }

  const slotIndex = findFreeSlot(entries);
  if (slotIndex === -1) {
    throw new Error('Directory is full (16 entries maximum)');
  }

  // Recalculate next sector (disk-relative) after potentially clearing old entry
  const startSector = calcNextSector(entries);
  const sectorCount = calcSectorCount(data.length);

  // Disk-full guard: the file must fit within this disk's region (matches
  // BIOS FsSaveFile: end sector must be <= FS_DISK_SECTORS).
  if (startSector + sectorCount > SECTORS_PER_DISK) {
    throw new Error(`Not enough space on disk ${disk}: need sector ${startSector + sectorCount}, disk holds ${SECTORS_PER_DISK} sectors`);
  }

  // Write file data to absolute sectors within the disk region
  const base = diskBaseLba(disk);
  for (let i = 0; i < sectorCount; i++) {
    const chunk = Buffer.alloc(SECTOR_SIZE);
    const srcOffset = i * SECTOR_SIZE;
    const remaining = Math.min(SECTOR_SIZE, data.length - srcOffset);
    if (remaining > 0) {
      data.copy(chunk, 0, srcOffset, srcOffset + remaining);
    }
    writeSector(buf, base + startSector + i, chunk);
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

  writeDirectory(buf, entries, disk);
}

/**
 * Remove a file by name (clears flags only, no compaction — matches BIOS FsDeleteFile).
 */
export function removeFile(buf: Buffer, nameInput: string, disk = 0): void {
  validateDisk(buf, disk);
  const { name, ext } = parseName(nameInput);
  const entries = readDirectory(buf, disk);
  const entry = findFile(entries, name, ext);

  if (!entry) {
    throw new Error(`File not found: ${nameInput}`);
  }

  entry.flags = 0;
  writeDirectory(buf, entries, disk);
}

/**
 * List all in-use directory entries on the given disk.
 */
export function listFiles(buf: Buffer, disk = 0): DirEntry[] {
  validateDisk(buf, disk);
  return readDirectory(buf, disk).filter((e) => (e.flags & FLAG_USED) !== 0);
}

/**
 * Extract a file from the given disk to the host filesystem.
 */
export function extractFile(buf: Buffer, nameInput: string, outputPath?: string, disk = 0): void {
  validateDisk(buf, disk);
  const { name, ext } = parseName(nameInput);
  const entries = readDirectory(buf, disk);
  const entry = findFile(entries, name, ext);

  if (!entry) {
    throw new Error(`File not found: ${nameInput}`);
  }

  const base = diskBaseLba(disk);
  const sectorCount = calcSectorCount(entry.fileSize);
  const output = Buffer.alloc(entry.fileSize);

  for (let i = 0; i < sectorCount; i++) {
    const offset = (base + entry.startSector + i) * SECTOR_SIZE;
    const srcSlice = buf.subarray(offset, offset + SECTOR_SIZE);
    const dstOffset = i * SECTOR_SIZE;
    const remaining = Math.min(SECTOR_SIZE, entry.fileSize - dstOffset);
    srcSlice.copy(output, dstOffset, 0, remaining);
  }

  const outPath = outputPath ?? formatName(entry);
  writeFileSync(outPath, output);
}

/**
 * Defragment a disk: sort used entries by startSector, rewrite contiguously
 * from the disk's first data sector, and zero the remainder of the disk region.
 */
export function defragment(buf: Buffer, disk = 0): void {
  validateDisk(buf, disk);
  const base = diskBaseLba(disk);
  const entries = readDirectory(buf, disk);
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
        const srcOffset = (base + entry.startSector + i) * SECTOR_SIZE;
        buf.copy(fileData, i * SECTOR_SIZE, srcOffset, srcOffset + SECTOR_SIZE);
      }

      // Write to new location
      for (let i = 0; i < sectorCount; i++) {
        const chunk = fileData.subarray(i * SECTOR_SIZE, (i + 1) * SECTOR_SIZE);
        writeSector(buf, base + currentSector + i, chunk);
      }

      entry.startSector = currentSector;
    }

    currentSector += sectorCount;
  }

  // Zero out any sectors after the last used file, up to this disk's boundary
  for (let s = currentSector; s < SECTORS_PER_DISK; s++) {
    const offset = (base + s) * SECTOR_SIZE;
    buf.fill(0, offset, offset + SECTOR_SIZE);
  }

  // Write updated directory
  writeDirectory(buf, entries, disk);
}

/**
 * Clear all directory entries on the given disk (zero its directory sector).
 */
export function clearImage(buf: Buffer, disk = 0): void {
  validateDisk(buf, disk);
  const sector = Buffer.alloc(SECTOR_SIZE);
  writeSector(buf, diskBaseLba(disk), sector);
}

/**
 * Return stats for the given disk.
 */
export function imageInfo(buf: Buffer, disk = 0): {
  totalSectors: number;
  totalDisks: number;
  disk: number;
  usedEntries: number;
  freeEntries: number;
  nextFreeSector: number;
  usedDataSectors: number;
  freeDataSectors: number;
} {
  validateDisk(buf, disk);
  const entries = readDirectory(buf, disk);
  const usedEntries = entries.filter((e) => (e.flags & FLAG_USED) !== 0);
  const nextFreeSector = calcNextSector(entries);
  const totalSectors = buf.length / SECTOR_SIZE;

  let usedDataSectors = 0;
  for (const e of usedEntries) {
    usedDataSectors += calcSectorCount(e.fileSize);
  }

  return {
    totalSectors,
    totalDisks: Math.floor(totalSectors / SECTORS_PER_DISK),
    disk,
    usedEntries: usedEntries.length,
    freeEntries: entries.length - usedEntries.length,
    nextFreeSector,
    usedDataSectors,
    // Data sectors available in this disk: SECTORS_PER_DISK - 1 (directory) - used
    freeDataSectors: SECTORS_PER_DISK - 1 - usedDataSectors,
  };
}
