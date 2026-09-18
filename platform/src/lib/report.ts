import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  ShadingType,
} from 'docx';
import { money, shortDate, longDate, area, pct, propertyType, ratePerSqm, yieldPct, titleCase } from './format';
import type {
  Job, Property, Contact, Valuer, Inspection, SalesEvidence, RentalEvidence, JobComparable,
} from '@/db/schema';

const NAVY = '1F3A5F';
const LINE = 'DCE4EE';

export type ReportData = Job & {
  property: Property;
  instructor: Contact | null;
  client: Contact | null;
  allocatedTo: Valuer | null;
  inspections: (Inspection & { inspectedBy: Valuer | null })[];
  comparables: (JobComparable & { sale: SalesEvidence | null; rental: RentalEvidence | null })[];
};

/* ------------------------------------------------------------- building blocks */

const h1 = (text: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 140 },
    children: [new TextRun({ text, bold: true, color: NAVY, size: 28, font: 'Avenir Next' })],
  });

const h2 = (text: string) =>
  new Paragraph({
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color: NAVY, size: 20, font: 'Avenir Next' })],
  });

const p = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
  new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        italics: opts.italics,
        size: opts.size ?? 21,
        font: 'Avenir Next',
      }),
    ],
  });

function cell(text: string, opts: { bold?: boolean; head?: boolean; align?: 'left' | 'right' | 'center'; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.head ? { type: ShadingType.CLEAR, fill: 'EEF4FB' } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [
      new Paragraph({
        alignment:
          opts.align === 'right' ? AlignmentType.RIGHT : opts.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold: opts.bold || opts.head,
            color: opts.head ? NAVY : undefined,
            size: opts.head ? 17 : 19,
            font: 'Avenir Next',
          }),
        ],
      }),
    ],
  });
}

function table(rows: TableRow[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      left: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      right: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: LINE },
    },
    rows,
  });
}

/** Two-column label/value block used for the instruction and property summaries. */
function factTable(facts: [string, string][]) {
  return table(
    facts.map(([k, v]) => new TableRow({ children: [cell(k, { head: true, width: 32 }), cell(v, { width: 68 })] })),
  );
}

/* -------------------------------------------------------------------- report */

export async function buildReport(job: ReportData): Promise<Buffer> {
  const inspection = job.inspections[0] ?? null;
  const sales = job.comparables.filter((c) => c.sale);
  const rentals = job.comparables.filter((c) => c.rental);
  const usesDemoEvidence = job.comparables.some(
    (c) => (c.sale?.source ?? c.rental?.source ?? '').includes('DEMO DATA'),
  );

  const children: (Paragraph | Table)[] = [];

  /* ----------------------------------------------------------- title block */
  children.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: 'MY VALUER LIMITED', bold: true, color: NAVY, size: 26, font: 'Avenir Next' })],
    }),
    new Paragraph({
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: 'Registered Valuers · Hawke’s Bay',
          color: '6B7280',
          size: 18,
          font: 'Avenir Next',
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: `${job.basis ?? 'Market Value'} Assessment`,
          bold: true,
          color: NAVY,
          size: 36,
          font: 'Avenir Next',
        }),
      ],
    }),
    p(job.property.address, { bold: true, size: 26 }),
    p([job.property.suburb, job.property.town, job.property.region].filter(Boolean).join(', '), { size: 22 }),
  );

  if (usesDemoEvidence) {
    children.push(
      p(
        'WARNING: this draft cites seeded demonstration evidence, which is synthetic and must not be relied upon. Replace it with verified evidence before issue.',
        { bold: true, italics: true },
      ),
    );
  }

  /* ---------------------------------------------------------- instruction */
  children.push(h1('Instruction'));
  children.push(
    factTable([
      ['Job number', job.jobNo],
      ['Instructed by', job.instructor ? [job.instructor.name, job.instructor.company].filter(Boolean).join(', ') : '—'],
      ['Client', job.client?.name ?? '—'],
      ['Borrower', job.borrower ?? '—'],
      ['Purpose', job.purpose ?? '—'],
      ['Basis of value', job.basis ?? '—'],
      ['Date of instruction', shortDate(job.instructionDate)],
      ['Date of inspection', inspection?.inspectedAt ? longDate(inspection.inspectedAt) : shortDate(job.inspectionAt)],
      ['Effective date of valuation', job.effectiveDate ? longDate(job.effectiveDate) : '—'],
      ['Valuer', job.allocatedTo ? `${job.allocatedTo.name}${job.allocatedTo.registrationNo ? ` (${job.allocatedTo.registrationNo})` : ''}` : '—'],
    ]),
  );
  if (job.purposeDetail) children.push(p(job.purposeDetail));

  /* ------------------------------------------------------------- property */
  children.push(h1('The property'));
  children.push(
    factTable([
      ['Address', job.property.address],
      ['Legal description', job.property.legalDescription ?? '—'],
      ['Record of title', job.property.titleNo ?? '—'],
      ['Estate', job.property.estate ?? 'Fee Simple'],
      ['Land area', area(job.property.landArea)],
      ['Floor area', area(inspection?.measuredFloorArea ?? job.property.floorArea)],
      ['Zoning', job.property.zoning ?? '—'],
      ['Year built', job.property.yearBuilt ? String(job.property.yearBuilt) : '—'],
      ['Seismic capacity', inspection?.nbsRating ?? job.property.nbsRating ?? '—'],
      ['Seismic source', inspection?.nbsSource ?? '—'],
      [
        'Rating valuation',
        job.property.ratingCapitalValue
          ? `${money(job.property.ratingCapitalValue)} capital value (land ${money(job.property.ratingLandValue)}), effective ${shortDate(job.property.ratingEffectiveDate)}`
          : '—',
      ],
      [
        'Rates',
        job.property.councilRates
          ? `${money(job.property.councilRates)} territorial${job.property.regionalRates ? ` plus ${money(job.property.regionalRates)} regional` : ''}`
          : '—',
      ],
    ]),
  );

  /* ----------------------------------------------------------- inspection */
  if (inspection) {
    children.push(h1('Property description'));
    const facts: [string, string][] = [
      ['Construction', inspection.construction ?? '—'],
      ['Roof', inspection.roof ?? '—'],
      ['Services', inspection.services ?? '—'],
      ['Carparking', inspection.carparking ?? '—'],
      ['Condition', inspection.condition ?? '—'],
      ['Deferred maintenance', inspection.deferredMaintenance ?? '—'],
    ];
    children.push(factTable(facts));

    if (inspection.accommodation?.length) {
      children.push(h2('Accommodation'));
      const total = inspection.accommodation.reduce((t, a) => t + (Number(a.areaSqm) || 0), 0);
      children.push(
        table([
          new TableRow({
            children: [cell('Area', { head: true, width: 40 }), cell('m²', { head: true, align: 'right', width: 20 }), cell('Notes', { head: true, width: 40 })],
          }),
          ...inspection.accommodation.map(
            (a) =>
              new TableRow({
                children: [cell(a.label), cell(a.areaSqm, { align: 'right' }), cell(a.notes ?? '')],
              }),
          ),
          new TableRow({
            children: [cell('Total', { bold: true }), cell(total.toFixed(0), { bold: true, align: 'right' }), cell('')],
          }),
        ]),
      );
    }

    if (inspection.notes) {
      children.push(h2('Inspection notes'));
      children.push(p(inspection.notes));
    }
  }

  /* ---------------------------------------------------- comparable sales */
  if (sales.length) {
    children.push(h1('Comparable transactions'));
    children.push(
      p(
        'The sales set out below were analysed and each is rated against the subject property overall. Commentary on each transaction follows the summary table.',
      ),
    );
    children.push(
      table([
        new TableRow({
          children: [
            cell('#', { head: true, width: 5 }),
            cell('Address', { head: true, width: 26 }),
            cell('Date', { head: true, width: 11 }),
            cell('Price', { head: true, align: 'right', width: 14 }),
            cell('Floor', { head: true, align: 'right', width: 10 }),
            cell('$/m²', { head: true, align: 'right', width: 12 }),
            cell('Yield', { head: true, align: 'right', width: 10 }),
            cell('Rating', { head: true, width: 12 }),
          ],
        }),
        ...sales.map((c, i) => {
          const s = c.sale!;
          return new TableRow({
            children: [
              cell(String(i + 1)),
              cell(`${s.address}${s.town ? `, ${s.town}` : ''}`),
              cell(shortDate(s.saleDate)),
              cell(money(s.salePrice), { align: 'right' }),
              cell(s.floorArea ? Number(s.floorArea).toFixed(0) : '—', { align: 'right' }),
              cell(ratePerSqm(s.salePrice, s.floorArea).replace('/m²', ''), { align: 'right' }),
              cell(yieldPct(s.netIncome, s.salePrice), { align: 'right' }),
              cell(c.rating ? titleCase(c.rating) : '—', { bold: true }),
            ],
          });
        }),
      ]),
    );

    children.push(h2('Commentary'));
    sales.forEach((c, i) => {
      const s = c.sale!;
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [
            new TextRun({ text: `${i + 1}. ${s.address}${s.town ? `, ${s.town}` : ''}`, bold: true, size: 21, font: 'Avenir Next' }),
            new TextRun({
              text: `  —  ${shortDate(s.saleDate)}, ${money(s.salePrice)}${s.floorArea ? `, ${ratePerSqm(s.salePrice, s.floorArea)}` : ''}${c.rating ? `  ·  ${titleCase(c.rating)}` : ''}`,
              size: 19,
              color: '6B7280',
              font: 'Avenir Next',
            }),
          ],
        }),
      );
      children.push(
        p(
          c.commentary ??
            '[Commentary required — compare location, age, condition, seismic capacity, tenure and configuration, then state the overall rating.]',
          { italics: !c.commentary },
        ),
      );
    });

    // Rating tally, which is what a reviewer scans first.
    const tally = ['inferior', 'comparable', 'superior'].map(
      (r) => `${sales.filter((c) => c.rating === r).length} ${r}`,
    );
    children.push(p(`Rating summary: ${tally.join(', ')}.`, { bold: true }));
  }

  /* --------------------------------------------------- rental evidence */
  if (rentals.length) {
    children.push(h1('Rental evidence'));
    children.push(
      table([
        new TableRow({
          children: [
            cell('#', { head: true, width: 5 }),
            cell('Address', { head: true, width: 28 }),
            cell('Basis', { head: true, width: 13 }),
            cell('Commenced', { head: true, width: 12 }),
            cell('Area', { head: true, align: 'right', width: 10 }),
            cell('Rent pa', { head: true, align: 'right', width: 14 }),
            cell('$/m²', { head: true, align: 'right', width: 10 }),
            cell('Rating', { head: true, width: 8 }),
          ],
        }),
        ...rentals.map((c, i) => {
          const r = c.rental!;
          return new TableRow({
            children: [
              cell(String(i + 1)),
              cell(`${r.address}${r.town ? `, ${r.town}` : ''}`),
              cell(titleCase(r.kind)),
              cell(shortDate(r.commencementDate)),
              cell(r.lettableArea ? Number(r.lettableArea).toFixed(0) : '—', { align: 'right' }),
              cell(`${money(r.annualRent)} ${r.netOrGross ?? ''}`.trim(), { align: 'right' }),
              cell(ratePerSqm(r.annualRent, r.lettableArea).replace('/m²', ''), { align: 'right' }),
              cell(c.rating ? titleCase(c.rating) : '—', { bold: true }),
            ],
          });
        }),
      ]),
    );
    rentals.forEach((c, i) => {
      if (!c.commentary) return;
      children.push(p(`${i + 1}. ${c.rental!.address} — ${c.commentary}`));
    });
  }

  /* ------------------------------------------------------------ valuation */
  children.push(h1('Valuation'));
  const conclusions: [string, string][] = [];
  if (job.adoptedValue) conclusions.push(['Market value', money(job.adoptedValue)]);
  if (job.adoptedLandValue) conclusions.push(['Land value', money(job.adoptedLandValue)]);
  if (job.adoptedImprovements) conclusions.push(['Improvements', money(job.adoptedImprovements)]);
  if (job.adoptedRental) conclusions.push(['Market rental', `${money(job.adoptedRental)} per annum net`]);
  if (job.adoptedYield) conclusions.push(['Adopted yield', pct(job.adoptedYield)]);
  if (job.adoptedRate) conclusions.push(['Adopted rate', `${money(job.adoptedRate)} per m²`]);
  if (job.insuranceReplacement) conclusions.push(['Insurance replacement', money(job.insuranceReplacement)]);
  if (job.effectiveDate) conclusions.push(['Effective date', longDate(job.effectiveDate)]);

  if (conclusions.length) {
    children.push(factTable(conclusions));
  } else {
    children.push(p('[Valuation conclusions have not yet been entered against this job.]', { italics: true }));
  }

  children.push(
    new Paragraph({
      spacing: { before: 400 },
      children: [
        new TextRun({
          text: `Draft assembled from the My Valuer platform on ${longDate(new Date())} — job ${job.jobNo}. Subject to the valuer's review, the report's standard assumptions and limiting conditions, and IVS / PINZ requirements before issue.`,
          italics: true,
          size: 17,
          color: '6B7280',
          font: 'Avenir Next',
        }),
      ],
    }),
  );

  const doc = new Document({
    creator: 'My Valuer Limited',
    title: `${job.jobNo} — ${job.property.address}`,
    description: `${job.basis ?? 'Valuation'} assessment prepared by My Valuer Limited`,
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
