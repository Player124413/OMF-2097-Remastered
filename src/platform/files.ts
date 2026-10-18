// Files the player exchanges with the game: saving a file (a download on the web; in a native shell it goes to the
// platform's Downloads location) and picking files to load.
import { isTauri, saveDesktopFile } from './desktop';

/**
 * Saves a file: a download on the web (some browsers want this to follow a key press or click), or the native shell's
 * Downloads location. Resolves to where it went (the native path, or the name), or rejects when it could not be saved.
 */
export async function saveFile(name: string, data: Uint8Array | Blob, type = 'application/octet-stream'): Promise<string> {
  if (isTauri) {
    const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
    return saveDesktopFile(name, bytes);
  }
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return name;
}

/** Opens the system's file picker (must follow a key press or click). Resolves to the chosen files, or none. */
export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', multiple, accept });
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}
