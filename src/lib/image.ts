import { readFileSync, writeFileSync } from 'node:fs';
import { SECTOR_SIZE } from './constants.js';

/**
 * Read an entire image file into a Buffer.
 */
export function openImage(path: string): Buffer {
  return readFileSync(path);
}

/**
 * Write a Buffer to disk as an image file.
 */
export function saveImage(path: string, buf: Buffer): void {
  writeFileSync(path, buf);
}

/**
 * Create a new zeroed image buffer with the given number of sectors.
 */
export function createImage(totalSectors: number): Buffer {
  return Buffer.alloc(totalSectors * SECTOR_SIZE);
}

/**
 * Read a single sector (512 bytes) from the image buffer at the given LBA.
 */
export function readSector(buf: Buffer, lba: number): Buffer {
  const offset = lba * SECTOR_SIZE;
  if (offset + SECTOR_SIZE > buf.length) {
    throw new Error(`Sector ${lba} is out of bounds (image size: ${buf.length} bytes)`);
  }
  return Buffer.from(buf.subarray(offset, offset + SECTOR_SIZE));
}

/**
 * Write 512 bytes of data to the image buffer at the given LBA.
 */
export function writeSector(buf: Buffer, lba: number, data: Buffer): void {
  const offset = lba * SECTOR_SIZE;
  if (offset + SECTOR_SIZE > buf.length) {
    throw new Error(`Sector ${lba} is out of bounds (image size: ${buf.length} bytes)`);
  }
  if (data.length > SECTOR_SIZE) {
    throw new Error(`Data exceeds sector size (${data.length} > ${SECTOR_SIZE})`);
  }
  // Zero the sector first, then copy data (handles data shorter than 512)
  buf.fill(0, offset, offset + SECTOR_SIZE);
  data.copy(buf, offset);
}
