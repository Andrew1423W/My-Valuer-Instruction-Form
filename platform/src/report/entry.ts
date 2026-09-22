/**
 * Turns the field dictionary into the form a valuer fills in.
 *
 * Neither template is a form: between them they name 256 fields, most of which
 * a given report never prints, because the conditional blocks delete whole
 * sections. Asking for all of them would be worse than the Word document it
 * replaces. So the form asks for what this report will actually contain,
 * grouped under the template's own section headings and in the order the
 * report reads.
 */
import { shouldDeleteBlock, type FieldValues } from './docx-template';
import { templateSpec, type TemplateSpec } from './job-fields';
import type { ReportTemplate } from '@/db/schema';

export type EntryField = {
  name: string;
  /** A readable label: `Valuations.SiteDescriptionTopography` -> 'Site description topography'. */
  label: string;
  /** Long narrative gets a textarea; a figure or a name gets one line. */
  long: boolean;
};

export type EntrySection = {
  title: string;
  fields: EntryField[];
};

export type EntrySwitch = {
  /** The field the conditions test, e.g. `Valuations.LandValueAssessment`. */
  name: string;
  label: string;
  /** What the answers can be. Yes/No for most; report types are set on the job. */
  options: string[];
  /** What each answer does to the report, in the valuer's words. */
  effect: string;
  section: string | null;
};

/** Fields whose value the practice already holds, so the form must not ask twice. */
const DERIVED = new Set([
  'Valuations.JobNumber', 'Valuations.VOSNo', 'Valuations.ReportTitle',
  'Valuations.TypeOfValuation', 'Valuations.ValuationBasis', 'Valuations.Purpose',
  'Valuations.SpecialInstructions', 'Valuations.Address', 'Valuations.Suburb',
  'Valuations.PropAddressTA', 'Valuations.TerritorialAuthority', 'Valuations.LocalAuthority',
  'Valuations.RegionalCouncil', 'Valuations.PropertyType', 'Valuations.Zone',
  'Valuations.SiteArea', 'Valuations.SiteAreaLable', 'Valuations.NBS',
  'Valuations.BuiltAbout', 'Valuations.BuiltYearLabel', 'Valuations.TitDets1',
  'Valuations.TenureType', 'Valuations.TitDets2', 'Valuations.TitDets3',
  'Valuations.RatingYear', 'Valuations.RatesDate', 'Valuations.RVLandValue',
  'Valuations.RVImprovementsValue', 'Valuations.RVCapitalValue',
  'Valuations.EffectiveDate', 'Valuations.DateofInspection', 'Valuations.EMarketValue',
  'Valuations.MarketValueInWords', 'Valuations.ELandValue', 'Valuations.EMainBuilding',
  'Valuations.RentPA', 'Valuations.YieldContractIncome', 'Valuations.SumInsured',
  'Valuations.ReinstatementEstimate', 'Valuations.OrgLender', 'Valuations.OrgPostalAddress',
  'Valuations.OrgClientContact', 'Valuations.PersonToAddressReportTo',
  'Valuations.ClientFirstName', 'Valuer.ValuerName', 'Valuer.Qualifications',
  'Valuer.Qualifications2', 'Valuer.Notes', 'AuthValuer.ValuerName',
  'AuthValuer.Qualifications', 'AuthValuer.Qualifications2',
]);

/** Regions the practice fills from its own records, not from the form. */
const DERIVED_REGIONS = [
  /^SalesEvidenceType_/, /^LeasesEvidenceType_/, /^TblLeasesEvidence$/,
  /^SubjectLeases$/, /^so_ValuerInvolvement$/, /^Leases_so_/,
];

/** Regions that hold a picture, which the inspection supplies. */
const PHOTO_REGIONS = /^(AerialMap|StreetMap|FrontPagePhotos|PhotoGrid_|SubjectPhoto_)/;

const LONG_FIELD = /(Txt|Comments|Description|Statement|Notes|Conclusion|Strengths|Weaknesses|Opportunities|Threats|Chats|Instruments|Compare|Overview|Issue)$/;

const UNGROUPED = 'Front page, headers and footers';

/**
 * Wording the valuer would recognise, where the field name is a term of art or
 * an abbreviation that reads badly split up.
 */
const FIELD_LABELS: Record<string, string> = {
  'Valuations.NBS': 'Seismic rating (%NBS)',
  'Valuations.WOF': 'Building warrant of fitness',
  'Valuations.WOFStatus': 'Building warrant of fitness status',
  'Valuations.LI': 'LIM report',
  'Valuations.LIAsIf': 'LIM report, as if complete',
  'Valuations.CtoC': 'Certificate of compliance',
  'Valuations.SubjWALT': 'WALT (weighted average lease term)',
  'Valuations.DiscRate': 'Discount rate',
  'Valuations.EnvIssTxt': 'Environmental issues',
  'Valuations.HeritageIssTxt': 'Heritage issues',
  'Valuations.TitleIssTxt': 'Title issues',
  'Valuations.ImpsTxt': 'Improvements',
  'Valuations.LandTxt': 'Land',
  'Valuations.LocNeiTxt': 'Neighbourhood',
  'Valuations.LocEcImpTxt': 'Local economic influences',
  'Valuations.MarkVolTxt': 'Market volatility',
  'Valuations.MarkSegCondTxt': 'Market segment conditions',
  'Valuations.ValTrendTxt': 'Value trends',
  'Valuations.FENZResiStatement': 'Fire and Emergency levy statement',
  'Valuations.IndemnityValueFEL': 'Indemnity value for Fire and Emergency levies',
  'Valuations.IndemnityInflationFEL': 'Indemnity inflation provision for levies',
  'Valuations.gstnumber': 'GST number',
  'Valuations.TBELandValue': 'To be erected: land value',
  'Valuations.TBEMainBuilding': 'To be erected: main building',
  'Valuations.TBEOther': 'To be erected: other improvements',
  'Valuations.TBEMarketValue': 'To be erected: market value',
  'Valuations.TBEMarketValueInWords': 'To be erected: market value in words',
  'Valuations.VRangeLow': 'Value range, low',
  'Valuations.VRangeHigh': 'Value range, high',
  'Valuations.EOther': 'Other improvements value',
  'Valuations.Valb4SA': 'Value before the sale and purchase agreement',
  'Valuations.ValExisting': 'Value of existing improvements',
  'Valuations.DemotionEstimate': 'Demolition estimate',
};

/** `Valuations.SiteDescriptionTopography` -> 'Site description topography'. */
export function fieldLabel(name: string): string {
  const known = FIELD_LABELS[name];
  if (known) return known;
  const bare = name.replace(/^(Valuations|Valuer|AuthValuer)\./, '');
  const prefix = name.startsWith('AuthValuer.')
    ? 'Counter-signing valuer: '
    : name.startsWith('Valuer.')
      ? 'Valuer: '
      : '';
  const spaced = bare
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return prefix + spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** True when the report will contain this field, given the answers so far. */
export function willPrint(conditions: string[], switches: FieldValues): boolean {
  return !conditions.some((expr) => shouldDeleteBlock(expr, switches));
}

/**
 * The form's sections, in report order, holding only what this report prints
 * and only what the valuer has to write.
 */
export function entrySections(template: ReportTemplate, switches: FieldValues): EntrySection[] {
  const spec = templateSpec(template);
  const sections: EntrySection[] = [];
  const index = new Map<string, EntrySection>();

  for (const field of spec.job_fields) {
    if (DERIVED.has(field.name)) continue;
    if (!willPrint(field.conditions ?? [], switches)) continue;
    const title = field.subsection ?? field.section ?? UNGROUPED;
    let section = index.get(title);
    if (!section) {
      section = { title, fields: [] };
      index.set(title, section);
      sections.push(section);
    }
    section.fields.push({
      name: field.name,
      label: fieldLabel(field.name),
      long: LONG_FIELD.test(field.name),
    });
  }

  return sections.filter((s) => s.fields.length > 0);
}

/**
 * The questions that decide what the report contains.
 *
 * Each is stated as what answering it does, because the field names do not say:
 * `LandValueAssessment_eq_No` deletes the land value assessment when the answer
 * is 'No', which reads backwards until it is spelled out.
 */
export function entrySwitches(template: ReportTemplate, reportTypeField: string): EntrySwitch[] {
  const spec = templateSpec(template);
  const byField = new Map<string, EntrySwitch>();

  for (const c of spec.conditions) {
    if (c.field === reportTypeField) continue; // the job decides the report type
    const value = (c.value ?? '').trim();
    const yesNo = /^(yes|no)$/i.test(value);
    if (!yesNo) continue; // a report-type style switch, also set on the job

    const existing = byField.get(c.field);
    const effect =
      c.op === '=='
        ? `Answering '${value}' removes a section.`
        : `Answering anything but '${value}' removes a section.`;
    if (existing) {
      if (!existing.effect.includes(effect)) existing.effect += ` ${effect}`;
      continue;
    }
    byField.set(c.field, {
      name: c.field,
      label: fieldLabel(c.field),
      options: ['Yes', 'No'],
      effect,
      section: c.subsection ?? c.section ?? null,
    });
  }

  return [...byField.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** The repeating schedules the valuer fills by hand for this report. */
export function entryRegions(template: ReportTemplate, switches: FieldValues) {
  return templateSpec(template)
    .regions.filter((r) => r.row_fields.length > 0)
    .filter((r) => !DERIVED_REGIONS.some((re) => re.test(r.name)))
    .filter((r) => !PHOTO_REGIONS.test(r.name))
    .filter((r) => willPrint(r.conditions ?? [], switches))
    .map((r) => ({
      name: r.name,
      label: fieldLabel(r.name.replace(/^(so_|Occupancies_so_)/, '')),
      section: r.subsection ?? r.section ?? UNGROUPED,
      fields: r.row_fields.map((f) => ({ name: f, label: fieldLabel(f) })),
    }));
}

/** How much of the report is written, for the progress the pipeline shows. */
export function entryProgress(
  template: ReportTemplate,
  switches: FieldValues,
  values: Record<string, string | null>,
): { written: number; total: number } {
  const fields = entrySections(template, switches).flatMap((s) => s.fields);
  const written = fields.filter((f) => {
    const v = values[f.name];
    return v !== undefined && v !== null && v !== '';
  }).length;
  return { written, total: fields.length };
}

export type { TemplateSpec };
