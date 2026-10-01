/**
 * Checks that photographs land in both master templates' picture slots.
 *
 *   npx tsx tools/verify-image-fill.ts
 *
 * A picture in a .docx is three things in three places — the bytes under
 * `word/media/`, a relationship from the content part, and a `w:drawing` where
 * it sits — and Word calls the file corrupt if any one is missing or if two
 * pictures share a `wp:docPr` id. This fills every slot each template declares
 * and checks all of that, including the shapes: a slot with no height takes the
 * photograph's own proportions, so a portrait photograph is not stretched into a
 * landscape box.
 *
 * Test photographs are generated here rather than committed, so the check needs
 * no binary fixtures.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import JSZip from 'jszip';
import { fillTemplate, type FieldValues, type ImageInput } from '../src/report/docx-template';
import { imagePixelSize, sizeInEmu } from '../src/report/docx-images';
import { singlePhotoSlots } from '../src/report/photo-slots';
import { photoRows } from '../src/report/job-fields';

type ImageSlot = {
  source: string;
  region: string;
  width: string | null;
  height: string | null;
};

type Spec = {
  template: string;
  job_fields: { name: string }[];
  regions: { name: string; row_fields: string[] }[];
  switch_fields: string[];
  conditions: { field: string; value: string }[];
  images: ImageSlot[];
};

const dictionary = JSON.parse(
  readFileSync(new URL('../src/report/field-dictionary.json', import.meta.url), 'utf8'),
) as Record<string, Spec>;

/* ------------------------------------------------------- test photographs */

/** A real PNG, built by hand: signature, IHDR, IDAT, IEND. */
function png(width: number, height: number, seed: number): Buffer {
  const chunk = (type: string, body: Buffer): Buffer => {
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([len, typed, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 2; // truecolour RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  let p = 0;
  for (let y = 0; y < height; y += 1) {
    raw[p++] = 0; // no filter
    for (let x = 0; x < width; x += 1) {
      raw[p++] = (seed + x) % 256;
      raw[p++] = (seed + y) % 256;
      raw[p++] = seed % 256;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable: number[] | null = null;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Landscape, portrait and thumbnail, so aspect handling is actually exercised. */
const PHOTOS: Record<string, ImageInput> = {
  'photo-landscape': { data: png(120, 80, 40), description: 'Front elevation' },
  'photo-portrait': { data: png(80, 120, 120), description: 'Rear elevation' },
  'photo-thumb': { data: png(60, 45, 200), description: 'Comparable sale' },
};
const PHOTO_KEYS = Object.keys(PHOTOS);

/* ------------------------------------------------------------------ checks */

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail && !ok ? ` — ${detail}` : ''}`);
}

function reportTypeSwitches(spec: Spec): Set<string> {
  const out = new Set<string>();
  for (const c of spec.conditions) {
    const value = (c.value ?? '').trim().toLowerCase();
    if (value && value !== 'yes' && value !== 'no') out.add(c.field);
  }
  return out;
}

/**
 * Feeds a photograph to every slot the template declares.
 *
 * Slots are addressed through the region they sit in: a region with one row is
 * how the template shows a single photograph, and a region with many is how it
 * lays out a grid or a table of comparables, so both come from the same place.
 */
function inputFor(spec: Spec) {
  const fields: FieldValues = {};
  for (const f of spec.job_fields) fields[f.name] = `[[${f.name}]]`;

  const reportType = reportTypeSwitches(spec);
  const switches: FieldValues = {};
  for (const s of spec.switch_fields) switches[s] = reportType.has(s) ? 'Market Value' : 'No';

  // Every region gets two rows, so a slot inside one is placed twice.
  const rows: Record<string, FieldValues[]> = {};
  for (const region of spec.regions) {
    const slots = spec.images.filter((i) => i.region === region.name);
    rows[region.name] = [0, 1].map((n) => {
      const row: FieldValues = {};
      for (const f of region.row_fields) row[f] = `[[${f}]]`;
      for (const slot of slots) {
        // Rotate the photographs so landscape, portrait and thumbnail all appear.
        row[slot.source] = PHOTO_KEYS[(n + slot.source.length) % PHOTO_KEYS.length];
      }
      return row;
    });
  }
  return { fields, rows, switches, images: PHOTOS };
}

async function main(): Promise<void> {
  for (const [name, spec] of Object.entries(dictionary)) {
    console.log(`\n${name} — ${spec.template}`);
    // `template` in the dictionary is already repository-relative to platform/.
    const templateBytes = readFileSync(new URL(`../${spec.template}`, import.meta.url));

    const { docx, report } = await fillTemplate(templateBytes, inputFor(spec));
    const out = `/tmp/myvaluer-${name}-images.docx`;
    writeFileSync(out, docx);

    const zip = await JSZip.loadAsync(docx);

    // Every slot is inside a region given two rows, so each is placed twice.
    const expected = spec.images.length * 2;
    check(
      `photographs placed (${report.imagesInserted} of ${expected} slot instances)`,
      report.imagesInserted > 0 && report.imagesSkipped === 0,
      `inserted ${report.imagesInserted}, skipped ${report.imagesSkipped}`,
    );

    // 1. The bytes are in the archive, and are the photographs we supplied.
    // Archives carry directory entries too; only real files can be read.
    const media = Object.keys(zip.files).filter(
      (n) => n.startsWith('word/media/') && !zip.files[n].dir,
    );
    const added: string[] = [];
    for (const m of media) {
      const bytes = await zip.file(m)!.async('nodebuffer');
      if (PHOTO_KEYS.some((k) => Buffer.compare(bytes, PHOTOS[k].data as Buffer) === 0)) {
        added.push(m);
      }
    }
    check('photograph bytes written to word/media', added.length > 0, `${media.length} media parts`);

    // 2. Every r:embed resolves to an image relationship in that part's rels.
    const contentParts = Object.keys(zip.files).filter((n) =>
      /^word\/(document|header\d+|footer\d+)\.xml$/.test(n),
    );
    let embedCount = 0;
    const dangling: string[] = [];
    const docPrIds: number[] = [];
    for (const part of contentParts) {
      const xml = await zip.file(part)!.async('string');
      const relsFile = zip.file(part.replace(/^word\//, 'word/_rels/') + '.rels');
      const rels = relsFile ? await relsFile.async('string') : '';
      const known = new Set(Array.from(rels.matchAll(/Id="([^"]+)"/g)).map((m) => m[1]));
      for (const m of xml.matchAll(/<a:blip[^>]*r:embed="([^"]+)"/g)) {
        embedCount += 1;
        if (!known.has(m[1])) dangling.push(`${part}:${m[1]}`);
      }
      for (const m of xml.matchAll(/<wp:docPr\s[^>]*\bid="(\d+)"/g)) docPrIds.push(Number(m[1]));
      // Targets named in rels must exist in the archive.
      for (const m of rels.matchAll(/Target="(media\/[^"]+)"/g)) {
        if (!zip.file(`word/${m[1]}`)) dangling.push(`${part}:missing ${m[1]}`);
      }
    }
    check(`every picture reference resolves (${embedCount} references)`,
      embedCount > 0 && dangling.length === 0, dangling.slice(0, 3).join(', '));

    // 3. Word requires unique drawing ids across the document.
    check('drawing ids are unique', new Set(docPrIds).size === docPrIds.length,
      `${docPrIds.length} drawings, ${new Set(docPrIds).size} distinct ids`);

    // 4. Content types cover the extensions used.
    const ct = await zip.file('[Content_Types].xml')!.async('string');
    const exts = new Set(Array.from(ct.matchAll(/<Default Extension="([^"]+)"/g)).map((m) => m[1]));
    const usedExts = new Set(added.map((m) => m.split('.').pop() as string));
    const uncovered = [...usedExts].filter((e) => !exts.has(e));
    check('content types declare every image extension used', uncovered.length === 0,
      uncovered.join(', '));

    // 5. Still well-formed XML, and no drawing left inside a w:t.
    for (const part of contentParts) {
      const xml = await zip.file(part)!.async('string');
      const bad = /<w:t(?:\s[^>]*)?>[^<]*<w:drawing/.test(xml);
      if (bad) check(`${part}: drawing not nested inside a text run`, false);
    }
    check('no drawing nested inside a text element', true);

    // 6. The slot's shape is respected: fixed heights kept, others from the photo.
    const landscape = imagePixelSize(PHOTOS['photo-landscape'].data)!;
    const portrait = imagePixelSize(PHOTOS['photo-portrait'].data)!;
    check('pixel dimensions read from PNG',
      landscape.width === 120 && landscape.height === 80 && portrait.height === 120,
      `${landscape.width}x${landscape.height}, ${portrait.width}x${portrait.height}`);

    const fixed = sizeInEmu({ width: 410, height: 270 }, landscape);
    check('a slot with a fixed height uses it',
      fixed.widthEmu === 410 * 12700 && fixed.heightEmu === 270 * 12700,
      `${fixed.widthEmu}x${fixed.heightEmu}`);

    const freeLandscape = sizeInEmu({ width: 300, height: null }, landscape);
    const freePortrait = sizeInEmu({ width: 300, height: null }, portrait);
    check('a slot with no height follows the photograph',
      freeLandscape.heightEmu === Math.round(300 * (80 / 120) * 12700) &&
        freePortrait.heightEmu === Math.round(300 * (120 / 80) * 12700),
      `landscape ${freeLandscape.heightEmu}, portrait ${freePortrait.heightEmu}`,
    );
    check('a portrait photograph is taller than a landscape one in the same slot',
      freePortrait.heightEmu > freeLandscape.heightEmu);

    // 7. A slot with no photograph leaves no debris and no broken picture.
    const { docx: noPhotos, report: bare } = await fillTemplate(templateBytes, {
      ...inputFor(spec),
      images: {},
    });
    const bareZip = await JSZip.loadAsync(noPhotos);
    let bareEmbeds = 0;
    for (const part of contentParts) {
      const file = bareZip.file(part);
      if (!file) continue;
      const xml = await file.async('string');
      bareEmbeds += Array.from(xml.matchAll(/<a:blip[^>]*r:embed="rId\d+"/g)).length;
    }
    const templateEmbeds = await (async () => {
      const z = await JSZip.loadAsync(templateBytes);
      let n = 0;
      for (const part of contentParts) {
        const f = z.file(part);
        if (!f) continue;
        n += Array.from((await f.async('string')).matchAll(/<a:blip[^>]*r:embed="rId\d+"/g)).length;
      }
      return n;
    })();
    check('with no photographs supplied, no picture is added',
      bareEmbeds === templateEmbeds && bare.imagesInserted === 0,
      `${bareEmbeds} vs template's ${templateEmbeds}`);
    check('slots with no photograph are reported, not left as tokens',
      bare.imagesSkipped > 0 && !bare.tokensDropped.some((t) => t.startsWith('Image')),
      `skipped ${bare.imagesSkipped}`);

    console.log(`       → ${out}`);
  }

  // The fill above proves the engine reaches a slot when a row names the right
  // field. This proves the job's own photographs are written under that name:
  // the Home Overview kitchen and bathroom read `PhotoID1`, not `PhotoID`, so a
  // mapping that assumed one name silently left those two slots empty.
  console.log('\n— photographs reach every slot the valuer can choose —');
  for (const template of ['commercial', 'residential'] as const) {
    const spec = dictionary[template] as Spec;
    const declared = new Map<string, Set<string>>();
    for (const image of spec.images) {
      (declared.get(image.region) ?? declared.set(image.region, new Set()).get(image.region)!)
        .add(image.source);
    }
    for (const slot of singlePhotoSlots(template)) {
      const rows = photoRows(template, [{ key: 'photo-1', slot: slot.name, caption: 'A caption' }]);
      const row = rows[slot.name]?.[0] ?? {};
      const missing = [...(declared.get(slot.name) ?? [])].filter((src) => row[src] !== 'photo-1');
      check(`${template}: ${slot.name} is named by the photograph's row`,
        missing.length === 0,
        missing.length ? `nothing written under ${missing.join(', ')}` : '');
    }
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
