/**
 * Checks the Word field expressions the templates wrap around merge fields.
 *
 *   npx tsx tools/verify-field-expressions.ts
 *
 * Two things have to hold. `IF «flag» = Yes "wording"` must bring the wording
 * in when the flag is set and leave it out when it is not — the commercial
 * template uses it for cross-lease tenure and proposed improvements. And a `=`
 * field must add its operands, because the residential template totals the
 * floor areas that way.
 */
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { fillTemplate, type FieldValues } from '../src/report/docx-template';

type Spec = {
  template: string;
  switch_fields: string[];
  conditions: { field: string; value: string }[];
};

const dictionary = JSON.parse(
  readFileSync(new URL('../src/report/field-dictionary.json', import.meta.url), 'utf8'),
) as Record<string, Spec>;

/**
 * Switch values for a plausible market-value report.
 *
 * The templates hold every report type in one document and delete the sections
 * that do not apply, so a fill has to name one. 'Market Value' is the type the
 * alternatives are measured against: it is never one of the enumerated values.
 */
function marketValueSwitches(spec: Spec): FieldValues {
  const reportType = new Set(
    spec.conditions
      .filter((c) => !['yes', 'no', ''].includes((c.value ?? '').trim().toLowerCase()))
      .map((c) => c.field),
  );
  const out: FieldValues = {};
  for (const s of spec.switch_fields) out[s] = reportType.has(s) ? 'Market Value' : 'No';
  return out;
}

const textOf = (xml: string) =>
  (xml.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join(' ');

async function bodyText(docx: Buffer) {
  const zip = await JSZip.loadAsync(docx);
  const names = Object.keys(zip.files).filter((n) => /^word\/document\.xml$/.test(n));
  let out = '';
  for (const n of names) out += textOf(await zip.file(n)!.async('string'));
  return out;
}

async function main() {
  let failures = 0;
  const check = (label: string, ok: boolean, detail = '') => {
    console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures += 1;
  };

  console.log('\n=== conditional wording (commercial IF fields) ===');
  const commercial = dictionary.commercial;
  const template = readFileSync(new URL(`../${commercial.template}`, import.meta.url));
  for (const flag of ['Yes', 'No'] as const) {
    const { docx } = await fillTemplate(template, {
      fields: {
        'Valuations.Crossleasetenure': flag,
        'Valuations.Crosslease': 'CROSS-LEASE-WORDING',
        'Valuations.PropImp': flag,
        'Valuations.ProposedImprovements': 'PROPOSED-IMPROVEMENTS-WORDING',
      },
      switches: {
        ...marketValueSwitches(commercial),
        'Valuations.Crossleasetenure': flag,
        'Valuations.PropImp': flag,
      },
    });
    const body = await bodyText(docx);
    const wanted = flag === 'Yes';
    check(
      `cross-lease wording ${wanted ? 'appears' : 'stays out'} when tenure is ${flag}`,
      body.includes('CROSS-LEASE-WORDING') === wanted,
    );
    check(
      `proposed improvements wording ${wanted ? 'appears' : 'stays out'} when the flag is ${flag}`,
      body.includes('PROPOSED-IMPROVEMENTS-WORDING') === wanted,
    );
  }

  console.log('\n=== totals (residential `=` fields) ===');
  const residential = dictionary.residential;
  const { docx } = await fillTemplate(
    readFileSync(new URL(`../${residential.template}`, import.meta.url)),
    {
      fields: { 'Valuations.LivingAreas': '180.5', 'Valuations.OccupancyCarAreas': '38' },
      switches: marketValueSwitches(residential),
    },
  );
  const body = await bodyText(docx);
  check('living area 180.5 + car area 38 totals 218.5', body.includes('218.5'));

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
