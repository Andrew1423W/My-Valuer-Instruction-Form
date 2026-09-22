/**
 * Maps a job onto the names the master templates use.
 *
 * Three sources feed a report, and they are deliberately kept apart:
 *
 *   the typed columns   address, dates, fees, allocation, value conclusions —
 *                       the practice's own data, which the pipeline, the
 *                       dashboard and the invoices all read
 *   report values       the narrative the valuer writes for this report, keyed
 *                       by the template's own field names
 *   report rows         the repeating schedules, plus the tenancies and the
 *                       evidence, which are records in their own right
 *
 * Typed data wins where both have something to say, so a value the practice
 * holds once cannot drift from what the report prints.
 */
import type { FieldValues, FillInput } from './docx-template';
import type { ReportTemplate, ReportType } from '@/db/schema';
import { NZ_TZ, PROPERTY_TYPE_LABELS } from '@/lib/format';
import dictionary from './field-dictionary.json';

/** The templates, read into a spec by `tools/extract-template-spec.py`. */
export type TemplateSpec = {
  template: string;
  job_fields: SpecField[];
  row_fields: { name: string; regions: string[] }[];
  regions: SpecRegion[];
  conditions: SpecCondition[];
  switch_fields: string[];
  images: SpecImage[];
};

/** Where a field sits in the template, and what decides whether it prints. */
type Placed = {
  /** The nearest top-level heading, and the nearest heading of any level. */
  section: string | null;
  subsection: string | null;
  /** Position in the document, so the form can read in report order. */
  order: number;
  /** The conditional blocks enclosing it; any one of them can delete it. */
  conditions: string[];
};

export type SpecField = Placed & { name: string };
export type SpecRegion = Placed & { name: string; row_fields: string[] };
export type SpecCondition = {
  expr: string;
  field: string;
  op: string;
  value: string;
  section: string | null;
  subsection: string | null;
  order: number;
};
export type SpecImage = {
  source: string;
  section: string | null;
  subsection: string | null;
  region: string | null;
  conditions: string[];
  width: string | null;
  height: string | null;
};

export const TEMPLATE_SPECS = dictionary as unknown as Record<ReportTemplate, TemplateSpec>;

export function templateSpec(template: ReportTemplate): TemplateSpec {
  return TEMPLATE_SPECS[template];
}

/* ------------------------------------------------------------ report types */

/**
 * The value each report type writes into the template's own switch.
 *
 * Both templates hold every report type in one document and delete the
 * sections that do not apply. Market value is the type the others are measured
 * against, so the template enumerates no value for it.
 */
export const REPORT_TYPE_SWITCH: Record<ReportType, string> = {
  market_value: 'Market Value',
  market_rental: 'Market Rental',
  ground_rental: 'Ground Rental',
  lessors_interest: 'Lessors Interest',
  current_market_rental: 'CMR',
  insurance: 'Insurance',
};

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  market_value: 'Market value',
  market_rental: 'Market rental',
  ground_rental: 'Ground rental',
  lessors_interest: "Lessor's interest",
  current_market_rental: 'Current market rental',
  insurance: 'Insurance',
};

/** Report types each template can produce. */
export const REPORT_TYPES_BY_TEMPLATE: Record<ReportTemplate, ReportType[]> = {
  commercial: ['market_value', 'market_rental', 'ground_rental', 'lessors_interest', 'insurance'],
  residential: ['market_value', 'current_market_rental', 'insurance'],
};

/** The switch a template tests to decide which report it is producing. */
export function reportTypeSwitchField(template: ReportTemplate): string {
  return template === 'commercial' ? 'Valuations.ComReport' : 'Valuations.ResiReport';
}

export const TEMPLATE_FILES: Record<ReportTemplate, string> = {
  commercial: 'templates/commercial-v65.docx',
  residential: 'templates/residential-v48.docx',
};

/* -------------------------------------------------------------- formatting */

/**
 * Report formatting, which differs from the screen's on one point: a value
 * that is not known leaves a blank, never an em dash. A report says nothing
 * rather than printing a placeholder over the valuer's signature.
 */
const nz = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('en-NZ', opts);

function moneyOf(v: string | number | null | undefined, dp = 0): string {
  const n = Number(v ?? '');
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return '';
  return nz({ style: 'currency', currency: 'NZD', minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
}

function numberOf(v: string | number | null | undefined, dp = 0): string {
  const n = Number(v ?? '');
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return '';
  return nz({ minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
}

function percentOf(v: string | number | null | undefined, dp = 2): string {
  const n = Number(v ?? '');
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return '';
  return `${n.toFixed(dp)}%`;
}

function dateOf(d: string | Date | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d;
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: NZ_TZ });
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function underThousand(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  const rest = n % 100;
  return `${ONES[Math.floor(n / 100)]} Hundred${rest ? ` and ${underThousand(rest)}` : ''}`;
}

/**
 * A money figure written out, as a valuation report states its conclusion:
 * 1250000 -> 'One Million Two Hundred and Fifty Thousand Dollars'.
 */
export function dollarsInWords(v: string | number | null | undefined): string {
  const n = Number(v ?? '');
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return '';
  const whole = Math.floor(Math.abs(n));
  const cents = Math.round((Math.abs(n) - whole) * 100);
  if (whole === 0 && cents === 0) return 'Nil';

  const groups: [number, string][] = [
    [1_000_000_000, 'Billion'],
    [1_000_000, 'Million'],
    [1_000, 'Thousand'],
  ];
  let left = whole;
  const parts: string[] = [];
  for (const [size, label] of groups) {
    const count = Math.floor(left / size);
    if (count > 0) parts.push(`${underThousand(count)} ${label}`);
    left %= size;
  }
  if (left > 0) parts.push(underThousand(left));

  const dollars = parts.length ? `${parts.join(' ')} Dollars` : '';
  const withSign = n < 0 ? `Minus ${dollars}` : dollars;
  return cents ? `${withSign} and ${underThousand(cents)} Cents` : withSign;
}

/* ------------------------------------------------------------- the job data */

/** The shape the fill needs. Matches the relational query in the report route. */
export type ReportJob = {
  jobNo: string;
  reportTemplate: ReportTemplate;
  reportType: ReportType;
  purpose: string | null;
  purposeDetail: string | null;
  basis: string | null;
  borrower: string | null;
  vosOrderNo: string | null;
  effectiveDate: string | null;
  adoptedValue: string | null;
  adoptedLandValue: string | null;
  adoptedImprovements: string | null;
  adoptedRental: string | null;
  adoptedYield: string | null;
  insuranceReplacement: string | null;
  notes: string | null;
  property: {
    address: string;
    suburb: string | null;
    town: string | null;
    region: string | null;
    propertyType: string | null;
    legalDescription: string | null;
    titleNo: string | null;
    estate: string | null;
    landArea: string | null;
    floorArea: string | null;
    zoning: string | null;
    yearBuilt: number | null;
    nbsRating: string | null;
    councilRef: string | null;
    ratingLandValue: string | null;
    ratingImprovements: string | null;
    ratingCapitalValue: string | null;
    ratingEffectiveDate: string | null;
    tenancies?: ReportTenancy[];
  };
  clientOrg?: { name: string; address: string | null } | null;
  client?: { name: string; company: string | null } | null;
  instructor?: { name: string; company: string | null } | null;
  allocatedTo?: ReportValuer | null;
  authorisedBy?: ReportValuer | null;
  inspections?: {
    inspectedAt: Date | string | null;
    construction: string | null;
    roof: string | null;
    condition: string | null;
    services: string | null;
    carparking: string | null;
    nbsRating: string | null;
    measuredFloorArea: string | null;
    accommodation?: { label: string; areaSqm: string; notes?: string }[] | null;
    inspectedBy?: ReportValuer | null;
  }[];
  comparables?: {
    sale?: ReportSale | null;
    rental?: ReportRental | null;
    commentary: string | null;
  }[];
};

type ReportValuer = {
  name: string;
  role?: string | null;
  registrationNo?: string | null;
  qualifications?: string | null;
  qualifications2?: string | null;
};

type ReportTenancy = {
  tenant: string;
  unit: string | null;
  areaSqm: string | null;
  rentPa: string | null;
  outgoingsBasis: string | null;
  marketRentPa: string | null;
  leaseStart: string | null;
  leaseExpiry: string | null;
  renewals: string | null;
  reviewBasis: string | null;
  comments: string | null;
};

type ReportSale = {
  address: string;
  suburb: string | null;
  town: string | null;
  evidenceCategory: string | null;
  propertyType: string | null;
  saleDate: string | null;
  salePrice: string | null;
  landArea: string | null;
  floorArea: string | null;
  passingYield: string | null;
  yearBuilt: number | null;
  purchaser: string | null;
  notes: string | null;
};

type ReportRental = {
  address: string;
  suburb: string | null;
  town: string | null;
  evidenceCategory: string | null;
  propertyType: string | null;
  kind: string;
  commencementDate: string | null;
  tenant: string | null;
  lettableArea: string | null;
  annualRent: string | null;
  netOrGross: string | null;
  termYears: string | null;
  rightsOfRenewal: string | null;
  reviewPattern: string | null;
  notes: string | null;
};

/* ---------------------------------------------------------------- the values */

/** Drops the blanks, so a derived field never overwrites what the valuer wrote. */
function present(values: FieldValues): FieldValues {
  const out: FieldValues = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== null && v !== undefined && String(v) !== '') out[k] = v;
  }
  return out;
}

/** The fields the practice's own data answers, named as the templates name them. */
export function derivedFields(job: ReportJob): FieldValues {
  const p = job.property;
  const inspection = job.inspections?.[0];
  const valuer = job.allocatedTo;
  const authorised = job.authorisedBy;
  const locality = [p.suburb, p.town].filter(Boolean).join(', ');

  return present({
    'Valuations.JobNumber': job.jobNo,
    'Valuations.VOSNo': job.vosOrderNo,
    'Valuations.ReportTitle': `${REPORT_TYPE_LABELS[job.reportType]} Valuation`,
    'Valuations.TypeOfValuation': REPORT_TYPE_LABELS[job.reportType],
    'Valuations.ValuationBasis': job.basis,
    'Valuations.Purpose': job.purpose,
    'Valuations.SpecialInstructions': job.purposeDetail,

    'Valuations.Address': p.address,
    'Valuations.Suburb': p.suburb,
    'Valuations.PropAddressTA': locality,
    'Valuations.TerritorialAuthority': p.town,
    'Valuations.LocalAuthority': p.town,
    'Valuations.RegionalCouncil': p.region,
    'Valuations.PropertyType': p.propertyType ? PROPERTY_TYPE_LABELS[p.propertyType] ?? p.propertyType : '',
    'Valuations.Zone': p.zoning,
    'Valuations.SiteArea': numberOf(p.landArea),
    'Valuations.SiteAreaLable': p.landArea ? 'm²' : '',
    'Valuations.NBS': inspection?.nbsRating ?? p.nbsRating,
    'Valuations.BuiltAbout': p.yearBuilt ? String(p.yearBuilt) : '',
    'Valuations.BuiltYearLabel': p.yearBuilt ? 'Built about' : '',

    // The title block. `TitDets1` is the identifier, then tenure, area,
    // legal description, owner and interests, as `AdditionalTitles` repeats.
    'Valuations.TitDets1': p.titleNo,
    'Valuations.TenureType': p.estate,
    'Valuations.TitDets2': numberOf(p.landArea),
    'Valuations.TitDets3': p.legalDescription,

    'Valuations.RatingYear': p.ratingEffectiveDate ? p.ratingEffectiveDate.slice(0, 4) : '',
    'Valuations.RatesDate': dateOf(p.ratingEffectiveDate),
    'Valuations.RVLandValue': moneyOf(p.ratingLandValue),
    'Valuations.RVImprovementsValue': moneyOf(p.ratingImprovements),
    'Valuations.RVCapitalValue': moneyOf(p.ratingCapitalValue),

    'Valuations.EffectiveDate': dateOf(job.effectiveDate),
    'Valuations.DateofInspection': dateOf(inspection?.inspectedAt ?? null),

    'Valuations.EMarketValue': moneyOf(job.adoptedValue),
    'Valuations.MarketValueInWords': dollarsInWords(job.adoptedValue),
    'Valuations.ELandValue': moneyOf(job.adoptedLandValue),
    'Valuations.EMainBuilding': moneyOf(job.adoptedImprovements),
    'Valuations.RentPA': moneyOf(job.adoptedRental),
    'Valuations.YieldContractIncome': percentOf(job.adoptedYield),
    'Valuations.SumInsured': moneyOf(job.insuranceReplacement),
    'Valuations.ReinstatementEstimate': moneyOf(job.insuranceReplacement),

    'Valuations.OrgLender': job.clientOrg?.name ?? job.client?.company,
    'Valuations.OrgPostalAddress': job.clientOrg?.address,
    'Valuations.OrgClientContact': job.client?.name ?? job.instructor?.name,
    'Valuations.PersonToAddressReportTo': job.client?.name ?? job.instructor?.name,
    'Valuations.ClientFirstName': (job.client?.name ?? job.instructor?.name ?? '').split(' ')[0],

    'Valuer.ValuerName': valuer?.name,
    'Valuer.Qualifications': valuer?.qualifications,
    'Valuer.Qualifications2': valuer?.qualifications2,
    'Valuer.Notes': job.notes,
    'AuthValuer.ValuerName': authorised?.name,
    'AuthValuer.Qualifications': authorised?.qualifications,
    'AuthValuer.Qualifications2': authorised?.qualifications2,

    // Inspection findings, where the valuer has not written their own wording.
    'Valuations.Structure': inspection?.construction,
    'Valuations.RoofCladding': inspection?.roof,
    'Valuations.ExternalCondition': inspection?.condition,
    'Valuations.Services': inspection?.services,
    'Valuations.CarAreas': inspection?.carparking,
    'Valuations.LivingAreas': numberOf(inspection?.measuredFloorArea ?? p.floorArea),
  });
}

/* ----------------------------------------------------------------- the rows */

/** The template's region for an evidence record, from its category. */
function evidenceRegion(prefix: 'Sales' | 'Leases', category: string | null | undefined): string | null {
  if (!category) return null;
  return `${prefix}EvidenceType_${category}`;
}

function push(rows: Record<string, FieldValues[]>, region: string | null, row: FieldValues) {
  if (!region) return;
  (rows[region] ??= []).push(row);
}

/** The repeating schedules the practice's own records answer. */
export function derivedRows(job: ReportJob): Record<string, FieldValues[]> {
  const rows: Record<string, FieldValues[]> = {};
  const p = job.property;

  // The subject property's tenancy schedule.
  for (const t of p.tenancies ?? []) {
    push(rows, 'SubjectLeases', {
      Tenancy: [t.tenant, t.unit].filter(Boolean).join(' — '),
      LeaseStartDate: dateOf(t.leaseStart),
      Expiry: dateOf(t.leaseExpiry),
      RoR: t.renewals,
      ReviewFrequenc: t.reviewBasis,
      Rental: moneyOf(t.rentPa),
      AnnualRent: moneyOf(t.rentPa),
      NetOrGross: t.outgoingsBasis,
      Area: numberOf(t.areaSqm),
      Comments: t.comments,
    });
  }

  // Who did what on this job — the IVS documentation requirement.
  const involvement = new Map<string, FieldValues>();
  for (const v of [job.allocatedTo, job.authorisedBy, job.inspections?.[0]?.inspectedBy]) {
    if (!v) continue;
    const existing = involvement.get(v.name) ?? { Name: v.name, Position: v.role ?? '' };
    involvement.set(v.name, existing);
  }
  if (job.allocatedTo) {
    const row = involvement.get(job.allocatedTo.name)!;
    row.Research = 'Yes';
    row.Calcs = 'Yes';
    row.Report = 'Yes';
  }
  if (job.inspections?.[0]?.inspectedBy) {
    involvement.get(job.inspections[0].inspectedBy!.name)!.Inspection = 'Yes';
  }
  if (job.authorisedBy) involvement.get(job.authorisedBy.name)!.PeerReview = 'Yes';
  for (const row of involvement.values()) push(rows, 'so_ValuerInvolvement', row);

  // The measured areas.
  const floorArea = job.inspections?.[0]?.measuredFloorArea ?? p.floorArea;
  if (floorArea) {
    push(rows, 'so_FloorAreaEntry', { FloorName: 'Total', FloorAreaSize: numberOf(floorArea) });
  }

  // The areas recorded on the inspection become the lettable area schedule.
  for (const line of job.inspections?.[0]?.accommodation ?? []) {
    push(rows, 'so_LettableAreas', { AreaName: line.label, FloorArea: numberOf(line.areaSqm) });
  }

  // The evidence selected for this job, grouped as the template groups it.
  for (const c of job.comparables ?? []) {
    if (c.sale) {
      const s = c.sale;
      push(rows, evidenceRegion('Sales', s.evidenceCategory), {
        Address: s.address,
        PropAddressLocality: [s.suburb, s.town].filter(Boolean).join(', '),
        PropState: s.town,
        Price: moneyOf(s.salePrice),
        SaleDate: dateOf(s.saleDate),
        SiteArea: numberOf(s.landArea),
        LivingAreas: numberOf(s.floorArea),
        Yield: percentOf(s.passingYield),
        BuildingAge: s.yearBuilt ? String(s.yearBuilt) : '',
        Purchaser: s.purchaser,
        Comments: c.commentary ?? s.notes,
      });
    }
    if (c.rental) {
      const r = c.rental;
      const row: FieldValues = {
        Address: r.address,
        PropAddressLocality: [r.suburb, r.town].filter(Boolean).join(', '),
        PropState: r.town,
        Tenancy: r.tenant,
        RentSetAt: dateOf(r.commencementDate),
        TransactionType: r.kind.replace(/_/g, ' '),
        TotalLettableArea: numberOf(r.lettableArea),
        Rent: moneyOf(r.annualRent),
        Rental: moneyOf(r.annualRent),
        AnnualRent: moneyOf(r.annualRent),
        OverallRate:
          r.annualRent && r.lettableArea && Number(r.lettableArea) > 0
            ? moneyOf(Number(r.annualRent) / Number(r.lettableArea), 2)
            : '',
        Comments: c.commentary ?? r.notes,
      };
      push(rows, evidenceRegion('Leases', r.evidenceCategory), row);
      // The rental summary table lists every lease, whatever its category.
      push(rows, 'TblLeasesEvidence', row);
    }
  }

  return rows;
}

/* ------------------------------------------------------------- the fill input */

export type StoredReportData = {
  /** Narrative the valuer wrote, keyed by the template's field name. */
  values: Record<string, string | null>;
  /** The Yes/No answers that decide which sections the report contains. */
  switches: Record<string, string>;
  /** Rows the valuer entered for regions the practice has no records for. */
  rows: Record<string, FieldValues[]>;
};

/**
 * Builds the fill input for a job.
 *
 * The report type is written into the template's own switch here rather than
 * left to the valuer, so the document can never disagree with the job about
 * what kind of report it is.
 */
export function buildFillInput(job: ReportJob, stored: StoredReportData): FillInput {
  const derived = derivedFields(job);
  const derivedRowsForJob = derivedRows(job);

  const fields: FieldValues = { ...stored.values, ...derived };

  // Every switch the template tests needs an answer. An unanswered one is not
  // neutral: a block marked `VPDelStart:X_neq_No` is deleted whenever X is not
  // 'No', so leaving X blank silently drops that section. 'No' is the default,
  // so an unanswered question reads as "no" rather than as a missing section.
  const switches: FieldValues = {};
  for (const field of templateSpec(job.reportTemplate).switch_fields) switches[field] = 'No';
  Object.assign(switches, stored.switches);
  switches[reportTypeSwitchField(job.reportTemplate)] = REPORT_TYPE_SWITCH[job.reportType];

  // Rows the valuer entered win over rows derived from records. The schedules
  // the form does not offer — the evidence, the tenancies, who did what — have
  // no entered rows, so they come from the records either way; the ones it does
  // offer, such as the floor areas, stay the valuer's to state.
  const rows: Record<string, FieldValues[]> = {};
  for (const [region, data] of Object.entries(derivedRowsForJob)) {
    if (data.length > 0) rows[region] = data;
  }
  for (const [region, data] of Object.entries(stored.rows)) {
    if (data.length > 0) rows[region] = data;
  }

  return { fields, rows, switches };
}
