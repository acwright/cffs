# VDP assessment: cffs

> An outline, not a plan. Surveyed 2026-09-16 across the whole workspace. The work here is
> small enough that `VDP-PLAN.md` may be a few lines.

## The change

The ACE moves from a Pico9918 running stock TMS9918A firmware to the **6502-PICOVDP** on
PICO9918 PRO v2.0 hardware, running **BIOS 2.x**. COB, DEV, KIM, VCS, PicoCalc and
unconverted ACEs stay on the TMS9918A and **BIOS 1.x**, whose last release is **1.6**.

**Decisions already made that matter here:**
- No new repositories.
- **BIOS 1.6** adds only NVRAM save slots in the RTC, and doesn't touch storage.
- **BIOS 2.0 drops the built-in Monitor** and boots straight to BASIC. The CompactFlash
  filesystem format is unchanged: `DISK`, `DIR`, `LOAD`, `SAVE`, `BLOAD`, `BSAVE`,
  `DEL` and `FORMAT` all stay.

---

## This repository's role

Creates and edits CompactFlash images in the BIOS's filesystem format. The assembly
templates (6502-PRG, 6502-BIN) call it from `make cf`.

## Impact: wording only

- **The format:** no change in 1.6 or 2.0. The tool stays valid for both platforms.
- **`README.md`** says disk banking "mirrors the `DISK n` (BASIC) / `#NN` (Monitor)
  banking in the 6502 BIOS". `#NN` exists only on BIOS 1.x.

## Work outline

1. When BIOS 2.0 ships, reword the README: `DISK n` in BASIC on every BIOS, and `#NN` in
   the Monitor on BIOS 1.x.
2. **Watch:** if the later BIOS redesign ever changes the filesystem, this becomes a real
   dialect change, handled like bastok's (`--bios 1|2`, no branch).

## Linked repositories

| Repository | Path | Why |
|---|---|---|
| 6502-BIOS | `~/Developer/Assembly/6502-BIOS` | Owns the filesystem format; drops the Monitor in 2.0 |
| 6502-PRG, 6502-BIN | `~/Developer/Assembly/6502-PRG`, `~/Developer/Assembly/6502-BIN` | Call `cffs` from `make cf` |
