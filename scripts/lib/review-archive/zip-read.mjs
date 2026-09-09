/**
 * Minimal ZIP reader using only Node built-ins (no Python / unzip CLI).
 * Supports store (0) and deflate (8) entries produced by git archive.
 */
import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

/**
 * @param {Buffer} buffer
 * @returns {{ name: string, data: Buffer }[]}
 */
export function readZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw new Error('Invalid ZIP: buffer too small');
  }

  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('Invalid ZIP: end of central directory not found');
  }

  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  /** @type {{ name: string, data: Buffer }[]} */
  const entries = [];
  let offset = centralOffset;

  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(offset) !== CEN_SIG) {
      throw new Error('Invalid ZIP: bad central directory signature');
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    offset += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) {
      continue;
    }

    if (buffer.readUInt32LE(localHeaderOffset) !== LOC_SIG) {
      throw new Error(`Invalid ZIP: bad local header for ${name}`);
    }
    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) {
      data = Buffer.from(compressed);
    } else if (method === 8) {
      data = inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    }

    if (data.length !== uncompressedSize) {
      throw new Error(`ZIP size mismatch for ${name}`);
    }

    entries.push({ name, data });
  }

  return entries;
}

/**
 * @param {Buffer} buffer
 * @returns {string[]}
 */
export function listZipEntryNames(buffer) {
  return readZipEntries(buffer)
    .map((entry) => entry.name)
    .sort();
}
