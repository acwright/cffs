export const SECTOR_SIZE = 512;
export const DIR_LBA = 0;
export const DATA_START = 1;
export const MAX_FILES = 16;
export const ENTRY_SIZE = 32;

// Disk banking: the CF card is divided into up to 256 "disk" banks of
// SECTORS_PER_DISK sectors (1 MB) each. Disk n's directory lives at absolute
// LBA n * SECTORS_PER_DISK, and its data sectors follow contiguously. Start
// sectors in directory entries are stored relative to the disk's base LBA, and
// a file may not spill past its disk's region (matches BIOS FS_DISK_SECTORS).
export const SECTORS_PER_DISK = 2048; // 2048 * 512 = 1 MB
export const MAX_DISKS = 256;         // 256 disks = 256 MB total

// Field offsets within a directory entry
export const NAME_OFFSET = 0;
export const NAME_LENGTH = 8;
export const EXT_OFFSET = 8;
export const EXT_LENGTH = 3;
export const FLAGS_OFFSET = 11;
export const START_OFFSET = 12;
export const FSIZE_OFFSET = 14;
export const RESERVED_OFFSET = 16;
export const RESERVED_LENGTH = 16;

// Flags
export const FLAG_USED = 0x01;
