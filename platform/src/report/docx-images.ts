/**
 * Puts photographs into a .docx the way Word does.
 *
 * A picture in a Word document is three things in three places: the image bytes
 * as a part under `word/media/`, a relationship from the content part that shows
 * it, and a `w:drawing` element where it sits in the text. Miss any one and Word
 * reports the file as corrupt, so all three are written here together.
 *
 * The fill engine (docx-template.ts) reduces each `Image:Source,W,H` merge field
 * to a token carrying the photograph's key and the slot's size. This module
 * turns those tokens into drawings.
 */
import type JSZip from 'jszip';

/** A photograph to place, as bytes plus enough to name the part. */
export type ImageInput = {
  data: Buffer | Uint8Array;
  /** `image/png` or `image/jpeg`; sniffed from the bytes when absent. */
  contentType?: string;
  /** Alt text, so the document stays readable to a screen reader. */
  description?: string;
};

const IMAGE_REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

/** Word measures a picture in EMU: 914400 to the inch, 72 points to the inch. */
const EMU_PER_POINT = 12700;

/* ------------------------------------------------------------ image reading */

/**
 * Reads the pixel dimensions out of PNG or JPEG bytes.
 *
 * Needed because most slots in the firm's templates give a width but no height
 * — the aerial map, the street map, the evidence thumbnails — so the height has
 * to come from the photograph's own proportions or the picture comes out
 * stretched.
 */
export function imagePixelSize(
  data: Buffer | Uint8Array,
): { width: number; height: number } | null {
  const b = data instanceof Buffer ? data : Buffer.from(data);
  // PNG: the IHDR chunk leads the file, width and height big-endian at 16.
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  // JPEG: walk the marker segments to the first start-of-frame.
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = b[i + 1];
      // Standalone markers carry no length.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const length = b.readUInt16BE(i + 2);
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      if (length < 2) return null;
      i += 2 + length;
    }
  }
  return null;
}

function sniffContentType(data: Buffer | Uint8Array): string {
  const b = data instanceof Buffer ? data : Buffer.from(data);
  if (b.length > 3 && b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  return 'image/jpeg';
}

/**
 * Both master templates already declare `png` and `jpeg` in their content types,
 * so naming every part with one of those two extensions keeps the fill from
 * having to edit `[Content_Types].xml`.
 */
function extensionFor(contentType: string): 'png' | 'jpeg' {
  return contentType === 'image/png' ? 'png' : 'jpeg';
}

/* -------------------------------------------------------------- the context */

/**
 * Tracks what has been written to the archive while the parts are filled.
 *
 * A photograph used in two places becomes one media part, and one relationship
 * per content part that shows it. Ids have to clear what the template already
 * uses: the residential master has a `wp:docPr` id of 2,072,715,887 in it, so
 * new ids are counted up from the highest found rather than from a guess.
 */
export type ImageContext = {
  images: Record<string, ImageInput>;
  /** key -> target path relative to `word/`, e.g. `media/image42.png`. */
  media: Map<string, string>;
  /** part name -> (key -> relationship id). */
  rels: Map<string, Map<string, string>>;
  /** part name -> that part's rels XML, created when the template has none. */
  relsXml: Map<string, string>;
  nextMedia: number;
  nextDocPr: number;
  /** Parts whose rels XML changed and must be written back. */
  dirty: Set<string>;
};

const RELS_SKELETON =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

export async function createImageContext(
  zip: JSZip,
  images: Record<string, ImageInput>,
  parts: string[],
): Promise<ImageContext> {
  let nextMedia = 1;
  for (const name of Object.keys(zip.files)) {
    const m = /^word\/media\/image(\d+)\./.exec(name);
    if (m) nextMedia = Math.max(nextMedia, Number(m[1]) + 1);
  }

  // `wp:docPr` ids must be unique across the document, so start above every id
  // the template already carries.
  let nextDocPr = 1;
  for (const part of parts) {
    const file = zip.file(part);
    if (!file) continue;
    const xml = await file.async('string');
    for (const m of xml.matchAll(/<wp:docPr\s[^>]*\bid="(\d+)"/g)) {
      nextDocPr = Math.max(nextDocPr, Number(m[1]) + 1);
    }
  }

  return {
    images,
    media: new Map(),
    rels: new Map(),
    relsXml: new Map(),
    nextMedia,
    nextDocPr,
    dirty: new Set(),
  };
}

/** Writes the image bytes into the archive once, however often it is used. */
function ensureMedia(zip: JSZip, ctx: ImageContext, key: string): string | null {
  const existing = ctx.media.get(key);
  if (existing) return existing;
  const image = ctx.images[key];
  if (!image) return null;
  const contentType = image.contentType ?? sniffContentType(image.data);
  const target = `media/image${ctx.nextMedia++}.${extensionFor(contentType)}`;
  zip.file(`word/${target}`, image.data);
  ctx.media.set(key, target);
  return target;
}

async function relsFor(zip: JSZip, ctx: ImageContext, part: string): Promise<string> {
  const cached = ctx.relsXml.get(part);
  if (cached !== undefined) return cached;
  const relsName = part.replace(/^word\//, 'word/_rels/') + '.rels';
  const file = zip.file(relsName);
  const xml = file ? await file.async('string') : RELS_SKELETON;
  ctx.relsXml.set(part, xml);
  return xml;
}

/** Adds the relationship from this content part to the image, once per part. */
async function ensureRel(
  zip: JSZip,
  ctx: ImageContext,
  part: string,
  key: string,
): Promise<string | null> {
  let byKey = ctx.rels.get(part);
  if (!byKey) {
    byKey = new Map();
    ctx.rels.set(part, byKey);
  }
  const existing = byKey.get(key);
  if (existing) return existing;

  const target = ensureMedia(zip, ctx, key);
  if (!target) return null;

  const xml = await relsFor(zip, ctx, part);
  // A fresh id has to clear the ids already in this part's rels.
  let next = 1;
  for (const m of xml.matchAll(/\bId="rId(\d+)"/g)) next = Math.max(next, Number(m[1]) + 1);
  const id = `rId${next}`;
  const relationship =
    `<Relationship Id="${id}" Type="${IMAGE_REL}" Target="${target}"/>`;
  ctx.relsXml.set(part, xml.replace('</Relationships>', `${relationship}</Relationships>`));
  ctx.dirty.add(part);
  byKey.set(key, id);
  return id;
}

/** Writes back every rels part that gained a relationship. */
export function flushImageContext(zip: JSZip, ctx: ImageContext): void {
  for (const part of ctx.dirty) {
    const xml = ctx.relsXml.get(part);
    if (!xml) continue;
    zip.file(part.replace(/^word\//, 'word/_rels/') + '.rels', xml);
  }
}

/* --------------------------------------------------------------- the drawing */

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * An inline picture, sized in EMU.
 *
 * `xmlns:a` and `xmlns:pic` are declared on the elements themselves because
 * neither master template declares them on `w:document` — only `w:r` and `wp`.
 */
export function inlineDrawing(opts: {
  relId: string;
  docPrId: number;
  widthEmu: number;
  heightEmu: number;
  name: string;
  description?: string;
}): string {
  const name = escapeAttr(opts.name);
  const descr = opts.description ? ` descr="${escapeAttr(opts.description)}"` : '';
  return (
    '<w:r><w:drawing>' +
    '<wp:inline distT="0" distB="0" distL="0" distR="0"' +
    ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
    `<wp:extent cx="${opts.widthEmu}" cy="${opts.heightEmu}"/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    `<wp:docPr id="${opts.docPrId}" name="${name}"${descr}/>` +
    '<wp:cNvGraphicFramePr>' +
    '<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
    ' noChangeAspect="1"/>' +
    '</wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:nvPicPr>' +
    `<pic:cNvPr id="0" name="${name}"${descr}/>` +
    '<pic:cNvPicPr/>' +
    '</pic:nvPicPr>' +
    '<pic:blipFill>' +
    `<a:blip r:embed="${opts.relId}"/>` +
    '<a:stretch><a:fillRect/></a:stretch>' +
    '</pic:blipFill>' +
    '<pic:spPr>' +
    '<a:xfrm><a:off x="0" y="0"/>' +
    `<a:ext cx="${opts.widthEmu}" cy="${opts.heightEmu}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    '</pic:spPr>' +
    '</pic:pic>' +
    '</a:graphicData>' +
    '</a:graphic>' +
    '</wp:inline>' +
    '</w:drawing></w:r>'
  );
}

/**
 * Works out the picture's size in EMU from the slot and the photograph.
 *
 * The slot's width wins, because the template's widths are what keep a picture
 * inside the page margins and a thumbnail inside its table cell. The height
 * follows the photograph's own proportions unless the slot fixes one, so a
 * portrait photograph in a landscape slot is not stretched to fit.
 */
export function sizeInEmu(
  slot: { width?: number | null; height?: number | null },
  pixels: { width: number; height: number } | null,
): { widthEmu: number; heightEmu: number } {
  const widthPt = slot.width && slot.width > 0 ? slot.width : 410;
  if (slot.height && slot.height > 0) {
    return {
      widthEmu: Math.round(widthPt * EMU_PER_POINT),
      heightEmu: Math.round(slot.height * EMU_PER_POINT),
    };
  }
  // 3:2 is the shape a camera gives, and a safe fallback when the bytes do not parse.
  const ratio = pixels && pixels.width > 0 ? pixels.height / pixels.width : 2 / 3;
  return {
    widthEmu: Math.round(widthPt * EMU_PER_POINT),
    heightEmu: Math.round(widthPt * ratio * EMU_PER_POINT),
  };
}

/* ------------------------------------------------------------- the token pass */

/** A resolved image token: the photograph's key and the slot's size. */
export type ResolvedImageToken = { key: string; width: number | null; height: number | null };

export const RESOLVED_PREFIX = 'Image@';

/** `Image@key|width|height` — what the fill engine leaves for this module. */
export function encodeImageToken(t: ResolvedImageToken): string {
  return `${RESOLVED_PREFIX}${t.key}|${t.width ?? ''}|${t.height ?? ''}`;
}

export function decodeImageToken(text: string): ResolvedImageToken | null {
  if (!text.startsWith(RESOLVED_PREFIX)) return null;
  const body = text.slice(RESOLVED_PREFIX.length);
  const bar = body.lastIndexOf('|');
  if (bar < 0) return null;
  const secondBar = body.lastIndexOf('|', bar - 1);
  if (secondBar < 0) return null;
  const key = body.slice(0, secondBar);
  const width = body.slice(secondBar + 1, bar);
  const height = body.slice(bar + 1);
  return {
    key,
    width: width === '' ? null : Number(width),
    height: height === '' ? null : Number(height),
  };
}

/**
 * Replaces every resolved image token in a content part with a picture.
 *
 * The token sits alone in its own run, because that is how the fill engine
 * writes it, so the whole run is swapped for the drawing's run — a `w:drawing`
 * is not valid inside the `w:t` the token occupies.
 */
export async function insertImages(
  xml: string,
  part: string,
  zip: JSZip,
  ctx: ImageContext,
  open: string,
  close: string,
  onInserted: (key: string) => void,
  onMissing: (key: string) => void,
): Promise<string> {
  // A run holding the token, matched without crossing out of the run.
  const runPattern = new RegExp(
    `<w:r(?:\\s[^>]*)?>(?:(?!</w:r>)[\\s\\S])*?${open}(${RESOLVED_PREFIX}[^${close}]*)${close}(?:(?!</w:r>)[\\s\\S])*?</w:r>`,
    'g',
  );

  // Resolution needs awaits, so collect first, then splice.
  const found: { whole: string; index: number; token: ResolvedImageToken }[] = [];
  for (const m of xml.matchAll(runPattern)) {
    const token = decodeImageToken(m[1]);
    if (token) found.push({ whole: m[0], index: m.index ?? 0, token });
  }
  if (found.length === 0) return xml;

  let out = '';
  let cursor = 0;
  for (const hit of found) {
    out += xml.slice(cursor, hit.index);
    cursor = hit.index + hit.whole.length;

    const image = ctx.images[hit.token.key];
    const relId = image ? await ensureRel(zip, ctx, part, hit.token.key) : null;
    if (!image || !relId) {
      // No photograph for this slot: the slot comes out, leaving the caption.
      onMissing(hit.token.key);
      continue;
    }
    const { widthEmu, heightEmu } = sizeInEmu(hit.token, imagePixelSize(image.data));
    out += inlineDrawing({
      relId,
      docPrId: ctx.nextDocPr++,
      widthEmu,
      heightEmu,
      name: hit.token.key,
      description: image.description,
    });
    onInserted(hit.token.key);
  }
  out += xml.slice(cursor);
  return out;
}
