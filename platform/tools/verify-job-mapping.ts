/**
 * Fills a master template from a job, end to end, without a database.
 *
 *   npx tsx tools/verify-job-mapping.ts
 *
 * Proves the mapping in src/report/job-fields.ts actually reaches the document:
 * the job's own data, the narrative the valuer wrote, the tenancy schedule, the
 * evidence, and the report type deciding which sections survive.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { fillTemplate } from '../src/report/docx-template';
import {
  TEMPLATE_FILES,
  buildFillInput,
  dollarsInWords,
  type ReportJob,
  type StoredReportData,
} from '../src/report/job-fields';

const job: ReportJob = {
  jobNo: 'MV26-0412',
  reportTemplate: 'commercial',
  reportType: 'market_value',
  purpose: 'First mortgage security',
  purposeDetail: 'Report to be addressed to the bank and the borrower.',
  basis: 'Market Value',
  borrower: 'Ahuriri Holdings Limited',
  vosOrderNo: 'VOS-884210',
  effectiveDate: '2026-09-15',
  adoptedValue: '4250000.00',
  adoptedLandValue: '1450000.00',
  adoptedImprovements: '2800000.00',
  adoptedRental: '298000.00',
  adoptedYield: '6.850',
  insuranceReplacement: '3900000.00',
  notes: 'Inspected in fine weather; all tenancies in occupation.',
  property: {
    address: '17 Bridge Street',
    suburb: 'Ahuriri',
    town: 'Napier',
    region: "Hawke's Bay",
    propertyType: 'industrial',
    legalDescription: 'Lot 2 DP 14872',
    titleNo: 'HB12A/884',
    estate: 'Fee Simple',
    landArea: '3040.00',
    floorArea: '1860.00',
    zoning: 'General Industrial',
    yearBuilt: 1998,
    nbsRating: '67% NBS (IL2)',
    councilRef: '1234567',
    ratingLandValue: '1150000.00',
    ratingImprovements: '2350000.00',
    ratingCapitalValue: '3500000.00',
    ratingEffectiveDate: '2024-09-01',
    tenancies: [
      {
        tenant: 'Coastal Engineering Limited',
        unit: 'Unit A',
        areaSqm: '1120.00',
        rentPa: '168000.00',
        outgoingsBasis: 'Net',
        marketRentPa: '174000.00',
        leaseStart: '2023-04-01',
        leaseExpiry: '2029-03-31',
        renewals: '2 x 3 years',
        reviewBasis: 'CPI annually, market at renewal',
        comments: 'Established tenant, no arrears.',
      },
      {
        tenant: 'Bay Distribution Co',
        unit: 'Unit B',
        areaSqm: '740.00',
        rentPa: '104000.00',
        outgoingsBasis: 'Net',
        marketRentPa: '106000.00',
        leaseStart: '2024-10-01',
        leaseExpiry: '2027-09-30',
        renewals: '1 x 3 years',
        reviewBasis: 'Market at renewal',
        comments: null,
      },
    ],
  },
  clientOrg: { name: 'Example Bank Limited', address: 'PO Box 1234, Napier 4140' },
  client: { name: 'Jordan Ellis', company: 'Example Bank Limited' },
  instructor: { name: 'Jordan Ellis', company: 'Example Bank Limited' },
  allocatedTo: { name: 'A N Other', role: 'registered_valuer', qualifications: 'BBS, Dip Val, ANZIV, SPINZ' },
  authorisedBy: null,
  inspections: [
    {
      inspectedAt: '2026-09-15T10:30:00.000Z',
      construction: 'Reinforced concrete tilt panel with steel portal frame',
      roof: 'Profiled steel',
      condition: 'Good, consistent with age and use',
      services: 'All urban services connected',
      carparking: '14 sealed spaces on site',
      nbsRating: '67% NBS (IL2)',
      measuredFloorArea: '1860.00',
      accommodation: [
        { label: 'Unit A warehouse', areaSqm: '1120.00' },
        { label: 'Unit B warehouse', areaSqm: '740.00' },
      ],
      inspectedBy: { name: 'A N Other', role: 'registered_valuer' },
    },
  ],
  comparables: [
    {
      commentary: "DEMO DATA — NOT REAL EVIDENCE. Superior location, inferior building services.",
      sale: {
        address: '42 Prebensen Drive',
        suburb: 'Onekawa',
        town: 'Napier',
        evidenceCategory: 'Commercial',
        propertyType: 'industrial',
        saleDate: '2026-05-20',
        salePrice: '3950000.00',
        landArea: '2860.00',
        floorArea: '1720.00',
        passingYield: '6.400',
        yearBuilt: 2005,
        purchaser: 'Private investor',
        notes: null,
      },
      rental: null,
    },
    {
      commentary: "DEMO DATA — NOT REAL EVIDENCE. Directly comparable tenancy size and covenant.",
      sale: null,
      rental: {
        address: '9 Austin Street',
        suburb: 'Onekawa',
        town: 'Napier',
        evidenceCategory: 'Industrial',
        propertyType: 'industrial',
        kind: 'new_letting',
        commencementDate: '2026-03-01',
        tenant: 'Regional Freight Limited',
        lettableArea: '980.00',
        annualRent: '142100.00',
        netOrGross: 'Net',
        termYears: '6.00',
        rightsOfRenewal: '2 x 3 years',
        reviewPattern: 'CPI annually',
        notes: null,
      },
    },
  ],
};

const stored: StoredReportData = {
  values: {
    'Valuations.SiteDescriptionTopography': 'Generally level, rectangular site with dual street frontage.',
    'Valuations.Location': 'Established industrial precinct within the Ahuriri fringe.',
    'Valuations.Strengths': 'Modern tilt-panel construction; two established tenants.',
    'Valuations.Weaknesses': 'Limited on-site yard depth.',
    // Deliberately also supplied as typed data, to prove typed data wins.
    'Valuations.Address': 'SHOULD NOT APPEAR',
  },
  switches: {
    'Valuations.LandValueAssessment': 'Yes',
    'Valuations.UseAuthorisingSignature': 'Yes',
  },
  rows: {
    so_FloorAreaEntry: [
      { FloorName: 'Ground floor warehouse', FloorAreaSize: '1,680' },
      { FloorName: 'First floor office', FloorAreaSize: '180' },
    ],
  },
};

const textOf = (xml: string) =>
  (xml.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join(' ');

async function main() {
  let failures = 0;
  const check = (label: string, ok: boolean, detail = '') => {
    console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures += 1;
  };

  const input = buildFillInput(job, stored);
  const template = readFileSync(TEMPLATE_FILES[job.reportTemplate]);
  const { docx, report } = await fillTemplate(template, input);
  writeFileSync('/tmp/job-report.docx', docx);

  const zip = await JSZip.loadAsync(docx);
  let body = '';
  for (const n of Object.keys(zip.files).filter((n) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(n))) {
    body += textOf(await zip.file(n)!.async('string'));
  }
  const has = (s: string) => body.includes(s);

  console.log(`\n=== ${job.jobNo}, ${job.reportType} from the ${job.reportTemplate} template ===`);
  console.log(
    `  filled ${report.fieldsFilled} fields, ${report.regionsExpanded.length} regions, ` +
      `kept ${report.blocksKept.length} / dropped ${report.blocksDropped.length} blocks`,
  );
  console.log(`  wrote /tmp/job-report.docx (${(docx.length / 1024).toFixed(0)} KB)`);

  console.log('\n  the job\'s own data');
  check('job number', has('MV26-0412'));
  check('property address', has('17 Bridge Street'));
  check('territorial authority', has('Napier'));
  check('site area, formatted', has('3,040'));
  check('zoning', has('General Industrial'));
  check('record of title', has('HB12A/884'));
  check('legal description', has('Lot 2 DP 14872'));
  check('rating capital value as money', has('$3,500,000'));
  check('effective date in words', has('15 September 2026'));
  check('contract yield as a percentage', has('6.85%'));
  check('valuer name and qualifications', has('A N Other') && has('ANZIV'));
  check('client organisation', has('Example Bank Limited'));

  console.log('\n  typed data wins over a stored value of the same name');
  check('the stored override did not reach the report', !has('SHOULD NOT APPEAR'));

  console.log('\n  the narrative the valuer wrote');
  check('site description', has('dual street frontage'));
  check('location', has('Ahuriri fringe'));
  check('SWOT strengths', has('Modern tilt-panel construction'));

  console.log('\n  the schedules');
  check('tenancy schedule, first tenant', has('Coastal Engineering Limited'));
  check('tenancy schedule, second tenant', has('Bay Distribution Co'));
  check('lettable areas, from the inspection', has('Unit A warehouse') && has('Unit B warehouse'));
  check('floor areas entered by hand', has('Ground floor warehouse') && has('First floor office'));
  check('sales evidence', has('42 Prebensen Drive') && has('$3,950,000'));
  check('rental evidence', has('9 Austin Street') && has('Regional Freight Limited'));
  check('evidence stays marked as demonstration data', has('DEMO DATA'));

  console.log('\n  the report type decides the sections');
  check(
    'a market value report drops the insurance sections',
    report.blocksDropped.some((e) => e.includes('neq_Insurance')),
  );
  check(
    'a market value report keeps the market value sections',
    !report.blocksDropped.some((e) => e === 'Valuations.ComReport_eq_Insurance'),
  );

  // The commercial template states its value conclusion as literal text —
  // '??? Thousand Dollars ($,000)' — not as a merge field, so the fill cannot
  // reach it. The report has to say so rather than let it slip out.
  console.log('\n  placeholders the template leaves for hand typing');
  check(
    'the value conclusion placeholder is reported',
    report.placeholders.some((p) => p.includes('Thousand Dollars')),
    `${report.placeholders.length} found`,
  );
  for (const p of report.placeholders.slice(0, 4)) console.log(`        ${p}`);

  console.log('\n  nothing left unresolved');
  check('no merge field survives', !body.includes('MERGEFIELD'));
  check('no token survives', !/[]/.test(body));
  check('no marker left without its pair', report.markersOrphaned.length === 0,
    report.markersOrphaned.join(', '));

  const missing = report.fieldsMissing.filter((f) => !f.startsWith('Image:'));
  console.log(`\n  ${missing.length} fields have no value yet (the valuer still has to write them)`);
  console.log(`  first few: ${missing.slice(0, 6).join(', ')}`);

  // The residential template does carry the value conclusion as merge fields,
  // so the same job data has to reach them there.
  console.log('\n=== the same conclusions through the residential template ===');
  const resiJob: ReportJob = {
    ...job,
    jobNo: 'MV26-0413',
    reportTemplate: 'residential',
    property: { ...job.property, propertyType: 'residential', tenancies: [] },
  };
  const resi = await fillTemplate(
    readFileSync(TEMPLATE_FILES.residential),
    buildFillInput(resiJob, { values: {}, switches: {}, rows: {} }),
  );
  const resiZip = await JSZip.loadAsync(resi.docx);
  let resiBody = '';
  for (const n of Object.keys(resiZip.files).filter((n) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(n))) {
    resiBody += textOf(await resiZip.file(n)!.async('string'));
  }
  check('market value as money', resiBody.includes('$4,250,000'));
  check(
    'market value in words',
    resiBody.includes('Four Million Two Hundred and Fifty Thousand Dollars'),
    dollarsInWords(job.adoptedValue),
  );
  check('land value apportionment', resiBody.includes('$1,450,000'));
  check('improvements apportionment', resiBody.includes('$2,800,000'));
  check('sum insured', resiBody.includes('$3,900,000'));

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
