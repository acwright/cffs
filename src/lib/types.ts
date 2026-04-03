export interface DirEntry {
  name: string;
  ext: string;
  flags: number;
  startSector: number;
  fileSize: number;
  index: number;
}
