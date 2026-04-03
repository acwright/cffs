# cffs

A CLI tool for creating and managing CompactFlash filesystem images for the A.C. Wright 6502 project.

The filesystem uses a simple flat layout: a single 512-byte directory sector (LBA 0) holding up to 16 entries in 8.3 filename format, followed by contiguous data sectors starting at LBA 1.

## Features

- Create blank CF images of configurable size
- Add, remove, list, and extract files
- Defragment images to reclaim gaps
- Display image statistics

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
# Create a 32 MB image
npx cffs create disk.img --size 32M

# Add a file
npx cffs add disk.img firmware.bin

# List files
npx cffs list disk.img

# Extract a file
npx cffs extract disk.img FIRMWARE.BIN output.bin

# Show image info
npx cffs info disk.img

# Remove a file
npx cffs remove disk.img FIRMWARE.BIN

# Defragment
npx cffs defrag disk.img

# Clear all entries
npx cffs clear disk.img
```

### Development

Run directly from TypeScript without compiling:

```bash
npm run dev -- <command> [options]
```

## Filesystem Layout

| Region    | LBA   | Size       | Description                          |
|-----------|-------|------------|--------------------------------------|
| Directory | 0     | 512 bytes  | Up to 16 × 32-byte directory entries |
| Data      | 1+    | Remainder  | Contiguous file data sectors         |

Each directory entry is 32 bytes:

| Offset | Length | Field        |
|--------|--------|--------------|
| 0      | 8      | Filename     |
| 8      | 3      | Extension    |
| 11     | 1      | Flags        |
| 12     | 2      | Start sector |
| 14     | 2      | File size    |
| 16     | 16     | Reserved     |

## License

MIT