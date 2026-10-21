// Port for handing a text file to the user (ARCHITECTURE §5.15, FR-63, ADR-42). Implemented by the web
// adapter in src/integration/file-io.ts (download) and the native adapter in
// src/integration/native/file-export.ts (cache file + share sheet). Services and UI depend on this only.

export type FileExportOutcome = 'saved' | 'shared' | 'cancelled';

export interface FileExportPort {
  /**
   * Web: download the file (Blob + `<a download>`) → `'saved'`.
   * Native: write to `Directory.Cache`, open the share sheet → `'shared'`, or `'cancelled'` when the user
   * dismissed the sheet. Any other failure rejects.
   */
  saveText(fileName: string, content: string, mimeType: string): Promise<FileExportOutcome>;
}
