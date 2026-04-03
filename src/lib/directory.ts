import {
  SECTOR_SIZE, DIR_LBA, MAX_FILES, ENTRY_SIZE,
  NAME_OFFSET, NAME_LENGTH, EXT_OFFSET, EXT_LENGTH,
  FLAGS_OFFSET, START_OFFSET, FSIZE_OFFSET, FLAG_USED,
  DATA_START,
} from './constants.js';
import { DirEntry } from './types.js';
import { readSector, writeSector } from './image.js';

/**
 * Parse all 16 directory entries from LBA 0.
 */
export function readDirectory(buf: Buffer): DirEntry[] {
  const sector = readSector(buf, DIR_LBA);
  const entries: DirEntry[] = [];

  for (let i = 0; i < MAX_FILES; i++) {
    const off = i * ENTRY_SIZE;
    const name = sector.subarray(off + NAME_OFFSET, off + NAME_OFFSET + NAME_LENGTH).toString('ascii');
    const ext = sector.subarray(off + EXT_OFFSET, off + EXT_OFFSET + EXT_LENGTH).toString('ascii');
    const flags = sector[off + FLAGS_OFFSET];
    const startSector = sector.readUInt16LE(off + START_OFFSET);
    const fileSize = sector.readUInt16LE(off + FSIZE_OFFSET);

    entries.push({ name, ext, flags, startSector, fileSize, index: i });
  }

  return entries;
}

/**
 * Serialize directory entries back to LBA 0.
 */
export function writeDirectory(buf: Buffer, entries: DirEntry[]): void {
  const sector = Buffer.alloc(SECTOR_SIZE);

  for (const entry of entries) {
    const off = entry.index * ENTRY_SIZE;
    // Write name (8 bytes, space-padded)
    sector.write(entry.name.padEnd(NAME_LENGTH, ' '), off + NAME_OFFSET, NAME_LENGTH, 'ascii');
    // Write extension (3 bytes, space-padded)
    sector.write(entry.ext.padEnd(EXT_LENGTH, ' '), off + EXT_OFFSET, EXT_LENGTH, 'ascii');
    // Flags
    sector[off + FLAGS_OFFSET] = entry.flags;
    // Start sector (u16 LE)
    sector.writeUInt16LE(entry.startSector, off + START_OFFSET);
    // File size (u16 LE)
    sector.writeUInt16LE(entry.fileSize, off + FSIZE_OFFSET);
    // Reserved bytes stay zeroed
  }

  writeSector(buf, DIR_LBA, sector);
}

/**
 * Find a used directory entry by name and extension (space-padded, uppercase).
 */
export function findFile(entries: DirEntry[], name: string, ext: string): DirEntry | undefined {
  return entries.find(
    (e) => (e.flags & FLAG_USED) !== 0 && e.name === name && e.ext === ext
  );
}

/**
 * Find the first free (unused) directory slot index, or -1 if full.
 */
export function findFreeSlot(entries: DirEntry[]): number {
  const entry = entries.find((e) => (e.flags & FLAG_USED) === 0);
  return entry ? entry.index : -1;
}

/**
 * Calculate the next free sector after all allocated files.
 * Replicates BIOS FsCalcNextSec logic:
 *   sectors = highByte >> 1; if (highByte & 1 || lowByte != 0) sectors++
 */
export function calcSectorCount(fileSize: number): number {
  const lowByte = fileSize & 0xFF;
  const highByte = (fileSize >> 8) & 0xFF;
  let sectors = highByte >> 1;
  if ((highByte & 1) !== 0 || lowByte !== 0) {
    sectors++;
  }
  return sectors;
}

/**
 * Calculate the next free sector for allocation.
 * Returns max(startSector + sectorCount) across all used entries, minimum DATA_START.
 */
export function calcNextSector(entries: DirEntry[]): number {
  let next = DATA_START;

  for (const e of entries) {
    if ((e.flags & FLAG_USED) === 0) continue;
    const sectorCount = calcSectorCount(e.fileSize);
    const end = e.startSector + sectorCount;
    if (end > next) {
      next = end;
    }
  }

  return next;
}
