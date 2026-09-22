import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/* ------------------------------------------------------------------ enums */

export const jobStatusEnum = pgEnum('job_status', [
  'quote',
  'instructed',
  'inspection_booked',
  'inspected',
  'drafting',
  'qa_review',
  'issued',
  'on_hold',
  'cancelled',
]);

export const contactTypeEnum = pgEnum('contact_type', [
  'instructor',
  'client',
  'tenant',
  'agent',
  'solicitor',
  'other',
]);

export const propertyTypeEnum = pgEnum('property_type', [
  'office',
  'retail',
  'industrial',
  'showroom_large_format',
  'trade_retail',
  'mixed_use',
  'residential',
  'lifestyle',
  'rural',
  'development_land',
  'special_purpose',
]);

export const ratingEnum = pgEnum('comparable_rating', [
  'inferior',
  'comparable',
  'superior',
]);

export const rentalKindEnum = pgEnum('rental_kind', [
  'new_letting',
  'rent_review',
  'renewal',
  'sublease',
]);

export const tenureEnum = pgEnum('sale_tenure', [
  'vacant_possession',
  'investment',
  'part_occupied',
  'development_site',
]);

export const roleEnum = pgEnum('valuer_role', ['registered_valuer', 'graduate', 'admin', 'director']);

export const clientKindEnum = pgEnum('client_kind', [
  'bank',
  'non_bank_lender',
  'law_firm',
  'accountant',
  'corporate',
  'government',
  'council',
  'trust',
  'private',
  'other',
]);

/** Which master template a job's report is built from. */
export const reportTemplateEnum = pgEnum('report_template', ['commercial', 'residential']);

/**
 * The kind of report, which decides what the document contains.
 *
 * Each master template holds every kind in one file and deletes the sections
 * that do not apply, keyed on `Valuations.ComReport` / `Valuations.ResiReport`.
 * Market value is the default the others are measured against, so the template
 * names no value for it.
 */
export const reportTypeEnum = pgEnum('report_type', [
  'market_value',
  'market_rental',
  'ground_rental',
  'lessors_interest',
  'current_market_rental',
  'insurance',
]);

/* ------------------------------------------------------------------ people */

export const valuers = pgTable(
  'valuers',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    initials: text('initials').notNull(),
    role: roleEnum('role').notNull().default('registered_valuer'),
    registrationNo: text('registration_no'),
    /** As it prints under the signature, e.g. 'BBS, Dip Val, ANZIV, SPINZ'. */
    qualifications: text('qualifications'),
    /** A second line, where the templates ask for one. */
    qualifications2: text('qualifications2'),
    phone: text('phone'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ emailIdx: uniqueIndex('valuers_email_idx').on(t.email) }),
);

/**
 * The organisation that instructs us — the bank, law firm or company whose
 * name goes on the report. `contacts` stays the people; a client has many.
 */
export const clients = pgTable(
  'clients',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    kind: clientKindEnum('kind').notNull().default('other'),
    /** Branch or team, where one client instructs from several.  */
    division: text('division'),
    address: text('address'),
    phone: text('phone'),
    accountsEmail: text('accounts_email'),
    /** Where reports are sent when the instruction does not say otherwise. */
    reportsEmail: text('reports_email'),
    /** Standing terms: panel agreements, fee scales, turnaround expectations. */
    terms: text('terms'),
    defaultFee: numeric('default_fee', { precision: 10, scale: 2 }),
    /** Days from instruction to delivery this client expects. */
    defaultTurnaroundDays: integer('default_turnaround_days'),
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameIdx: index('clients_name_idx').on(t.name),
    activeIdx: index('clients_active_idx').on(t.active),
  }),
);

export const contacts = pgTable(
  'contacts',
  {
    id: serial('id').primaryKey(),
    type: contactTypeEnum('type').notNull().default('client'),
    name: text('name').notNull(),
    company: text('company'),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    notes: text('notes'),
    /** The organisation this person instructs on behalf of, where there is one. */
    clientId: integer('client_id').references(() => clients.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameIdx: index('contacts_name_idx').on(t.name),
    phoneIdx: index('contacts_phone_idx').on(t.phone),
    clientIdx: index('contacts_client_idx').on(t.clientId),
  }),
);

/* -------------------------------------------------------------- properties */

export const properties = pgTable(
  'properties',
  {
    id: serial('id').primaryKey(),
    address: text('address').notNull(),
    suburb: text('suburb'),
    town: text('town'),
    region: text('region').default("Hawke's Bay"),
    propertyType: propertyTypeEnum('property_type'),
    legalDescription: text('legal_description'),
    titleNo: text('title_no'),
    estate: text('estate').default('Fee Simple'),
    landArea: numeric('land_area', { precision: 12, scale: 2 }),
    floorArea: numeric('floor_area', { precision: 12, scale: 2 }),
    zoning: text('zoning'),
    yearBuilt: integer('year_built'),
    nbsRating: text('nbs_rating'),
    councilRef: text('council_ref'),
    councilRates: numeric('council_rates', { precision: 12, scale: 2 }),
    regionalRates: numeric('regional_rates', { precision: 12, scale: 2 }),
    ratingLandValue: numeric('rating_land_value', { precision: 14, scale: 2 }),
    ratingImprovements: numeric('rating_improvements', { precision: 14, scale: 2 }),
    ratingCapitalValue: numeric('rating_capital_value', { precision: 14, scale: 2 }),
    ratingEffectiveDate: date('rating_effective_date'),
    lat: numeric('lat', { precision: 10, scale: 7 }),
    lng: numeric('lng', { precision: 10, scale: 7 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ addressIdx: index('properties_address_idx').on(t.address) }),
);

/* -------------------------------------------------------------------- jobs */

export const jobs = pgTable(
  'jobs',
  {
    id: serial('id').primaryKey(),
    jobNo: text('job_no').notNull(),
    status: jobStatusEnum('status').notNull().default('instructed'),
    propertyId: integer('property_id').references(() => properties.id, { onDelete: 'restrict' }).notNull(),
    /** The organisation the report is addressed to. */
    clientOrgId: integer('client_org_id').references(() => clients.id, { onDelete: 'set null' }),
    /** The people: who instructed us, and who the report is for. */
    instructorId: integer('instructor_id').references(() => contacts.id, { onDelete: 'set null' }),
    clientId: integer('client_id').references(() => contacts.id, { onDelete: 'set null' }),
    borrower: text('borrower'),

    purpose: text('purpose'),
    purposeDetail: text('purpose_detail'),
    basis: text('basis').default('Market Value'),

    /** Which master template the report is built from, and which kind it is. */
    reportTemplate: reportTemplateEnum('report_template').notNull().default('commercial'),
    reportType: reportTypeEnum('report_type').notNull().default('market_value'),
    isQuote: boolean('is_quote').notNull().default(false),
    vosOrderNo: text('vos_order_no'),
    poNumber: text('po_number'),

    allocatedToId: integer('allocated_to_id').references(() => valuers.id, { onDelete: 'set null' }),
    takenById: integer('taken_by_id').references(() => valuers.id, { onDelete: 'set null' }),
    /**
     * The registered valuer who counter-signs, where the report carries two
     * signatures. The templates print them as `AuthValuer.*` and switch the
     * signature block on `Valuations.UseAuthorisingSignature`.
     */
    authorisedById: integer('authorised_by_id').references(() => valuers.id, { onDelete: 'set null' }),

    instructionDate: date('instruction_date'),
    dueDate: date('due_date'),
    inspectionAt: timestamp('inspection_at', { withTimezone: true }),
    issuedDate: date('issued_date'),

    appointmentName: text('appointment_name'),
    appointmentPhone: text('appointment_phone'),

    feeMarket: numeric('fee_market', { precision: 10, scale: 2 }),
    feeInsurance: numeric('fee_insurance', { precision: 10, scale: 2 }),
    feeMileage: numeric('fee_mileage', { precision: 10, scale: 2 }),

    // conclusions
    effectiveDate: date('effective_date'),
    adoptedValue: numeric('adopted_value', { precision: 14, scale: 2 }),
    adoptedLandValue: numeric('adopted_land_value', { precision: 14, scale: 2 }),
    adoptedImprovements: numeric('adopted_improvements', { precision: 14, scale: 2 }),
    adoptedRental: numeric('adopted_rental', { precision: 12, scale: 2 }),
    adoptedYield: numeric('adopted_yield', { precision: 6, scale: 3 }),
    adoptedRate: numeric('adopted_rate', { precision: 12, scale: 2 }),
    insuranceReplacement: numeric('insurance_replacement', { precision: 14, scale: 2 }),

    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    jobNoIdx: uniqueIndex('jobs_job_no_idx').on(t.jobNo),
    statusIdx: index('jobs_status_idx').on(t.status),
    dueIdx: index('jobs_due_date_idx').on(t.dueDate),
    clientOrgIdx: index('jobs_client_org_idx').on(t.clientOrgId),
  }),
);

export const jobEvents = pgTable(
  'job_events',
  {
    id: serial('id').primaryKey(),
    jobId: integer('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
    valuerId: integer('valuer_id').references(() => valuers.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(), // status_change | note | file | email
    fromStatus: jobStatusEnum('from_status'),
    toStatus: jobStatusEnum('to_status'),
    detail: text('detail'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ jobIdx: index('job_events_job_idx').on(t.jobId) }),
);

/* ------------------------------------------------------------- inspections */

export const inspections = pgTable(
  'inspections',
  {
    id: serial('id').primaryKey(),
    jobId: integer('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
    inspectedById: integer('inspected_by_id').references(() => valuers.id, { onDelete: 'set null' }),
    inspectedAt: timestamp('inspected_at', { withTimezone: true }),
    presentAt: text('present_at'),
    weather: text('weather'),
    construction: text('construction'),
    roof: text('roof'),
    condition: text('condition'),
    services: text('services'),
    carparking: text('carparking'),
    nbsRating: text('nbs_rating'),
    nbsSource: text('nbs_source'),
    deferredMaintenance: text('deferred_maintenance'),
    accommodation: jsonb('accommodation').$type<AccommodationLine[]>().default([]),
    measuredFloorArea: numeric('measured_floor_area', { precision: 12, scale: 2 }),
    notes: text('notes'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ jobIdx: index('inspections_job_idx').on(t.jobId) }),
);

export type AccommodationLine = {
  label: string;
  areaSqm: string;
  notes?: string;
};

export const inspectionPhotos = pgTable(
  'inspection_photos',
  {
    id: serial('id').primaryKey(),
    inspectionId: integer('inspection_id').references(() => inspections.id, { onDelete: 'cascade' }).notNull(),
    filename: text('filename').notNull(),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ inspIdx: index('inspection_photos_insp_idx').on(t.inspectionId) }),
);

/* ---------------------------------------------------------------- evidence */

export const salesEvidence = pgTable(
  'sales_evidence',
  {
    id: serial('id').primaryKey(),
    address: text('address').notNull(),
    suburb: text('suburb'),
    town: text('town'),
    region: text('region').default("Hawke's Bay"),
    propertyType: propertyTypeEnum('property_type'),
    /**
     * The evidence category the master template groups this sale under, named
     * as the template names it (`Commercial`, `Land`, `Childcare`,
     * `Lessors-Interest`, `Residential`, `Lifestyle`, …). A category has its
     * own analysis columns in the report, which is why it is finer grained
     * than `propertyType`; `src/report/field-dictionary.json` lists them as
     * `SalesEvidenceType_<category>` regions.
     */
    evidenceCategory: text('evidence_category'),
    saleDate: date('sale_date'),
    salePrice: numeric('sale_price', { precision: 14, scale: 2 }),
    tenure: tenureEnum('tenure'),
    armsLength: boolean('arms_length').notNull().default(true),
    landArea: numeric('land_area', { precision: 12, scale: 2 }),
    floorArea: numeric('floor_area', { precision: 12, scale: 2 }),
    netIncome: numeric('net_income', { precision: 12, scale: 2 }),
    passingYield: numeric('passing_yield', { precision: 6, scale: 3 }),
    nbsRating: text('nbs_rating'),
    zoning: text('zoning'),
    yearBuilt: integer('year_built'),
    vendor: text('vendor'),
    purchaser: text('purchaser'),
    source: text('source'),
    notes: text('notes'),
    lat: numeric('lat', { precision: 10, scale: 7 }),
    lng: numeric('lng', { precision: 10, scale: 7 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dateIdx: index('sales_evidence_date_idx').on(t.saleDate),
    typeIdx: index('sales_evidence_type_idx').on(t.propertyType),
    categoryIdx: index('sales_evidence_category_idx').on(t.evidenceCategory),
    townIdx: index('sales_evidence_town_idx').on(t.town),
  }),
);

export const rentalEvidence = pgTable(
  'rental_evidence',
  {
    id: serial('id').primaryKey(),
    address: text('address').notNull(),
    suburb: text('suburb'),
    town: text('town'),
    region: text('region').default("Hawke's Bay"),
    propertyType: propertyTypeEnum('property_type'),
    /** As on sales evidence: the template's own category, `LeasesEvidenceType_<category>`. */
    evidenceCategory: text('evidence_category'),
    kind: rentalKindEnum('kind').notNull().default('new_letting'),
    commencementDate: date('commencement_date'),
    tenant: text('tenant'),
    lessor: text('lessor'),
    lettableArea: numeric('lettable_area', { precision: 12, scale: 2 }),
    annualRent: numeric('annual_rent', { precision: 12, scale: 2 }),
    netOrGross: text('net_or_gross').default('Net'),
    termYears: numeric('term_years', { precision: 5, scale: 2 }),
    rightsOfRenewal: text('rights_of_renewal'),
    reviewPattern: text('review_pattern'),
    carparks: integer('carparks'),
    carparkRate: numeric('carpark_rate', { precision: 10, scale: 2 }),
    incentives: text('incentives'),
    source: text('source'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dateIdx: index('rental_evidence_date_idx').on(t.commencementDate),
    typeIdx: index('rental_evidence_type_idx').on(t.propertyType),
    categoryIdx: index('rental_evidence_category_idx').on(t.evidenceCategory),
    townIdx: index('rental_evidence_town_idx').on(t.town),
  }),
);

export const jobComparables = pgTable(
  'job_comparables',
  {
    id: serial('id').primaryKey(),
    jobId: integer('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
    salesEvidenceId: integer('sales_evidence_id').references(() => salesEvidence.id, { onDelete: 'cascade' }),
    rentalEvidenceId: integer('rental_evidence_id').references(() => rentalEvidence.id, { onDelete: 'cascade' }),
    rating: ratingEnum('rating'),
    commentary: text('commentary'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ jobIdx: index('job_comparables_job_idx').on(t.jobId) }),
);

/* ------------------------------------------------------- report narrative */

/**
 * The narrative a report needs, keyed by the name the master template uses.
 *
 * The typed columns on `jobs` hold the practice's own data — dates, fees,
 * allocation, the value conclusions the pipeline and the KPIs read. The
 * templates ask for several hundred more: every clause, description and
 * comment the valuer writes, named as `Valuations.SiteDescription` and the
 * like, and different in each template version. Those live here, so a new
 * template version adds field names rather than database columns.
 *
 * `src/report/field-dictionary.json` is the list of names, extracted from the
 * templates themselves.
 */
export const jobReportValues = pgTable(
  'job_report_values',
  {
    id: serial('id').primaryKey(),
    jobId: integer('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
    /** The template's own name for the field, e.g. `Valuations.SiteDescription`. */
    fieldName: text('field_name').notNull(),
    value: text('value'),
    updatedById: integer('updated_by_id').references(() => valuers.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    jobFieldIdx: uniqueIndex('job_report_values_job_field_idx').on(t.jobId, t.fieldName),
  }),
);

/**
 * The answers that decide which sections a report contains.
 *
 * Each template wraps its optional sections in `VPDelStart:Cond … VPDelEnd:Cond`
 * and deletes the block when the condition holds, so an answer here is what
 * keeps the cross-lease clause, the land value assessment or the insurance
 * appendix in or out. Around 40 of them per template.
 */
export const jobReportSwitches = pgTable(
  'job_report_switches',
  {
    id: serial('id').primaryKey(),
    jobId: integer('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
    fieldName: text('field_name').notNull(),
    /** Usually 'Yes' or 'No'; the report-type switches carry a type name. */
    value: text('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    jobFieldIdx: uniqueIndex('job_report_switches_job_field_idx').on(t.jobId, t.fieldName),
  }),
);

/**
 * Rows for the templates' repeating regions.
 *
 * A template marks a repeating block `TableStart:so_Bedroom … TableEnd:so_Bedroom`,
 * and there are around fifty of them per template — accommodation schedules,
 * floor areas, title details, evidence tables. The row fields differ in every
 * region, so a row is stored as the values the region asks for rather than as
 * its own table. Evidence and tenancies are the exception: those are real
 * records elsewhere, and the report reads them from there.
 */
export const jobReportRows = pgTable(
  'job_report_rows',
  {
    id: serial('id').primaryKey(),
    jobId: integer('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
    /** The region name from the template, e.g. `so_FloorAreaEntry`. */
    region: text('region').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Row values keyed by the region's own field names. */
    values: jsonb('values').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    jobRegionIdx: index('job_report_rows_job_region_idx').on(t.jobId, t.region),
  }),
);

/* ---------------------------------------------------------------- tenancies */

/**
 * The subject property's tenancy schedule.
 *
 * Typed rather than stored as report rows, because a commercial valuation
 * works from it: passing rent, market rent, WALT and the income capitalisation
 * all come off these figures, and the schedule prints in the report as well.
 */
export const tenancies = pgTable(
  'tenancies',
  {
    id: serial('id').primaryKey(),
    propertyId: integer('property_id').references(() => properties.id, { onDelete: 'cascade' }).notNull(),
    tenant: text('tenant').notNull(),
    unit: text('unit'),
    use: text('use'),
    areaSqm: numeric('area_sqm', { precision: 10, scale: 2 }),
    carParks: integer('car_parks'),
    /** Contract rent per annum, net of outgoings unless `outgoingsBasis` says otherwise. */
    rentPa: numeric('rent_pa', { precision: 12, scale: 2 }),
    outgoingsBasis: text('outgoings_basis'),
    outgoingsPa: numeric('outgoings_pa', { precision: 12, scale: 2 }),
    /** The valuer's assessment, for the shortfall or surplus to contract rent. */
    marketRentPa: numeric('market_rent_pa', { precision: 12, scale: 2 }),
    leaseStart: date('lease_start'),
    leaseExpiry: date('lease_expiry'),
    /** Rights of renewal, e.g. '2 x 3 years'. */
    renewals: text('renewals'),
    finalExpiry: date('final_expiry'),
    reviewBasis: text('review_basis'),
    nextReview: date('next_review'),
    bondOrGuarantee: text('bond_or_guarantee'),
    comments: text('comments'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('tenancies_property_idx').on(t.propertyId),
    expiryIdx: index('tenancies_expiry_idx').on(t.leaseExpiry),
  }),
);

/* --------------------------------------------------------------- relations */

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  property: one(properties, { fields: [jobs.propertyId], references: [properties.id] }),
  instructor: one(contacts, { fields: [jobs.instructorId], references: [contacts.id], relationName: 'instructor' }),
  client: one(contacts, { fields: [jobs.clientId], references: [contacts.id], relationName: 'client' }),
  allocatedTo: one(valuers, { fields: [jobs.allocatedToId], references: [valuers.id], relationName: 'allocatedTo' }),
  takenBy: one(valuers, { fields: [jobs.takenById], references: [valuers.id], relationName: 'takenBy' }),
  authorisedBy: one(valuers, { fields: [jobs.authorisedById], references: [valuers.id], relationName: 'authorisedBy' }),
  clientOrg: one(clients, { fields: [jobs.clientOrgId], references: [clients.id] }),
  events: many(jobEvents),
  inspections: many(inspections),
  comparables: many(jobComparables),
  reportValues: many(jobReportValues),
  reportSwitches: many(jobReportSwitches),
  reportRows: many(jobReportRows),
}));

export const inspectionsRelations = relations(inspections, ({ one, many }) => ({
  job: one(jobs, { fields: [inspections.jobId], references: [jobs.id] }),
  inspectedBy: one(valuers, { fields: [inspections.inspectedById], references: [valuers.id] }),
  photos: many(inspectionPhotos),
}));

export const inspectionPhotosRelations = relations(inspectionPhotos, ({ one }) => ({
  inspection: one(inspections, { fields: [inspectionPhotos.inspectionId], references: [inspections.id] }),
}));

export const jobEventsRelations = relations(jobEvents, ({ one }) => ({
  job: one(jobs, { fields: [jobEvents.jobId], references: [jobs.id] }),
  valuer: one(valuers, { fields: [jobEvents.valuerId], references: [valuers.id] }),
}));

export const jobComparablesRelations = relations(jobComparables, ({ one }) => ({
  job: one(jobs, { fields: [jobComparables.jobId], references: [jobs.id] }),
  sale: one(salesEvidence, { fields: [jobComparables.salesEvidenceId], references: [salesEvidence.id] }),
  rental: one(rentalEvidence, { fields: [jobComparables.rentalEvidenceId], references: [rentalEvidence.id] }),
}));

export const propertiesRelations = relations(properties, ({ many }) => ({
  jobs: many(jobs),
  tenancies: many(tenancies),
}));

export const tenanciesRelations = relations(tenancies, ({ one }) => ({
  property: one(properties, { fields: [tenancies.propertyId], references: [properties.id] }),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  contacts: many(contacts),
  jobs: many(jobs),
}));

export const jobReportValuesRelations = relations(jobReportValues, ({ one }) => ({
  job: one(jobs, { fields: [jobReportValues.jobId], references: [jobs.id] }),
}));

export const jobReportSwitchesRelations = relations(jobReportSwitches, ({ one }) => ({
  job: one(jobs, { fields: [jobReportSwitches.jobId], references: [jobs.id] }),
}));

export const jobReportRowsRelations = relations(jobReportRows, ({ one }) => ({
  job: one(jobs, { fields: [jobReportRows.jobId], references: [jobs.id] }),
}));

// Both instructor/client point at `contacts`, and both allocatedTo/takenBy at
// `valuers`, so each side needs a matching relationName for Drizzle to
// disambiguate them in relational queries.
export const contactsRelations = relations(contacts, ({ one, many }) => ({
  client: one(clients, { fields: [contacts.clientId], references: [clients.id] }),
  instructedJobs: many(jobs, { relationName: 'instructor' }),
  clientJobs: many(jobs, { relationName: 'client' }),
}));

export const valuersRelations = relations(valuers, ({ many }) => ({
  allocatedJobs: many(jobs, { relationName: 'allocatedTo' }),
  takenJobs: many(jobs, { relationName: 'takenBy' }),
  authorisedJobs: many(jobs, { relationName: 'authorisedBy' }),
  inspections: many(inspections),
}));

/* ------------------------------------------------------------------- types */

export type Valuer = typeof valuers.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type ClientKind = Client['kind'];
export type Contact = typeof contacts.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobStatus = Job['status'];
export type JobEvent = typeof jobEvents.$inferSelect;
export type Inspection = typeof inspections.$inferSelect;
export type InspectionPhoto = typeof inspectionPhotos.$inferSelect;
export type SalesEvidence = typeof salesEvidence.$inferSelect;
export type RentalEvidence = typeof rentalEvidence.$inferSelect;
export type JobComparable = typeof jobComparables.$inferSelect;
export type Tenancy = typeof tenancies.$inferSelect;
export type JobReportValue = typeof jobReportValues.$inferSelect;
export type JobReportSwitch = typeof jobReportSwitches.$inferSelect;
export type JobReportRow = typeof jobReportRows.$inferSelect;
export type ReportTemplate = Job['reportTemplate'];
export type ReportType = Job['reportType'];
