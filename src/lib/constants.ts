export const SECTOR_SIZE = 512;
export const DIR_LBA = 0;
export const DATA_START = 1;
export const MAX_FILES = 16;
export const ENTRY_SIZE = 32;

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
