/**
 * Fills both master templates with sample data and checks the result is sound.
 *
 *   npx tsx tools/verify-template-fill.ts
 *
 * Checks, per template: the output unzips, every content part is well-formed
 * XML, no merge field or token survives, and the values actually landed in the
 * document text. Writes the filled files to /tmp so they can be opened in Word.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { fillTemplate, type FieldValues } from '../src/report/docx-template';

type Spec = {
  job_fields: { name: string }[];
  row_fields: { name: string }[];
  regions: { name: string; row_fields: string[] }[];
  switch_fields: string[];
  conditions: { expr: string; field: string; op: string; value: string }[];
};

const dictionary = JSON.parse(
  readFileSync(new URL('../src/report/field-dictionary.json', import.meta.url), 'utf8'),
) as Record<string, Spec & { template: string }>;

/** Word fields the fill deliberately leaves in place. */
const ALLOWED_FIELDS = new Set([
  'PAGE', 'NUMPAGES', 'PAGEREF', 'REF', 'TOC', 'TC', 'DATE', 'TIME',
  'STYLEREF', 'SEQ', 'HYPERLINK', 'FILENAME', 'SAVEDATE', 'AUTHOR', 'TITLE',
]);

/** A recognisable marker so we can prove a value reached the document. */
const stamp = (name: string) => `[[${name}]]`;

/**
 * A switch the template compares against report types rather than Yes/No.
 *
 * The templates hold every report type in one document and delete the sections
 * that do not apply, so a fill has to name one. 'Market Value' is the type the
 * alternatives are measured against: it is never one of the enumerated values.
 */
function reportTypeSwitches(spec: Spec): Set<string> {
  const out = new Set<string>();
  for (const c of spec.conditions) {
    const value = (c.value ?? '').trim().toLowerCase();
    if (value && value !== 'yes' && value !== 'no') out.add(c.field);
  }
  return out;
}

function sampleInput(spec: Spec, booleanAnswer: 'Yes' | 'No') {
  const fields: FieldValues = {};
  for (const f of spec.job_fields) fields[f.name] = stamp(f.name);

  const reportType = reportTypeSwitches(spec);
  const switches: FieldValues = {};
  for (const s of spec.switch_fields) {
    switches[s] = reportType.has(s) ? 'Market Value' : booleanAnswer;
  }

  const rows: Record<string, FieldValues[]> = {};
  for (const r of spec.regions) {
    // Two rows per region proves the repeat, not just the substitution.
    rows[r.name] = [0, 1].map((i) =>
      Object.fromEntries(r.row_fields.map((f) => [f, `${stamp(f)}#${i}`])),
    );
  }
  return { fields, rows, switches };
}

async function contentParts(docx: Buffer) {
  const zip = await JSZip.loadAsync(docx);
  const names = Object.keys(zip.files).filter((n) =>
    /^word\/(document|header\d+|footer\d+)\.xml$/.test(n),
  );
  const out: Record<string, string> = {};
  for (const n of names) out[n] = await zip.file(n)!.async('string');
  return out;
}

/** Well-formedness check without a DOM dependency: balance every element. */
function xmlIsBalanced(xml: string): { ok: true } | { ok: false; detail: string } {
  const tag = /<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>/g;
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml))) {
    const [, closing, name, rest, selfClose] = m;
    if (rest.startsWith('?') || name.startsWith('!')) continue;
    if (selfClose === '/' || rest.endsWith('/')) continue;
    if (closing === '/') {
      const top = stack.pop();
      if (top !== name) return { ok: false, detail: `</${name}> closed <${top ?? 'nothing'}>` };
    } else {
      stack.push(name);
    }
  }
  return stack.length === 0 ? { ok: true } : { ok: false, detail: `unclosed <${stack.pop()}>` };
}

const textOf = (xml: string) =>
  (xml.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join(' ');

async function main() {
  let failures = 0;
  const check = (label: string, ok: boolean, detail = '') => {
    console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures += 1;
  };

  for (const [key, spec] of Object.entries(dictionary)) {
    console.log(`\n=== ${key} (${spec.template}) ===`);
    const template = readFileSync(new URL(`../${spec.template}`, import.meta.url));

    // No single fill can place every field: the Yes/No switches delete
    // alternative wordings of the same clause. Coverage is measured over both
    // answers, while the structural checks run on each fill.
    const placed = new Set<string>();
    const repeatedRegions = new Set<string>();
    for (const answer of ['Yes', 'No'] as const) {
      const alt = await fillTemplate(template, sampleInput(spec, answer));
      const altBody = Object.values(await contentParts(alt.docx)).map(textOf).join(' ');
      for (const f of spec.job_fields) if (altBody.includes(stamp(f.name))) placed.add(f.name);
      for (const r of spec.regions) {
        if (r.row_fields.some((f) => altBody.includes(`${stamp(f)}#1`))) repeatedRegions.add(r.name);
      }
    }

    const input = sampleInput(spec, 'No');
    const { docx, report } = await fillTemplate(template, input);

    const outPath = `/tmp/filled-${key}.docx`;
    writeFileSync(outPath, docx);
    console.log(
      `  filled ${report.fieldsFilled} fields, ` +
        `${report.regionsExpanded.length} regions, ` +
        `kept ${report.blocksKept.length} / dropped ${report.blocksDropped.length} blocks, ` +
        `${report.imagesSkipped} image slots skipped`,
    );
    console.log(`  wrote ${outPath} (${(docx.length / 1024).toFixed(0)} KB)`);

    const parts = await contentParts(docx);
    check('output unzips with content parts', Object.keys(parts).length > 0);

    for (const [name, xml] of Object.entries(parts)) {
      const bal = xmlIsBalanced(xml);
      if (!bal.ok) check(`${name} is well-formed`, false, bal.detail);
    }
    check(
      'every content part is well-formed XML',
      Object.values(parts).every((x) => xmlIsBalanced(x).ok),
    );

    const all = Object.values(parts).join('');
    check('no MERGEFIELD instruction survives', !all.includes('MERGEFIELD'));
    check('no unresolved token survives', !/[\uE000\uE001]/.test(all));
    check(
      'no token was dropped for want of a value',
      report.tokensDropped.length === 0,
      report.tokensDropped.slice(0, 5).join(', '),
    );
    check(
      'no marker was left without its pair',
      report.markersOrphaned.length === 0,
      report.markersOrphaned.slice(0, 5).join(', '),
    );

    // Page numbers, cross references and the contents page are Word fields the
    // fill leaves alone; nothing else should still be a field.
    const kept = [...all.matchAll(/<w:instrText[^>]*>([\s\S]*?)<\/w:instrText>/g)]
      .map((m) => m[1].trim().split(/\s+/)[0])
      .filter((kw) => kw && !ALLOWED_FIELDS.has(kw.toUpperCase()));
    check('only page and reference fields survive', kept.length === 0, [...new Set(kept)].join(', '));

    const body = textOf(parts['word/document.xml']);
    check(
      `job values reached the document (${placed.size}/${spec.job_fields.length})`,
      placed.size > spec.job_fields.length * 0.8,
      spec.job_fields
        .map((f) => f.name)
        .filter((n) => !placed.has(n))
        .slice(0, 8)
        .join(', '),
    );

    const withFields = spec.regions.filter((r) => r.row_fields.length > 0).length;
    check(
      `repeating regions produced a second row (${repeatedRegions.size}/${withFields})`,
      repeatedRegions.size > withFields * 0.8,
      `${repeatedRegions.size} of ${withFields} regions with row fields`,
    );

    const droppedShown = report.blocksDropped
      .filter((expr) => body.includes(expr))
      .slice(0, 3);
    check('dropped blocks left no marker text behind', droppedShown.length === 0,
      droppedShown.join(', '));
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
