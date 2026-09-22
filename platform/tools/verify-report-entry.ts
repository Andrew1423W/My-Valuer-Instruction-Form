/**
 * Checks the report entry form asks the right questions.
 *
 *   npx tsx tools/verify-report-entry.ts
 *
 * The form is generated from the templates, so what it asks depends entirely on
 * the dictionary being read correctly: the sections have to be the template's
 * own, the questions have to shrink when a section is switched off, and nothing
 * the practice already holds should be asked for twice.
 */
import { entryProgress, entryRegions, entrySections, entrySwitches, fieldLabel } from '../src/report/entry';
import { reportTypeSwitchField, templateSpec } from '../src/report/job-fields';
import type { ReportTemplate } from '../src/db/schema';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

function defaults(template: ReportTemplate, reportType: string) {
  const out: Record<string, string> = {};
  for (const f of templateSpec(template).switch_fields) out[f] = 'No';
  out[reportTypeSwitchField(template)] = reportType;
  return out;
}

for (const template of ['commercial', 'residential'] as const) {
  console.log(`\n=== ${template} ===`);
  const spec = templateSpec(template);
  const switches = defaults(template, 'Market Value');

  const sections = entrySections(template, switches);
  const fields = sections.flatMap((s) => s.fields);
  console.log(`  ${sections.length} sections, ${fields.length} fields to write`);
  for (const s of sections.slice(0, 14)) console.log(`     ${s.title} — ${s.fields.length}`);

  check('the form has sections', sections.length >= 5);
  check('every section is named', sections.every((s) => s.title.trim().length > 0));
  check('sections come from the template, not from us',
    sections.some((s) => s.title === 'Executive Summary'));
  check('the form asks for fewer fields than the template names',
    fields.length < spec.job_fields.length,
    `${fields.length} of ${spec.job_fields.length}`);
  check('nothing is asked for twice', new Set(fields.map((f) => f.name)).size === fields.length);
  check('the practice\'s own data is not asked for',
    !fields.some((f) => ['Valuations.Address', 'Valuations.JobNumber', 'Valuer.ValuerName'].includes(f.name)));
  check('long narrative gets a text box', fields.some((f) => f.long));

  const questions = entrySwitches(template, reportTypeSwitchField(template));
  console.log(`  ${questions.length} questions decide what the report contains`);
  check('the questions are Yes/No', questions.every((q) => q.options.join('/') === 'Yes/No'));
  check('each question says what it does', questions.every((q) => q.effect.includes('section')));
  check('the report type is not asked here',
    !questions.some((q) => q.name === reportTypeSwitchField(template)));

  // Answering the questions has to change what the form asks for. Not every
  // block holds a field — some switch boilerplate wording — so this looks for
  // the ones that do, and reports how many.
  const moving = questions
    .map((q) => {
      const flipped = { ...switches, [q.name]: switches[q.name] === 'Yes' ? 'No' : 'Yes' };
      const count = entrySections(template, flipped).flatMap((s) => s.fields).length;
      return { label: q.label, delta: count - fields.length };
    })
    .filter((q) => q.delta !== 0);
  check('answering the questions changes what the form asks for',
    moving.length > 0,
    `${moving.length} of ${questions.length} questions add or remove fields`);
  for (const q of moving.slice(0, 5)) {
    console.log(`     ${q.label}: ${q.delta > 0 ? '+' : ''}${q.delta} fields`);
  }

  const regions = entryRegions(template, switches);
  console.log(`  ${regions.length} schedules to fill by hand`);
  for (const r of regions.slice(0, 8)) console.log(`     ${r.label} (${r.fields.length} columns)`);
  check('the evidence and tenancy schedules are not asked for by hand',
    !regions.some((r) => /Evidence|SubjectLeases|ValuerInvolvement/.test(r.name)));
  check('the room schedules are offered', regions.some((r) => /Bedroom|Kitchen/.test(r.name)));

  const progress = entryProgress(template, switches, {
    [fields[0].name]: 'written',
    [fields[1].name]: '',
  });
  check('progress counts only what is written',
    progress.written === 1 && progress.total === fields.length,
    `${progress.written}/${progress.total}`);
}

console.log('\n=== labels ===');
for (const [name, want] of [
  ['Valuations.SiteDescriptionTopography', 'Site description topography'],
  ['Valuations.NBS', 'Seismic rating (%NBS)'],
  ['AuthValuer.Qualifications', 'Counter-signing valuer: Qualifications'],
] as const) {
  check(`${name} reads as '${want}'`, fieldLabel(name) === want, fieldLabel(name));
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
