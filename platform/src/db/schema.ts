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
    phone: text('phone'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ emailIdx: uniqueIndex('valuers_email_idx').on(t.email) }),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameIdx: index('contacts_name_idx').on(t.name),
    phoneIdx: index('contacts_phone_idx').on(t.phone),
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
    instructorId: integer('instructor_id').references(() => contacts.id, { onDelete: 'set null' }),
    clientId: integer('client_id').references(() => contacts.id, { onDelete: 'set null' }),
    borrower: text('borrower'),

    purpose: text('purpose'),
    purposeDetail: text('purpose_detail'),
    basis: text('basis').default('Market Value'),
    isQuote: boolean('is_quote').notNull().default(false),
    vosOrderNo: text('vos_order_no'),
    poNumber: text('po_number'),

    allocatedToId: integer('allocated_to_id').references(() => valuers.id, { onDelete: 'set null' }),
    takenById: integer('taken_by_id').references(() => valuers.id, { onDelete: 'set null' }),

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

/* --------------------------------------------------------------- relations */

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  property: one(properties, { fields: [jobs.propertyId], references: [properties.id] }),
  instructor: one(contacts, { fields: [jobs.instructorId], references: [contacts.id], relationName: 'instructor' }),
  client: one(contacts, { fields: [jobs.clientId], references: [contacts.id], relationName: 'client' }),
  allocatedTo: one(valuers, { fields: [jobs.allocatedToId], references: [valuers.id], relationName: 'allocatedTo' }),
  takenBy: one(valuers, { fields: [jobs.takenById], references: [valuers.id], relationName: 'takenBy' }),
  events: many(jobEvents),
  inspections: many(inspections),
  comparables: many(jobComparables),
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

export const propertiesRelations = relations(properties, ({ many }) => ({ jobs: many(jobs) }));

// Both instructor/client point at `contacts`, and both allocatedTo/takenBy at
// `valuers`, so each side needs a matching relationName for Drizzle to
// disambiguate them in relational queries.
export const contactsRelations = relations(contacts, ({ many }) => ({
  instructedJobs: many(jobs, { relationName: 'instructor' }),
  clientJobs: many(jobs, { relationName: 'client' }),
}));

export const valuersRelations = relations(valuers, ({ many }) => ({
  allocatedJobs: many(jobs, { relationName: 'allocatedTo' }),
  takenJobs: many(jobs, { relationName: 'takenBy' }),
  inspections: many(inspections),
}));

/* ------------------------------------------------------------------- types */

export type Valuer = typeof valuers.$inferSelect;
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
