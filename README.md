# cffs

A CLI tool for creating and managing CompactFlash filesystem images for the [A.C. Wright 6502](https://github.com/acwright/6502-ACE) family of computer systems.

The card is divided into up to **256 "disk" banks of 1 MB each** (2048 sectors × 512 bytes), for a maximum usable capacity of **256 MB**. Each disk is an independent flat filesystem: a single 512-byte directory sector (holding up to 16 entries in 8.3 filename format) followed by contiguous data sectors. Disk 0 is the default; other commands target a disk with the `--disk` / `-d` flag. This mirrors the `DISK n` (BASIC) / `#NN` (Monitor) banking in the 6502 BIOS.

> 📖 **Guide:** [AC6502 Documentation](https://acwright.github.io/6502-DOCS/) — the user's and programmer's guide for the whole family.
> See [the tool belt](https://acwright.github.io/6502-DOCS/crossdev/tools) and [Storage](https://acwright.github.io/6502-DOCS/using/storage).

## Features

- Create blank CF images by byte size or by disk-bank count
- Add, remove, list, and extract files on any of up to 256 disk banks
- Defragment a disk to reclaim gaps
- Display per-disk statistics

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- npm

## Build

```bash
npm install
npm run build
```

The compiled output is written to the `dist/` directory.

## Usage

After building, run the tool directly with Node or via the `cffs` bin entry:

```bash
# Create a 1 MB image (a single disk bank; this is the default size)
npx cffs create disk.img

# Create a larger image by byte size (32 disk banks)
npx cffs create disk.img --size 32M

# Create an image sized by disk-bank count (256 disks = 256 MB)
npx cffs create disk.img --disks 256

# Add a file (defaults to disk 0)
npx cffs add disk.img firmware.bin

# List files
npx cffs list disk.img

# Extract a file
npx cffs extract disk.img FIRMWARE.BIN output.bin

# Show disk info
npx cffs info disk.img

# Remove a file
npx cffs remove disk.img FIRMWARE.BIN

# Defragment
npx cffs defrag disk.img

# Clear all entries on a disk
npx cffs clear disk.img
```

### Selecting a disk

All file commands (`add`, `remove`, `list`, `extract`, `defrag`, `clear`, `info`)
default to disk 0. Use `--disk` / `-d` (0–255) to target another bank:

```bash
# Add a file to disk 3
npx cffs add disk.img map.dat --disk 3

# List disk 3
npx cffs list disk.img -d 3

# Show stats for disk 3
npx cffs info disk.img -d 3
```

A file may not spill past its disk's 1 MB region; adding a file that would
exceed it fails with a "not enough space on disk" error, matching the BIOS
disk-full guard. The chosen disk must also exist within the image's size.

### Development

Run directly from TypeScript without compiling:

```bash
npm run dev -- <command> [options]
```

## Filesystem Layout

The card is split into disk banks of 2048 sectors (1 MB) each. Disk `n`'s
directory sector lives at absolute LBA `n × 2048`, and its data sectors follow
contiguously within the same 1 MB region. Within a disk, layout is:

| Region    | Disk-relative LBA | Size       | Description                          |
|-----------|-------------------|------------|--------------------------------------|
| Directory | 0                 | 512 bytes  | Up to 16 × 32-byte directory entries |
| Data      | 1 – 2047          | Remainder  | Contiguous file data sectors         |

Directory entry **start sectors are stored disk-relative** (1–2047); the tool
adds the disk's base LBA when reading or writing data.

Each directory entry is 32 bytes:

| Offset | Length | Field        |
|--------|--------|--------------|
| 0      | 8      | Filename     |
| 8      | 3      | Extension    |
| 11     | 1      | Flags        |
| 12     | 2      | Start sector |
| 14     | 2      | File size    |
| 16     | 16     | Reserved     |

## Related

- [6502-ACE](https://github.com/acwright/6502-ACE) — the hardware, and the index of the whole family
- [6502-BIOS](https://github.com/acwright/6502-BIOS) — the firmware whose filesystem this tool writes
- [6502-EMULATOR](https://github.com/acwright/6502-EMULATOR) — mount an image built here as the emulator's CF card
- [bastok](https://github.com/acwright/bastok) — produces the `.prg` / `.bas` images you put on a disk
- [6502-DOCS](https://github.com/acwright/6502-DOCS) — the documentation site: the cross-development guide and the storage chapter

## License

MIT