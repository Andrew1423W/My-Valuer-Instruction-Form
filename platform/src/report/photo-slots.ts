/**
 * The picture slots a valuer can put an inspection photograph into.
 *
 * The slots come from the master templates, read into the field dictionary, so
 * this file says which of them a photograph is assigned to by hand and what to
 * call them on screen — not which slots exist. A new template version changes
 * the dictionary; it does not change this list unless the firm adds a slot of a
 * kind nobody has named yet, and an unnamed slot still appears, under its own
 * template name, rather than disappearing silently.
 */
import dictionary from './field-dictionary.json';
import type { ReportTemplate } from '@/db/schema';

/** The region that lays out the back-page grid, two photographs to a row. */
export const PHOTO_GRID_REGION = 'PhotoGrid_BackPagePhotos';

/**
 * Sources that name a photograph of the subject property.
 *
 * `SalesCaptureID` and `LeaseCaptureID` also name pictures, but those are
 * thumbnails of comparable sales and lettings, which belong to the evidence
 * record rather than to this job's inspection, so they are not offered here.
 */
const SUBJECT_SOURCES = new Set(['PhotoID', 'PhotoID1', 'PhotoID2']);

/** What to call each slot on screen; falls back to the template's own name. */
const LABELS: Record<string, string> = {
  FrontPagePhotos: 'Front page',
  SubjectPhoto_Front: 'Front elevation',
  SubjectPhoto_Rear: 'Rear elevation',
  SubjectPhoto_Plans: 'Plans',
  SubjectPhoto_Elevation: 'Elevation drawing',
  SubjectPhoto_Kitchen: 'Kitchen',
  SubjectPhoto_Bathroom: 'Bathroom',
  AerialMap: 'Aerial photograph',
  StreetMap: 'Street map',
};

export type PhotoSlot = {
  /** The template's region name, stored on the photograph. */
  name: string;
  label: string;
  /** Where it appears in the report, for grouping on screen. */
  section: string | null;
  /** True for the back-page grid, which takes as many photographs as there are. */
  grid: boolean;
  /**
   * The merge-field names this region's picture slots read, e.g. `PhotoID`.
   *
   * Most single slots read `PhotoID`, but the Home Overview kitchen and
   * bathroom read `PhotoID1`, so the name has to come from the template rather
   * than be assumed — a photograph written under the wrong name reaches no slot.
   */
  sources: string[];
  /** Slot width in points, as the template sets it. */
  width: number | null;
  height: number | null;
};

type ImageSlot = {
  source: string;
  region: string;
  section: string | null;
  width: string | null;
  height: string | null;
};

type Dict = Record<string, { images: ImageSlot[] }>;

/**
 * The slots in a template that take an inspection photograph, in report order.
 *
 * A region holding several sources — the back-page grid names `PhotoID1` and
 * `PhotoID2` for its two columns — is one slot here, because the valuer fills it
 * with a set of photographs rather than one.
 */
export function photoSlots(template: ReportTemplate): PhotoSlot[] {
  const images = (dictionary as unknown as Dict)[template]?.images ?? [];
  const seen = new Map<string, PhotoSlot>();
  for (const image of images) {
    if (!SUBJECT_SOURCES.has(image.source)) continue;
    const already = seen.get(image.region);
    if (already) {
      if (!already.sources.includes(image.source)) already.sources.push(image.source);
      continue;
    }
    seen.set(image.region, {
      name: image.region,
      label: LABELS[image.region] ?? image.region.replace(/_/g, ' '),
      section: image.section,
      grid: image.region === PHOTO_GRID_REGION,
      sources: [image.source],
      width: image.width ? Number(image.width) : null,
      height: image.height ? Number(image.height) : null,
    });
  }
  return [...seen.values()];
}

/** The single-photograph slots, i.e. everything but the grid. */
export function singlePhotoSlots(template: ReportTemplate): PhotoSlot[] {
  return photoSlots(template).filter((s) => !s.grid);
}

/** Does this template have a slot by that name? Guards what the form accepts. */
export function isPhotoSlot(template: ReportTemplate, name: string): boolean {
  return photoSlots(template).some((s) => s.name === name);
}
