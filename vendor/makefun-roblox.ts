// make.fun's Roblox place library for Node 22: one file, the Node standard library only, erasable
// TypeScript, so it runs as-is under `node main.ts` with no flags, no build and no install. Copy it to
// vendor/makefun-roblox.ts in your repository (a copy anywhere else counts as lines you wrote) and import it:
//
//   import { buildDossier } from './vendor/makefun-roblox.ts';
//   writeFileSync('/output/dossier.json', buildDossier('/output', { text_max_bytes: 65536 }));
//
// The bounty's scorer runs this same file, byte for byte, on what you hand in, and requires your
// dossier.json to equal what buildDossier writes from your game.rbxl, src/ and screenshots/.
//
//   readPlace(buf, caps)    a binary place (.rbxl) or model (.rbxm): every class with its instance
//                           count, and each Script, LocalScript and ModuleScript with its instance path
//                           (names from the DataModel down, joined by '.') and its Source as bytes; caps
//                           (each optional) bound its instances, its scripts' sources and their paths
//   placeFraming(buf)       the header and the chunk framing through END, nothing decompressed
//   chunkData(buf, chunk)   one framed chunk's data, decompressed
//   uniqueIdTimes(buf)      the creation time each UniqueId property carries (Studio stamps one per instance)
//   matchSources(place, f)  which source files equal a script of the place, and the share of the
//                           place's script bytes they cover
//   rojoPath(file)          the instance path (relative to its mount) and class Rojo 7.7 gives a file
//   canonicalJson(value)    JSON with sorted keys and no spaces: one spelling per value
//   buildDossier(dir, caps) the dossier (makefun/dossier/v1) of a game directory, as canonical JSON bytes
//
// The bounty's scorer gives buildDossier { text_max_bytes, screenshots: { max, max_bytes }, max_instances,
// scripts_max_source_bytes, scripts_max_path_chars } from its gate.json (whose keys for the last three open place_).
// Only text_max_bytes shapes the bytes; the other caps only refuse, so passing them too makes your program
// fail where the scorer would.
//
// The reader follows rbx-dom's docs/binary.md (the binary model format, version 0) and its reference
// decoder rbx_binary: a 32-byte header, then chunks, each a 16-byte header (name, compressed length,
// uncompressed length, 4 reserved bytes) and its data, stored raw (compressed length 0), as zstd (the
// data opens 28 b5 2f fd) or as one raw LZ4 block, END last and never compressed. It reads only what it
// needs (INST, SSTR, PRNT and the Name and Source properties) and skips the rest by its length. It is
// hardened against hostile files: a chunk declaring more than MAX_CHUNK_BYTES, or chunks declaring more
// than MAX_PLACE_BYTES in all, are refused before a byte is allocated, every count and length is bounded
// by the bytes left, and every chunk must expand to exactly its declared length. A malformed file throws
// PlaceError naming why. Many scripts may name one SharedString, which the file holds once: they share its
// one byte view, and its normalised copy and sha256 are computed once for all of them. Declared bytes do not
// bound what a place costs to read, so a caller bounding that passes ReadCaps: max_instances (each costs its
// maps), scripts_max_source_bytes (a SharedString counted once for every script naming it) and
// scripts_max_path_chars (a long name repeats in every path below it), each refusing the place before the
// work it bounds.
//
// Sources are compared and hashed as bytes, after one normalisation applied to both sides (normalizeSource:
// CRLF to LF, one leading UTF-8 BOM dropped), never as decoded text; text is decoded only to be shown.

import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as zlib from 'node:zlib';

/** The dossier schema buildDossier writes (contracts/dossier.ts DOSSIER_SCHEMA). */
export const DOSSIER_SCHEMA = 'makefun/dossier/v1';
/** The most bytes a dossier holds (contracts/dossier.ts DOSSIER_MAX_BYTES): 4 MiB. */
export const DOSSIER_MAX_BYTES = 4 * 1024 * 1024;
/** The most images a dossier holds (contracts/dossier.ts DOSSIER_MAX_IMAGES). */
export const DOSSIER_MAX_IMAGES = 8;
/** The largest uncompressed length one chunk may declare: 128 MiB (rbx-dom issue 670). */
export const MAX_CHUNK_BYTES = 128 * 1024 * 1024;
/** The largest uncompressed length all of a file's chunks may declare together: 1 GiB. */
export const MAX_PLACE_BYTES = 1024 * 1024 * 1024;
/** How many classes the dossier's Place block names, most instances first. */
export const DOSSIER_TOP_CLASSES = 12;

/** The classes whose Source the reader reads. */
export const SCRIPT_CLASSES = ['Script', 'LocalScript', 'ModuleScript'] as const;
export type ScriptClass = (typeof SCRIPT_CLASSES)[number];

/** A UniqueId's time counts seconds from 2021-01-01T00:00:00Z: that instant in Unix seconds. */
const UNIQUE_ID_EPOCH = 1609459200;

const MAGIC = [0x3c, 0x72, 0x6f, 0x62, 0x6c, 0x6f, 0x78, 0x21, 0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a];
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const HEADER_BYTES = 32;
const CHUNK_HEADER_BYTES = 16;
/** One LZ4 input byte expands to at most 255 output bytes (a match-length byte of 255). */
const LZ4_MAX_RATIO = 255;

const TYPE_STRING = 0x01;
const TYPE_SHARED_STRING = 0x1c;
const TYPE_UNIQUE_ID = 0x1f;

/** Why a place's bytes cannot be read. */
export class PlaceError extends Error {
  /** The caller's cap the place is past (a key of ReadCaps), or null when the file itself is at fault. */
  readonly limit: keyof ReadCaps | null;
  constructor(message: string, limit: keyof ReadCaps | null = null) {
    super(message);
    this.name = 'PlaceError';
    this.limit = limit;
  }
}

/**
 * What readPlace is held to beyond the file's own framing, each cap absent for none. The file's declared bytes do not
 * bound what reading it costs: an instance costs a few hundred bytes of maps however few bytes declare it, a
 * SharedString the file holds once is every naming script's source, and a long name is part of every path below it.
 *   max_instances             the instances the INST chunks declare, summed.
 *   scripts_max_source_bytes  every Script, LocalScript and ModuleScript's Source length as stored, summed, each
 *                             script counted at its full length: a SharedString once for every script naming it.
 *   scripts_max_path_chars    those scripts' instance paths (PlaceScript.path), their lengths in UTF-16 units summed.
 */
export interface ReadCaps {
  max_instances?: number;
  scripts_max_source_bytes?: number;
  scripts_max_path_chars?: number;
}

/** One chunk as framed in the file: its name, where its data starts and its two declared lengths. */
export interface PlaceChunk {
  /** The chunk's name, trailing NUL bytes dropped (META, SSTR, INST, PROP, PRNT, END ...). */
  name: string;
  /** Offset of the chunk's data (after its 16-byte header) in the file. */
  offset: number;
  /** Compressed length; 0 when the data is stored raw. */
  compressedLength: number;
  /** Length of the data once decompressed. */
  uncompressedLength: number;
}

/** A file's header and chunk framing. */
export interface PlaceFraming {
  /** The header's class count (the number of INST chunks it announces). */
  classCount: number;
  /** The header's instance count. */
  instanceCount: number;
  /** Every chunk through END, in file order. */
  chunks: PlaceChunk[];
}

/** One script of a place. */
export interface PlaceScript {
  /** The instance's referent in the file. */
  referent: number;
  /** Names from the DataModel down, joined by '.', like `ServerScriptService.GravityController.Client`. */
  path: string;
  class: ScriptClass;
  /** Its Source as stored, bytes not decoded; null when the file holds it where this reader cannot read (see Place.notes). */
  source: Uint8Array | null;
}

/** What readPlace reads of a place. */
export interface Place {
  /** How many instances the file holds (the INST chunks' counts summed). */
  instances: number;
  /** Every class with its instance count, most instances first, then by name. */
  classes: { name: string; count: number }[];
  /** Every Script, LocalScript and ModuleScript, by path then referent. */
  scripts: PlaceScript[];
  /** What the reader could not read, each a sentence (an SSTR chunk of a version other than 0). */
  notes: string[];
}

/** One UniqueId property value. */
export interface UniqueIdTime {
  referent: number;
  /** The instance's path, as PlaceScript.path. */
  path: string;
  class: string;
  /** The property's name (UniqueId, HistoryId ...). */
  property: string;
  /** The UniqueId's sequential index. */
  index: number;
  /** Its time, in Unix seconds (the stored value counts from 2021-01-01T00:00:00Z). */
  time: number;
}

/** A source file to match against a place: its path (POSIX, relative to its root) and its bytes. */
export interface SourceFile {
  path: string;
  bytes: Uint8Array;
}

/** What matchSources finds. */
export interface SourceMatch {
  /** Each file equal to a script of the place, by file path, with the script it equals. */
  matched: { file: string; script: string; class: ScriptClass }[];
  /** Each file equal to no script, by path. */
  unmatched: string[];
  /** Per script of place.scripts (same order): whether some file equals it. */
  scriptMatched: boolean[];
  /** Bytes of the place's non-empty scripts (normalised). */
  scriptBytes: number;
  /** Of those, the bytes of scripts some file equals. */
  coveredBytes: number;
  /** coveredBytes / scriptBytes, 0 when the place has no script bytes. */
  coverage: number;
}

/**
 * What buildDossier is held to: the text's cap in UTF-8 bytes and, when given, the screenshot caps (at most
 * `max` images, each at most `max_bytes` bytes; the dossier's own DOSSIER_MAX_IMAGES and DOSSIER_MAX_BYTES hold
 * either way), and readPlace's three caps (ReadCaps). A bounty's gate.json may be passed whole: buildDossier reads
 * only these keys (roblox-game-01's gate names the read caps place_max_instances, place_scripts_max_source_bytes
 * and place_scripts_max_path_chars, so its scorer passes them by these names).
 */
export interface DossierCaps {
  text_max_bytes: number;
  screenshots?: { max: number; max_bytes: number };
  /** readPlace's caps (ReadCaps), passed to it as given; a place past one is a PlaceError. */
  max_instances?: number;
  scripts_max_source_bytes?: number;
  scripts_max_path_chars?: number;
}

/** Why buildDossier writes no dossier for a directory: its caps, its screenshots or its size (a place it cannot read is a PlaceError). */
export class DossierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DossierError';
  }
}

// ---------------------------------------------------------------- bytes

const utf8 = new TextDecoder('utf-8');

/** A cursor over one chunk's data; every read is bounded by the bytes left, naming the chunk when it is not. */
class Reader {
  bytes: Uint8Array;
  view: DataView;
  pos: number;
  what: string;
  constructor(bytes: Uint8Array, what: string) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = 0;
    this.what = what;
  }
  left(): number {
    return this.bytes.length - this.pos;
  }
  need(n: number, field: string): void {
    if (!Number.isSafeInteger(n) || n < 0 || n > this.left()) throw new PlaceError(`${this.what}: ${field} needs ${n} bytes, ${this.left()} left`);
  }
  u8(field: string): number {
    this.need(1, field);
    return this.bytes[this.pos++]!;
  }
  u32(field: string): number {
    this.need(4, field);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  take(n: number, field: string): Uint8Array {
    this.need(n, field);
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  /** A String: a u32 length and that many bytes. */
  string(field: string): Uint8Array {
    return this.take(this.u32(`${field} length`), field);
  }
  /** `count` values of `width` bytes each, byte-interleaved: value i's byte j sits at j * count + i. */
  interleaved(count: number, width: number, field: string): Uint8Array[] {
    const raw = this.take(count * width, field);
    const out: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
      const v = new Uint8Array(width);
      for (let j = 0; j < width; j++) v[j] = raw[j * count + i]!;
      out.push(v);
    }
    return out;
  }
  /** A referent array: interleaved big-endian i32, each untransformed and added to the one before. */
  referents(count: number, field: string): number[] {
    const raw = this.take(count * 4, field);
    const out: number[] = [];
    let last = 0;
    for (let i = 0; i < count; i++) {
      const u = ((raw[i]! << 24) | (raw[count + i]! << 16) | (raw[2 * count + i]! << 8) | raw[3 * count + i]!) >>> 0;
      const v = (u >>> 1) ^ -(u & 1);
      last = (last + v) | 0;
      out.push(last);
    }
    return out;
  }
}

/** Big-endian u32 at `at` of a small array. */
const beU32 = (b: Uint8Array, at: number): number => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;

const opensWith = (bytes: Uint8Array, magic: readonly number[], at = 0): boolean => bytes.length >= at + magic.length && magic.every((b, i) => bytes[at + i] === b);

/** A string's bytes as text, for names and display only (invalid UTF-8 becomes U+FFFD). */
const text = (bytes: Uint8Array): string => utf8.decode(bytes);

/** Code-unit order, the same on every machine (localeCompare is not). */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

// ---------------------------------------------------------------- framing and decompression

/** The header and every chunk's framing through END, checked, nothing decompressed. Throws PlaceError. */
export function placeFraming(buf: Uint8Array): PlaceFraming {
  if (buf.length < HEADER_BYTES) throw new PlaceError(`${buf.length} bytes: shorter than the 32-byte header`);
  if (!opensWith(buf, MAGIC)) throw new PlaceError('not a binary Roblox file: the header does not open with <roblox! 89 ff 0d 0a 1a 0a');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const version = view.getUint16(14, true);
  if (version !== 0) throw new PlaceError(`format version ${version}: only version 0 is read`);
  const classCount = view.getInt32(16, true);
  const instanceCount = view.getInt32(20, true);
  if (classCount < 0 || instanceCount < 0) throw new PlaceError(`the header's counts are negative (${classCount} classes, ${instanceCount} instances)`);
  const chunks: PlaceChunk[] = [];
  let at = HEADER_BYTES;
  let total = 0;
  for (;;) {
    if (buf.length - at < CHUNK_HEADER_BYTES) throw new PlaceError(`chunk ${chunks.length + 1} at byte ${at}: ${buf.length - at} bytes left, short of a 16-byte chunk header (no END chunk)`);
    let end = at + 4;
    while (end > at && buf[end - 1] === 0) end--;
    const name = String.fromCharCode(...buf.subarray(at, end));
    const compressedLength = view.getUint32(at + 4, true);
    const uncompressedLength = view.getUint32(at + 8, true);
    const where = `chunk ${chunks.length + 1} (${JSON.stringify(name)}) at byte ${at}`;
    if (uncompressedLength > MAX_CHUNK_BYTES) throw new PlaceError(`${where} declares ${uncompressedLength} bytes, over the ${MAX_CHUNK_BYTES} one chunk may hold`);
    total += uncompressedLength;
    if (total > MAX_PLACE_BYTES) throw new PlaceError(`${where}: the chunks declare more than ${MAX_PLACE_BYTES} bytes in all`);
    const stored = compressedLength === 0 ? uncompressedLength : compressedLength;
    const offset = at + CHUNK_HEADER_BYTES;
    if (stored > buf.length - offset) throw new PlaceError(`${where} holds ${stored} bytes, ${buf.length - offset} left in the file`);
    if (compressedLength !== 0 && !opensWith(buf, ZSTD_MAGIC, offset) && uncompressedLength > compressedLength * LZ4_MAX_RATIO) {
      throw new PlaceError(`${where}: ${compressedLength} LZ4 bytes cannot expand to the ${uncompressedLength} declared`);
    }
    chunks.push({ name, offset, compressedLength, uncompressedLength });
    at = offset + stored;
    if (name === 'END') {
      if (compressedLength !== 0) throw new PlaceError(`${where}: the END chunk is compressed`);
      break;
    }
  }
  return { classCount, instanceCount, chunks };
}

/** A raw LZ4 block decoded into exactly `size` bytes, every length and offset bounded by it. */
function lz4Block(src: Uint8Array, size: number, where: string): Uint8Array {
  const out = new Uint8Array(size);
  const bad = (why: string): PlaceError => new PlaceError(`${where}: bad LZ4 block: ${why}`);
  let s = 0;
  let d = 0;
  for (;;) {
    if (s >= src.length) throw bad('it ends before its last literals');
    const token = src[s++]!;
    let literals = token >>> 4;
    if (literals === 15) {
      for (;;) {
        if (s >= src.length) throw bad('a literal length runs past the block');
        const b = src[s++]!;
        literals += b;
        if (literals > size) throw bad('a literal length runs past the declared length');
        if (b !== 255) break;
      }
    }
    if (literals > src.length - s) throw bad('literals run past the block');
    if (literals > size - d) throw bad('literals run past the declared length');
    out.set(src.subarray(s, s + literals), d);
    s += literals;
    d += literals;
    if (s === src.length) break;
    if (src.length - s < 2) throw bad('a match offset is cut short');
    const offset = src[s]! | (src[s + 1]! << 8);
    s += 2;
    if (offset === 0) throw bad('a match offset is 0');
    if (offset > d) throw bad(`a match offset of ${offset} reaches before the start of the output`);
    let length = token & 15;
    if (length === 15) {
      for (;;) {
        if (s >= src.length) throw bad('a match length runs past the block');
        const b = src[s++]!;
        length += b;
        if (length > size) throw bad('a match length runs past the declared length');
        if (b !== 255) break;
      }
    }
    length += 4;
    if (length > size - d) throw bad('a match runs past the declared length');
    let from = d - offset;
    if (offset >= length) {
      out.copyWithin(d, from, from + length);
      d += length;
    } else {
      // The match overlaps its own output: copy byte by byte so it repeats.
      for (let i = 0; i < length; i++) out[d++] = out[from++]!;
    }
  }
  if (d !== size) throw bad(`it expands to ${d} bytes, not the ${size} declared`);
  return out;
}

/** A chunk of placeFraming(buf), its data decompressed to exactly its declared length. Throws PlaceError. */
export function chunkData(buf: Uint8Array, chunk: PlaceChunk): Uint8Array {
  const where = `the ${chunk.name} chunk at byte ${chunk.offset - CHUNK_HEADER_BYTES}`;
  if (chunk.compressedLength === 0) return buf.subarray(chunk.offset, chunk.offset + chunk.uncompressedLength);
  const data = buf.subarray(chunk.offset, chunk.offset + chunk.compressedLength);
  if (!opensWith(data, ZSTD_MAGIC)) return lz4Block(data, chunk.uncompressedLength, where);
  // Node 22.15 added zstdDecompressSync (still marked experimental in v22); an older Node lacks it.
  const zstd = (zlib as unknown as { zstdDecompressSync?: (b: Uint8Array, o: { maxOutputLength: number }) => Uint8Array }).zstdDecompressSync;
  if (typeof zstd !== 'function') throw new PlaceError(`${where} is zstd, which this Node (${process.version}) cannot decompress: Node 22.15 or later can`);
  let out: Uint8Array;
  try {
    out = zstd(data, { maxOutputLength: Math.max(1, chunk.uncompressedLength) });
  } catch (err) {
    throw new PlaceError(`${where}: bad zstd data or more than the ${chunk.uncompressedLength} bytes declared (${(err as Error).message})`);
  }
  if (out.length !== chunk.uncompressedLength) throw new PlaceError(`${where}: zstd expands to ${out.length} bytes, not the ${chunk.uncompressedLength} declared`);
  return out;
}

// ---------------------------------------------------------------- the place

interface ClassInfo {
  name: string;
  referents: number[];
}

interface Parsed {
  classes: Map<number, ClassInfo>;
  classOf: Map<number, ClassInfo>;
  names: Map<number, string>;
  parents: Map<number, number>;
  sources: Map<number, Uint8Array | null>;
  uniqueIds: { referent: number; class: string; property: string; index: number; time: number }[];
  notes: string[];
  /** An instance's path, built on first ask (with its ancestors') and kept. */
  pathOf: (referent: number) => string;
  /** The length (UTF-16 units) pathOf(referent) has, counted from the names alone, no path built. */
  pathLengthOf: (referent: number) => number;
}

/** parse's caps, each Infinity for none. */
interface ParseCaps {
  sourceBytes: number;
  instances: number;
}

const NO_PARSE_CAPS: ParseCaps = { sourceBytes: Infinity, instances: Infinity };

/**
 * Two passes over the chunks: INST, SSTR and PRNT first, then the PROP chunks against them (chunk order is not
 * assumed). `caps.sourceBytes` caps the scripts' sources summed as each is read, every script at its full length; a
 * script naming a SharedString gets the SSTR chunk's one copy, never its own. `caps.instances` caps the INST chunks'
 * counts summed, each checked before its referents are read. Every parent chain is checked, but no path is built
 * until one is asked for.
 */
function parse(buf: Uint8Array, wantUniqueIds: boolean, caps: ParseCaps): Parsed {
  const { chunks } = placeFraming(buf);
  const maxSourceBytes = caps.sourceBytes;
  let instanceCount = 0;
  let sourceBytes = 0;
  /** Counts one script's source against maxSourceBytes, throwing as soon as the sum passes it. */
  const countSource = (bytes: Uint8Array): Uint8Array => {
    sourceBytes += bytes.length;
    if (sourceBytes > maxSourceBytes) {
      throw new PlaceError(
        `the place's scripts hold at least ${sourceBytes} bytes of source, over the ${maxSourceBytes} allowed in all (scripts_max_source_bytes): each script counts its whole source, a SharedString once for every script that names it`,
        'scripts_max_source_bytes',
      );
    }
    return bytes;
  };
  const classes = new Map<number, ClassInfo>();
  const classOf = new Map<number, ClassInfo>();
  const parents = new Map<number, number>();
  const notes: string[] = [];
  let shared: Uint8Array[] | null = [];
  let sstrVersion = 0;
  let unreadShared = 0;
  let sstrSeen = false;
  let prntSeen = false;

  for (const chunk of chunks) {
    if (chunk.name === 'INST') {
      const r = new Reader(chunkData(buf, chunk), 'INST chunk');
      const id = r.u32('class id');
      const name = text(r.string('class name'));
      const format = r.u8('object format');
      const count = r.u32('instance count');
      if (classes.has(id)) throw new PlaceError(`INST chunk: class id ${id} is given twice`);
      instanceCount += count;
      if (instanceCount > caps.instances) {
        throw new PlaceError(`the place's INST chunks declare at least ${instanceCount} instances, over the ${caps.instances} allowed (max_instances)`, 'max_instances');
      }
      const info: ClassInfo = { name, referents: r.referents(count, `${name}'s referents`) };
      if (format === 1) r.take(count, `${name}'s service markers`);
      for (const ref of info.referents) {
        if (classOf.has(ref)) throw new PlaceError(`INST chunk: referent ${ref} belongs to two instances`);
        classOf.set(ref, info);
      }
      classes.set(id, info);
    } else if (chunk.name === 'SSTR') {
      if (sstrSeen) throw new PlaceError('two SSTR chunks');
      sstrSeen = true;
      const r = new Reader(chunkData(buf, chunk), 'SSTR chunk');
      const version = r.u32('version');
      if (version !== 0) {
        shared = null;
        sstrVersion = version;
        continue;
      }
      const count = r.u32('count');
      r.need(count * 20, `${count} shared strings`);
      const list: Uint8Array[] = [];
      for (let i = 0; i < count; i++) {
        r.take(16, `shared string ${i}'s MD5`);
        list.push(r.string(`shared string ${i}`));
      }
      shared = list;
    } else if (chunk.name === 'PRNT') {
      if (prntSeen) throw new PlaceError('two PRNT chunks');
      prntSeen = true;
      const r = new Reader(chunkData(buf, chunk), 'PRNT chunk');
      const version = r.u8('version');
      if (version !== 0) throw new PlaceError(`the PRNT chunk is version ${version}, not 0`);
      const count = r.u32('count');
      r.need(count * 8, `${count} child and parent referents`);
      const children = r.referents(count, 'child referents');
      const parentRefs = r.referents(count, 'parent referents');
      for (let i = 0; i < count; i++) parents.set(children[i]!, parentRefs[i]!);
    }
  }

  const names = new Map<number, string>();
  const sources = new Map<number, Uint8Array | null>();
  const uniqueIds: Parsed['uniqueIds'] = [];
  for (const chunk of chunks) {
    if (chunk.name !== 'PROP') continue;
    const r = new Reader(chunkData(buf, chunk), 'PROP chunk');
    const id = r.u32('class id');
    const property = text(r.string('property name'));
    const type = r.u8('type id');
    const info = classes.get(id);
    if (info === undefined) throw new PlaceError(`PROP chunk ${JSON.stringify(property)} names class id ${id}, which no INST chunk declares`);
    const n = info.referents.length;
    const where = `${info.name}.${property}`;
    if (property === 'Name' && type === TYPE_STRING) {
      for (const ref of info.referents) names.set(ref, text(r.string(`${where} of ${ref}`)));
    } else if (property === 'Source' && (SCRIPT_CLASSES as readonly string[]).includes(info.name)) {
      if (type === TYPE_STRING) {
        for (const ref of info.referents) sources.set(ref, countSource(r.string(`${where} of ${ref}`)));
      } else if (type === TYPE_SHARED_STRING) {
        const indices = r.interleaved(n, 4, `${where}'s shared string indices`);
        info.referents.forEach((ref, i) => {
          if (shared === null) {
            sources.set(ref, null);
            unreadShared++;
            return;
          }
          const index = beU32(indices[i]!, 0);
          const value = shared[index];
          if (value === undefined) throw new PlaceError(`${where} of ${ref} names shared string ${index}, past the ${shared.length} the SSTR chunk holds`);
          // The SSTR chunk's own view, shared by every script naming it: no copy a script.
          sources.set(ref, countSource(value));
        });
      } else {
        notes.push(`${where} is stored as type 0x${type.toString(16).padStart(2, '0')}, neither a String nor a SharedString: not read`);
        for (const ref of info.referents) sources.set(ref, null);
      }
    } else if (wantUniqueIds && type === TYPE_UNIQUE_ID) {
      const records = r.interleaved(n, 16, `${where}'s UniqueIds`);
      info.referents.forEach((ref, i) => {
        const rec = records[i]!;
        // An all-zero record is the nil UniqueId (an unset HistoryId): it carries no time.
        if (rec.every((b) => b === 0)) return;
        uniqueIds.push({ referent: ref, class: info.name, property, index: beU32(rec, 0), time: UNIQUE_ID_EPOCH + beU32(rec, 4) });
      });
    }
  }

  if (unreadShared > 0) notes.push(`the SSTR chunk is version ${sstrVersion}, not 0: ${unreadShared} SharedString source${unreadShared === 1 ? ' is' : 's are'} not read`);

  // Every parent link checked once: each child is declared, and each instance's chain reaches a root (no cycle, no
  // undeclared parent). `rooted` holds the instances whose chain is known to reach one.
  for (const child of parents.keys()) if (!classOf.has(child)) throw new PlaceError(`the PRNT chunk names child ${child}, which no INST chunk declares`);
  const rooted = new Set<number>();
  for (const referent of classOf.keys()) {
    const chain: number[] = [];
    const seen = new Set<number>();
    let at = referent;
    for (;;) {
      if (rooted.has(at)) break;
      if (seen.has(at)) throw new PlaceError(`the PRNT chunk parents instance ${at} under its own descendant`);
      if (!classOf.has(at)) throw new PlaceError(`the PRNT chunk names parent ${at}, which no INST chunk declares`);
      seen.add(at);
      chain.push(at);
      const parent = parents.get(at);
      if (parent === undefined || parent === -1) break;
      at = parent;
    }
    for (const ref of chain) rooted.add(ref);
  }

  const nameOf = (ref: number): string => names.get(ref) ?? classOf.get(ref)!.name;
  /** Walks up from `referent` to the root or to an instance `known` holds, giving the chain bottom up and what it reached. */
  const climb = <T>(referent: number, known: Map<number, T>): { chain: number[]; base: T | undefined } => {
    const chain: number[] = [];
    let at = referent;
    for (;;) {
      const k = known.get(at);
      if (k !== undefined) return { chain, base: k };
      chain.push(at);
      const parent = parents.get(at);
      if (parent === undefined || parent === -1) return { chain, base: undefined };
      at = parent;
    }
  };
  const lengths = new Map<number, number>();
  const pathLengthOf = (referent: number): number => {
    const { chain, base } = climb(referent, lengths);
    let length = base ?? 0;
    let top = base === undefined;
    for (let i = chain.length - 1; i >= 0; i--) {
      const ref = chain[i]!;
      // As pathOf joins: a name alone under the root or under an empty path, else the path, a dot and the name.
      length = top || length === 0 ? nameOf(ref).length : length + 1 + nameOf(ref).length;
      top = false;
      lengths.set(ref, length);
    }
    return lengths.get(referent)!;
  };
  const paths = new Map<number, string>();
  const pathOf = (referent: number): string => {
    const known = paths.get(referent);
    if (known !== undefined) return known;
    // Walk up to the root (or to an instance whose path is known), then name the chain top down.
    const chain: number[] = [];
    const seen = new Set<number>();
    let at = referent;
    let base = '';
    for (;;) {
      const p = paths.get(at);
      if (p !== undefined) {
        base = p;
        break;
      }
      if (seen.has(at)) throw new PlaceError(`the PRNT chunk parents instance ${at} under its own descendant`);
      if (!classOf.has(at)) throw new PlaceError(`the PRNT chunk names parent ${at}, which no INST chunk declares`);
      seen.add(at);
      chain.push(at);
      const parent = parents.get(at);
      if (parent === undefined || parent === -1) break;
      at = parent;
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const ref = chain[i]!;
      const name = nameOf(ref);
      base = base === '' ? name : `${base}.${name}`;
      paths.set(ref, base);
    }
    return paths.get(referent)!;
  };
  return { classes, classOf, names, parents, sources, uniqueIds, notes, pathOf, pathLengthOf };
}

/** The keys of ReadCaps, in the order readPlace checks them. */
const READ_CAP_KEYS = ['max_instances', 'scripts_max_source_bytes', 'scripts_max_path_chars'] as const;

/** A caller's ReadCaps checked: each given cap a whole number, each missing one Infinity. */
function readCapsOf(caps: ReadCaps, who: string): Record<keyof ReadCaps, number> {
  const out = { max_instances: Infinity, scripts_max_source_bytes: Infinity, scripts_max_path_chars: Infinity };
  for (const k of READ_CAP_KEYS) {
    const v = caps[k] as unknown;
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new TypeError(`${who}: caps.${k} must be a whole number, not ${String(v)}`);
    out[k] = v;
  }
  return out;
}

/**
 * A binary place's classes with their counts and its scripts with their paths, classes and sources. Scripts
 * naming one SharedString share its one byte view. Throws PlaceError on a file it cannot read, and on a place past
 * one of `caps` (that error's `limit` names the key; a cap not given is no cap), each checked before the work it
 * bounds: `max_instances` as each INST chunk's count is read, `scripts_max_source_bytes` as each script's source
 * is read, `scripts_max_path_chars` before any script's path is built.
 */
export function readPlace(buf: Uint8Array, caps: ReadCaps = {}): Place {
  const c = readCapsOf(caps, 'readPlace');
  const p = parse(buf, false, { sourceBytes: c.scripts_max_source_bytes, instances: c.max_instances });
  const counts = new Map<string, number>();
  let instances = 0;
  for (const info of p.classes.values()) {
    counts.set(info.name, (counts.get(info.name) ?? 0) + info.referents.length);
    instances += info.referents.length;
  }
  const classes = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || byCodeUnit(a.name, b.name));
  const scriptClasses = [...p.classes.values()].filter((info) => (SCRIPT_CLASSES as readonly string[]).includes(info.name));
  if (c.scripts_max_path_chars !== Infinity) {
    // Each script's path is built, sorted and shown whole: their lengths are summed from the names before any is built.
    let chars = 0;
    for (const info of scriptClasses) {
      for (const referent of info.referents) {
        chars += p.pathLengthOf(referent);
        if (chars > c.scripts_max_path_chars) {
          throw new PlaceError(
            `the place's scripts' instance paths come to at least ${chars} characters, over the ${c.scripts_max_path_chars} allowed in all (scripts_max_path_chars)`,
            'scripts_max_path_chars',
          );
        }
      }
    }
  }
  const scripts: PlaceScript[] = [];
  const empty = new Uint8Array(0);
  for (const info of scriptClasses) {
    for (const referent of info.referents) {
      const source = p.sources.has(referent) ? p.sources.get(referent)! : empty;
      scripts.push({ referent, path: p.pathOf(referent), class: info.name as ScriptClass, source });
    }
  }
  scripts.sort((a, b) => byCodeUnit(a.path, b.path) || a.referent - b.referent);
  return { instances, classes, scripts, notes: p.notes };
}

/**
 * Every UniqueId property value of a binary place (type 0x1F) but the nil one (all zero), by time then
 * path. The records are read as rbx_binary reads them (src/deserializer/state.rs): 16-byte records
 * byte-interleaved across the array, each a big-endian u32 index, a big-endian u32 time in seconds since
 * 2021-01-01 and an i64 random (not returned); docs/binary.md's "no modifications" disagrees, the decoder
 * is followed. Throws PlaceError.
 */
export function uniqueIdTimes(buf: Uint8Array): UniqueIdTime[] {
  const p = parse(buf, true, NO_PARSE_CAPS);
  return p.uniqueIds
    .map((u) => ({ referent: u.referent, path: p.pathOf(u.referent), class: u.class, property: u.property, index: u.index, time: u.time }))
    .sort((a, b) => a.time - b.time || byCodeUnit(a.path, b.path) || a.referent - b.referent || byCodeUnit(a.property, b.property));
}

// ---------------------------------------------------------------- sources

/** A source as compared and hashed: CRLF pairs to LF, one leading UTF-8 BOM dropped. */
export function normalizeSource(bytes: Uint8Array): Uint8Array {
  const start = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const out = new Uint8Array(bytes.length - start);
  let n = 0;
  for (let i = start; i < bytes.length; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) continue;
    out[n++] = bytes[i]!;
  }
  return out.subarray(0, n);
}

/**
 * The instance path, relative to the directory Rojo mounts, and the class Rojo 7.7's default sync rules
 * give a file (src/snapshot_middleware/mod.rs): `*.server.luau|lua` a Script, `*.client.luau|lua` a
 * LocalScript, `*.plugin.luau|lua` a Script, any other `*.luau|lua` a ModuleScript, each named for the
 * file less that suffix, and an `init.*` script names its directory. `file` is a POSIX path relative to
 * the mount; null for a file that is no script. An `init` file at the mount's top has the path ''.
 */
export function rojoPath(file: string): { path: string; class: ScriptClass } | null {
  const parts = file.split('/').filter((s) => s !== '' && s !== '.');
  const last = parts.pop();
  if (last === undefined) return null;
  let m = /^(.*)\.(server|client|plugin)\.(?:luau|lua)$/.exec(last);
  let name: string;
  let cls: ScriptClass;
  if (m !== null) {
    name = m[1]!;
    cls = m[2] === 'client' ? 'LocalScript' : 'Script';
  } else {
    m = /^(.*)\.(?:luau|lua)$/.exec(last);
    if (m === null) return null;
    name = m[1]!;
    cls = 'ModuleScript';
  }
  if (name === 'init') return { path: parts.join('.'), class: cls };
  return { path: [...parts, name].join('.'), class: cls };
}

/**
 * Which files equal a script of the place, both sides normalised (normalizeSource) and compared by
 * sha256, and the share of the place's non-empty script bytes the equal ones cover. A file equal to
 * several scripts is reported against the one at its Rojo path when there is one, else the first by path.
 */
export function matchSources(place: Place, srcFiles: readonly SourceFile[]): SourceMatch {
  return matchWith(place, srcFiles, sourceForms());
}

/** A source's normalised bytes and their sha256. */
interface SourceForm {
  norm: Uint8Array;
  sha256: string;
}

/**
 * A source's form, computed once per byte view and then remembered: the scripts naming one SharedString share
 * one view (readPlace), so they share one normalised copy and one sha256, never one a script.
 */
function sourceForms(): (bytes: Uint8Array) => SourceForm {
  const seen = new Map<Uint8Array, SourceForm>();
  return (bytes) => {
    let form = seen.get(bytes);
    if (form === undefined) {
      const norm = normalizeSource(bytes);
      form = { norm, sha256: sha256Hex(norm) };
      seen.set(bytes, form);
    }
    return form;
  };
}

function matchWith(place: Place, srcFiles: readonly SourceFile[], formOf: (bytes: Uint8Array) => SourceForm): SourceMatch {
  const scriptHashes = place.scripts.map((s) => (s.source === null ? null : formOf(s.source).sha256));
  const byHash = new Map<string, number[]>();
  scriptHashes.forEach((h, i) => {
    if (h === null) return;
    const list = byHash.get(h) ?? [];
    list.push(i);
    byHash.set(h, list);
  });
  const fileHashes = new Set<string>();
  const matched: SourceMatch['matched'] = [];
  const unmatched: string[] = [];
  for (const f of [...srcFiles].sort((a, b) => byCodeUnit(a.path, b.path))) {
    const h = sha256Hex(normalizeSource(f.bytes));
    fileHashes.add(h);
    const candidates = byHash.get(h);
    if (candidates === undefined) {
      unmatched.push(f.path);
      continue;
    }
    const rojo = rojoPath(f.path);
    const at = (i: number): boolean => {
      if (rojo === null || rojo.path === '') return false;
      const s = place.scripts[i]!;
      return s.class === rojo.class && (s.path === rojo.path || s.path.endsWith(`.${rojo.path}`));
    };
    const pick = place.scripts[candidates.find(at) ?? candidates[0]!]!;
    matched.push({ file: f.path, script: pick.path, class: pick.class });
  }
  let scriptBytes = 0;
  let coveredBytes = 0;
  const scriptMatched = place.scripts.map((s, i) => {
    const h = scriptHashes[i];
    if (s.source === null || h === null || h === undefined) return false;
    const len = formOf(s.source).norm.length;
    const hit = fileHashes.has(h);
    scriptBytes += len;
    if (hit) coveredBytes += len;
    return hit;
  });
  return { matched, unmatched, scriptMatched, scriptBytes, coveredBytes, coverage: scriptBytes === 0 ? 0 : coveredBytes / scriptBytes };
}

// ---------------------------------------------------------------- canonical JSON

/**
 * JSON with every object's keys in code-unit order and no whitespace: one spelling per value. Takes
 * null, booleans, finite numbers, strings, arrays and plain objects; throws TypeError on anything else
 * (undefined, a function, a bigint, NaN, Infinity, a class instance).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: ${value} is not a finite number`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError('canonicalJson: only plain objects and arrays');
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort(byCodeUnit)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(',')}}`;
  }
  throw new TypeError(`canonicalJson: a ${typeof value} has no JSON form`);
}

// ---------------------------------------------------------------- the dossier

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
/** contracts/dossier.ts DossierImageName. */
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const SCRIPT_FILE = /\.(?:luau|lua)$/;

/** Every regular file under `root`, as POSIX paths relative to it, in code-unit order (symbolic links are not followed). */
function filesUnder(root: string, rel = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(rel === '' ? root : join(root, rel), { withFileTypes: true })) {
    const p = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) out.push(...filesUnder(root, p));
    else if (e.isFile()) out.push(p);
  }
  return out.sort(byCodeUnit);
}

/** Lines of a source: 0 when empty, else its newlines plus one for a last line with none. */
function lineCount(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let n = 0;
  for (const b of bytes) if (b === 0x0a) n++;
  return bytes[bytes.length - 1] === 0x0a ? n : n + 1;
}

const byteLength = (s: string): number => Buffer.byteLength(s, 'utf8');

/** A Markdown fence one backtick longer than the longest run in `body`, three at least. */
function fenceFor(body: string): string {
  let longest = 0;
  for (const run of body.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/**
 * The dossier (makefun/dossier/v1, contracts/dossier.ts) of a game directory, as canonical JSON bytes:
 * `dir/game.rbxl`, the `.luau` and `.lua` files under `dir/src/` and the PNG and JPEG files in
 * `dir/screenshots/` (names starting with '.' skipped). `images` are the screenshots in name order, the
 * first the cover; `text` is a "## Place" block (instances, the top classes by count, scripts, the share
 * of script bytes matched to src/) then "## Scripts", each script's instance path, class, line count and
 * source, the src-matched ones first, each group by path. The text holds at most `caps.text_max_bytes`
 * UTF-8 bytes: every script that fits goes in whole, in that order; the first that does not goes in up to
 * its last complete line that fits (its fence closed, then a line naming how many of its lines are not
 * shown), or not at all when not one line fits; nothing follows it but a last line naming how many whole
 * scripts and how many bytes of normalised source were left out. Throws PlaceError on a place it cannot
 * read or one past a read cap (readPlace) and DossierError on caps it cannot keep: a screenshot past its byte cap or more screenshots than
 * the count cap (`caps.screenshots`, else the dossier's own), screenshots no dossier can hold, a text cap
 * that cannot hold the Place block and the cut line, or a dossier past DOSSIER_MAX_BYTES.
 */
export function buildDossier(dir: string, caps: DossierCaps): Uint8Array {
  const max = caps.text_max_bytes;
  if (!Number.isSafeInteger(max) || max <= 0) throw new DossierError(`buildDossier: caps.text_max_bytes must be a positive integer, not ${String(max)}`);
  // The binding screenshot caps, each with whose it is: the caller's when given and tighter, else the dossier's.
  let maxImages = { n: DOSSIER_MAX_IMAGES, whose: 'a dossier holds' };
  let maxImageBytes = { n: DOSSIER_MAX_BYTES, whose: 'a dossier holds' };
  if (caps.screenshots !== undefined) {
    const s = caps.screenshots as { max?: unknown; max_bytes?: unknown } | null;
    if (typeof s !== 'object' || s === null) throw new DossierError('buildDossier: caps.screenshots must be an object {max, max_bytes}');
    for (const k of ['max', 'max_bytes'] as const) {
      const v = s[k];
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) throw new DossierError(`buildDossier: caps.screenshots.${k} must be a positive integer, not ${String(v)}`);
    }
    if ((s.max as number) < maxImages.n) maxImages = { n: s.max as number, whose: 'caps.screenshots.max allows' };
    if ((s.max_bytes as number) < maxImageBytes.n) maxImageBytes = { n: s.max_bytes as number, whose: 'caps.screenshots.max_bytes allows' };
  }
  const readCaps: ReadCaps = {};
  for (const k of READ_CAP_KEYS) {
    const v = caps[k] as unknown;
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new DossierError(`buildDossier: caps.${k} must be a whole number, not ${String(v)}`);
    readCaps[k] = v;
  }
  const place = readPlace(readFileSync(join(dir, 'game.rbxl')), readCaps);

  let srcPaths: string[] = [];
  try {
    srcPaths = filesUnder(join(dir, 'src')).filter((p) => SCRIPT_FILE.test(p));
  } catch (err) {
    if ((err as { code?: string }).code !== 'ENOENT') throw err;
  }
  const src = srcPaths.map((path) => ({ path, bytes: new Uint8Array(readFileSync(join(dir, 'src', path))) }));
  // One normalised copy and one sha256 per distinct source view, shared by every script naming it.
  const formOf = sourceForms();
  const match = matchWith(place, src, formOf);

  const shotsDir = join(dir, 'screenshots');
  const shotNames = readdirSync(shotsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort(byCodeUnit);
  if (shotNames.length === 0) throw new DossierError('buildDossier: screenshots/ holds no image: the first is the cover');
  if (shotNames.length > maxImages.n) throw new DossierError(`buildDossier: screenshots/ holds ${shotNames.length} files, over the ${maxImages.n} ${maxImages.whose}`);
  const images = shotNames.map((name) => {
    if (!IMAGE_NAME.test(name)) throw new DossierError(`buildDossier: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters, not starting with . or -`);
    // Sized before it is read: a file past the byte cap is refused, never read whole.
    const size = lstatSync(join(shotsDir, name)).size;
    if (size > maxImageBytes.n) throw new DossierError(`buildDossier: screenshots/${name} is ${size} bytes, over the ${maxImageBytes.n} ${maxImageBytes.whose}`);
    const bytes = new Uint8Array(readFileSync(join(shotsDir, name)));
    if (bytes.length > maxImageBytes.n) throw new DossierError(`buildDossier: screenshots/${name} is ${bytes.length} bytes, over the ${maxImageBytes.n} ${maxImageBytes.whose}`);
    const media_type = opensWith(bytes, PNG_MAGIC) ? 'image/png' : opensWith(bytes, JPEG_MAGIC) ? 'image/jpeg' : null;
    if (media_type === null) throw new DossierError(`buildDossier: screenshots/${name} is neither a PNG nor a JPEG`);
    return { name, media_type, sha256: sha256Hex(bytes), base64: Buffer.from(bytes).toString('base64') };
  });

  const matchedFile = new Map<string, string>();
  for (const m of match.matched) if (!matchedFile.has(`${m.class} ${m.script}`)) matchedFile.set(`${m.class} ${m.script}`, m.file);
  const sourceBytes = place.scripts.reduce((n, s) => n + (s.source === null ? 0 : formOf(s.source).norm.length), 0);
  const share = `${(match.coverage * 100).toFixed(1)}%`;
  const head = [
    '## Place',
    '',
    `Instances: ${place.instances}`,
    `Classes, most instances first: ${place.classes
      .slice(0, DOSSIER_TOP_CLASSES)
      .map((c) => `${c.name} ${c.count}`)
      .join(', ')}`,
    `Scripts: ${place.scripts.length} (${sourceBytes} bytes of source)`,
    `Matched to src/: ${share} of the non-empty script bytes (${match.scriptMatched.filter(Boolean).length} of ${place.scripts.length} scripts, ${match.matched.length} of ${src.length} src/ files)`,
    ...place.notes.map((n) => `Note: ${n}`),
    '',
    '## Scripts',
    '',
    '',
  ].join('\n');

  const order = place.scripts.map((s, i) => ({ s, hit: match.scriptMatched[i] === true }));
  order.sort((a, b) => Number(b.hit) - Number(a.hit) || byCodeUnit(a.s.path, b.s.path) || a.s.referent - b.s.referent);
  // A source's shown form (its text, fence, fenced block and line count), built once per distinct source and shared
  // by the scripts naming it; a script's section is its own heading and that block, joined only when it goes in.
  const codes = new Map<SourceForm, SourceCode>();
  const codeOf = (form: SourceForm): SourceCode => {
    let code = codes.get(form);
    if (code === undefined) {
      const t = text(form.norm);
      const fence = fenceFor(t);
      const block = `${fence}lua\n${t}${t.endsWith('\n') ? '' : '\n'}${fence}\n\n`;
      code = { norm: form.norm, text: t, fence, block, blockBytes: byteLength(block), lines: lineCount(form.norm) };
      codes.set(form, code);
    }
    return code;
  };
  const sections = order.map(({ s, hit }) => {
    const form = s.source === null ? null : formOf(s.source);
    const code = form === null || form.norm.length === 0 ? null : codeOf(form);
    const facts = [s.class, form === null ? 'source not read' : `${code === null ? 0 : code.lines} lines`];
    if (hit) facts.push(`matched to src/${matchedFile.get(`${s.class} ${s.path}`) ?? '(a file of the same bytes)'}`);
    const heading = `### ${s.path}\n\n${facts.join(', ')}\n\n`;
    return { heading, code, size: byteLength(heading) + (code === null ? 0 : code.blockBytes), bytes: form === null ? 0 : form.norm.length };
  });
  // restBytes[k]: the normalised source bytes of the scripts after section k.
  const restBytes = new Array<number>(sections.length + 1).fill(0);
  for (let k = sections.length - 1; k >= 0; k--) restBytes[k] = restBytes[k + 1]! + (k + 1 < sections.length ? sections[k + 1]!.bytes : 0);

  const cutLine = (scripts: number, bytes: number): string => `[Cut at ${max} bytes: ${scripts} script${scripts === 1 ? '' : 's'} and ${bytes} bytes of source left out.]\n`;
  let out = head;
  let used = byteLength(head);
  let kept = 0;
  for (; kept < sections.length; kept++) {
    const section = sections[kept]!;
    const restCount = sections.length - kept - 1;
    const tail = restCount === 0 ? 0 : byteLength(cutLine(restCount, restBytes[kept]!));
    if (used + section.size + tail > max) break;
    out += section.code === null ? section.heading : `${section.heading}${section.code.block}`;
    used += section.size;
  }
  if (kept < sections.length) {
    // The first script that does not fit whole: its head, up to its last complete line that fits, then nothing more.
    const first = sections[kept]!;
    const restCount = sections.length - kept - 1;
    const after = restBytes[kept]!;
    const part = first.code === null ? null : scriptHead(first.heading, first.code, max - used, (hidden) => cutLine(restCount, after + hidden));
    out += part ?? cutLine(restCount + 1, after + first.bytes);
  }
  if (byteLength(out) > max) throw new DossierError(`buildDossier: caps.text_max_bytes ${max} cannot hold even the Place block and the cut line`);

  const doc = { schema: DOSSIER_SCHEMA, cover: 0, text: out.replace(/\n+$/, '\n'), images };
  const bytes = Buffer.from(canonicalJson(doc), 'utf8');
  if (bytes.length > DOSSIER_MAX_BYTES) throw new DossierError(`buildDossier: the dossier is ${bytes.length} bytes, over the ${DOSSIER_MAX_BYTES} one holds`);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length);
}

/** A distinct source as the dossier shows it. */
interface SourceCode {
  norm: Uint8Array;
  text: string;
  fence: string;
  /** The fenced block: the fence and `lua`, the text (a last LF added when it lacks one), the fence, a blank line. */
  block: string;
  blockBytes: number;
  lines: number;
}

/**
 * A script's section cut inside its source: its heading, its first k lines in its fence (closed), a line naming
 * how many of its lines are not shown, then `tail(hidden)` (the cut line, given the normalised source bytes this
 * script leaves out), k the most lines (at least one, fewer than all) whose whole fits in `room` UTF-8 bytes;
 * null when not one line fits. It cuts only after a line's LF, which is never inside a UTF-8 sequence nor a
 * replacement character's bytes, so no character is split, and a line's shown bytes are those of its text.
 */
function scriptHead(heading: string, code: { norm: Uint8Array; text: string; fence: string }, room: number, tail: (hidden: number) => string): string | null {
  const total = lineCount(code.norm);
  const lines = code.text.split('\n');
  const open = `${code.fence}lua\n`;
  const close = `${code.fence}\n\n`;
  const note = (k: number): string => `[${total - k} of this script's ${total} lines not shown.]\n`;
  const fixed = byteLength(heading) + byteLength(open) + byteLength(close);
  let best = 0;
  let shown = 0;
  let raw = 0;
  for (let k = 1; k < total; k++) {
    shown += byteLength(lines[k - 1]!) + 1;
    raw = code.norm.indexOf(0x0a, raw) + 1;
    if (fixed + shown + byteLength(note(k)) + byteLength(tail(code.norm.length - raw)) <= room) best = k;
  }
  if (best === 0) return null;
  let rawEnd = 0;
  for (let k = 0; k < best; k++) rawEnd = code.norm.indexOf(0x0a, rawEnd) + 1;
  const head = lines.slice(0, best).map((l) => `${l}\n`).join('');
  return `${heading}${open}${head}${close}${note(best)}${tail(code.norm.length - rawEnd)}`;
}
