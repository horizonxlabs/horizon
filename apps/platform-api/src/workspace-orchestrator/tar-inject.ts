// Inject additional files into a tar buffer (e.g. a Docker build context) IN MEMORY, so publish
// never writes build artifacts (Dockerfile/.dockerignore) into the source workspace. Writing them
// to /workspace would dirty the app's git tree and break the clean-tree publish pre-check on the
// next publish. Appended ustar entries land at the archive root; last-wins tar semantics mean an
// injected file overrides any same-named entry already in the context.

const BLOCK = 512;

export interface TarFile {
  name: string;
  content: string;
}

// Left-pad an octal value into a fixed-width tar numeric field: (length - 1) octal digits + NUL.
function octalField(value: number, length: number): string {
  return value.toString(8).padStart(length - 1, "0") + "\0";
}

function buildHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(BLOCK, 0);
  header.write(name, 0, "utf8"); // name (0-99)
  header.write("0000644\0", 100, "ascii"); // mode
  header.write("0000000\0", 108, "ascii"); // uid
  header.write("0000000\0", 116, "ascii"); // gid
  header.write(octalField(size, 12), 124, "ascii"); // size (124-135)
  header.write(octalField(0, 12), 136, "ascii"); // mtime — fixed 0 for deterministic output
  header.write("        ", 148, "ascii"); // checksum placeholder = 8 spaces (148-155)
  header.write("0", 156, "ascii"); // typeflag: regular file
  header.write("ustar\0", 257, "ascii"); // magic (257-262)
  header.write("00", 263, "ascii"); // version (263-264)

  // Checksum = sum of every header byte with the checksum field counted as spaces. Stored as
  // 6 octal digits + NUL + space (8 bytes). Max sum (512 * 255) fits in 6 octal digits.
  let sum = 0;
  for (let i = 0; i < BLOCK; i += 1) sum += header[i];
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
  return header;
}

function tarEntry(file: TarFile): Buffer {
  const data = Buffer.from(file.content, "utf8");
  const padding = (BLOCK - (data.length % BLOCK)) % BLOCK;
  return Buffer.concat([buildHeader(file.name, data.length), data, Buffer.alloc(padding, 0)]);
}

// A tar archive ends with two or more all-zero 512-byte blocks. Go's archive/tar (used by the
// Docker daemon) stops reading at the first pair, so appended entries MUST come before them —
// trim the trailing zero blocks off the source archive first.
function trimTrailingZeroBlocks(tar: Buffer): Buffer {
  let end = tar.length;
  while (end >= BLOCK) {
    const block = tar.subarray(end - BLOCK, end);
    let allZero = true;
    for (let i = 0; i < BLOCK; i += 1) {
      if (block[i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (!allZero) break;
    end -= BLOCK;
  }
  return tar.subarray(0, end);
}

export function injectTarEntries(tar: Buffer, files: TarFile[]): Buffer {
  if (files.length === 0) return tar;
  const body = trimTrailingZeroBlocks(tar);
  const entries = files.map(tarEntry);
  const terminator = Buffer.alloc(BLOCK * 2, 0); // re-terminate the archive
  return Buffer.concat([body, ...entries, terminator]);
}

// Extract the payload of the FIRST regular-file entry from a tar buffer. `GET /archive?path=<file>`
// wraps a single file in an outer tar; we use it to pull a lean build-context tar we built inside the
// container without buffering the whole 800MB workspace. Skips pax/global extended headers (typeflag
// 'x'/'g') and directories that some tar implementations emit before the file, returning the first
// real file's bytes verbatim.
export function extractFirstFileContent(tar: Buffer): Buffer {
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((b) => b === 0)) break; // end-of-archive marker
    const sizeField = header.subarray(124, 136).toString("ascii").replace(/[^0-7]/g, "");
    const size = sizeField ? parseInt(sizeField, 8) : 0;
    if (!Number.isFinite(size) || size < 0) throw new Error(`invalid tar size field: '${sizeField}'`);
    const dataStart = offset + BLOCK;
    const typeflag = header[156]; // '0' (0x30) or NUL = regular file
    if (typeflag === 0x30 || typeflag === 0) {
      if (dataStart + size > tar.length) throw new Error("tar payload exceeds buffer length");
      return tar.subarray(dataStart, dataStart + size);
    }
    // Skip this entry's header + padded data and continue (e.g. a PaxHeader preceding the file).
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
  }
  throw new Error("no regular file entry found in tar");
}
