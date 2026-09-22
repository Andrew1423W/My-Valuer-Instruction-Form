/**
 * Demo seed for the My Valuer platform.
 *
 * ⚠️  EVERY RECORD BELOW IS SYNTHETIC. The addresses are plausible Hawke's Bay
 *     streets but the sales prices, rents, yields, tenants and NBS ratings are
 *     invented for UI demonstration only. Every evidence row carries
 *     source = 'DEMO DATA — NOT REAL EVIDENCE' so it is obvious on screen and
 *     in any generated report. Run `npm run db:seed -- --wipe` to clear it out
 *     before entering real evidence.
 */
import 'dotenv/config';
import { db } from './index';
import {
  valuers,
  clients,
  contacts,
  properties,
  jobs,
  jobEvents,
  inspections,
  salesEvidence,
  rentalEvidence,
  jobComparables,
  jobReportSwitches,
  jobReportValues,
  tenancies,
} from './schema';
import { sql } from 'drizzle-orm';

const DEMO = 'DEMO DATA — NOT REAL EVIDENCE';

const d = (iso: string) => iso; // date columns take ISO strings
const ts = (iso: string) => new Date(iso);

async function wipe() {
  await db.execute(sql`
    truncate table job_comparables, inspection_photos, inspections, job_events,
      job_report_values, job_report_switches, job_report_rows, tenancies,
      jobs, properties, contacts, clients, sales_evidence, rental_evidence, valuers
      restart identity cascade
  `);
}

async function main() {
  await wipe();

  /* ------------------------------------------------------------- valuers */
  const [andrew, jo, sam, admin] = await db
    .insert(valuers)
    .values([
      { name: 'Andrew Bagnall', email: 'andrew@myvaluer.net.nz', initials: 'AB', role: 'director', registrationNo: 'RV-0000', phone: '027 000 0000', qualifications: 'BBS, Dip Val, ANZIV, SPINZ' },
      { name: 'Jo Whitfield', email: 'jo@myvaluer.net.nz', initials: 'JW', role: 'registered_valuer', qualifications: 'BAgSci, PGDipVal, ANZIV' },
      { name: 'Sam Patel', email: 'sam@myvaluer.net.nz', initials: 'SP', role: 'graduate', qualifications: 'BProp' },
      { name: 'Office Admin', email: 'admin@myvaluer.net.nz', initials: 'OA', role: 'admin' },
    ])
    .returning();

  /* ------------------------------------------------------------- clients */
  const cl = await db
    .insert(clients)
    .values([
      {
        name: 'ANZ Commercial', kind: 'bank', division: 'Napier', phone: '06 835 1111',
        address: 'PO Box 1234, Napier 4140', reportsEmail: 'valuations@example.co.nz',
        accountsEmail: 'accounts@example.co.nz', defaultFee: '2200.00', defaultTurnaroundDays: 10,
        terms: 'Panel agreement. Reliance extends to the bank and the borrower named in the instruction.',
      },
      {
        name: 'BNZ Partners', kind: 'bank', division: "Hawke's Bay", phone: '06 873 2222',
        address: 'Private Bag 3456, Hastings 4156', reportsEmail: 'hbvaluations@example.co.nz',
        defaultFee: '2500.00', defaultTurnaroundDays: 14,
        terms: 'Panel agreement. Draft figures by phone before the report issues.',
      },
      {
        name: 'Langley Twigg Law', kind: 'law_firm', phone: '06 835 3333',
        address: 'PO Box 446, Napier 4140', reportsEmail: 'property@example.co.nz',
        defaultFee: '1950.00', defaultTurnaroundDays: 15,
        terms: 'Matrimonial and estate work. Report addressed to the firm, not to the parties.',
      },
      {
        name: 'Pandora Industrial Trust', kind: 'trust', phone: '027 333 4444',
        address: '12 Bridge Street, Ahuriri, Napier 4110', reportsEmail: 'trust@example.co.nz',
        defaultFee: '3100.00',
      },
      {
        name: 'Omahu Logistics Limited', kind: 'corporate', phone: '06 879 7777',
        reportsEmail: 'ops@example.co.nz', defaultFee: '2750.00',
      },
    ])
    .returning();
  const [anz, bnz, langley, pandoraTrust, omahuCo] = cl;

  /* ------------------------------------------------------------ contacts */
  const c = await db
    .insert(contacts)
    .values([
      { type: 'instructor', clientId: anz.id, name: 'Rachel Moore', company: 'ANZ Commercial — Napier', email: 'rachel.moore@example.co.nz', phone: '06 835 1111' },
      { type: 'instructor', clientId: bnz.id, name: 'Daniel Fisher', company: 'BNZ Partners Hawke’s Bay', email: 'daniel.fisher@example.co.nz', phone: '06 873 2222' },
      { type: 'instructor', clientId: langley.id, name: 'Megan Ellis', company: 'Langley Twigg Law', email: 'megan.ellis@example.co.nz', phone: '06 835 3333' },
      { type: 'client', name: 'Heretaunga Holdings Limited', email: 'accounts@example.co.nz', phone: '027 111 2222', address: 'PO Box 1234, Hastings 4156' },
      { type: 'client', name: 'Pandora Industrial Trust', email: 'trust@example.co.nz', phone: '027 333 4444', address: '12 Bridge Street, Ahuriri, Napier 4110' },
      { type: 'client', name: 'K & M Thompson', email: 'kmthompson@example.co.nz', phone: '021 555 6666', address: '48 Te Mata Road, Havelock North 4130' },
      { type: 'client', name: 'Omahu Logistics Limited', email: 'ops@example.co.nz', phone: '06 879 7777' },
      { type: 'client', name: 'Ahuriri Hospitality Group', email: 'gm@example.co.nz', phone: '06 834 8888' },
    ])
    .returning();
  const [rachel, daniel, megan, heretaunga, pandora, thompson, omahu, ahuriri] = c;

  /* ---------------------------------------------------------- properties */
  const p = await db
    .insert(properties)
    .values([
      {
        address: '215 Heretaunga Street East', suburb: 'Hastings Central', town: 'Hastings',
        propertyType: 'retail', legalDescription: 'Lot 2 DP 11542', titleNo: 'HB12A/345',
        landArea: '612.00', floorArea: '438.00', zoning: 'Central Commercial', yearBuilt: 1968,
        nbsRating: '67% NBS (IL2)', councilRates: '14250.00', regionalRates: '1980.00',
        ratingLandValue: '420000.00', ratingImprovements: '530000.00', ratingCapitalValue: '950000.00',
        ratingEffectiveDate: d('2024-09-01'), lat: '-39.6395000', lng: '176.8480000',
      },
      {
        address: '14 Turner Place', suburb: 'Onekawa', town: 'Napier',
        propertyType: 'industrial', legalDescription: 'Lot 7 DP 18902', titleNo: 'HB18C/112',
        landArea: '2480.00', floorArea: '1620.00', zoning: 'General Industrial', yearBuilt: 1998,
        nbsRating: '85% NBS (IL2)', councilRates: '18900.00', regionalRates: '2410.00',
        ratingLandValue: '760000.00', ratingImprovements: '1290000.00', ratingCapitalValue: '2050000.00',
        ratingEffectiveDate: d('2024-09-01'), lat: '-39.5118000', lng: '176.8867000',
      },
      {
        address: '3 Bridge Street', suburb: 'Ahuriri', town: 'Napier',
        propertyType: 'office', legalDescription: 'Lot 1 DP 21114', titleNo: 'HB21B/88',
        landArea: '845.00', floorArea: '910.00', zoning: 'Suburban Commercial', yearBuilt: 2006,
        nbsRating: '100% NBS (IL2)', ratingCapitalValue: '3400000.00', ratingEffectiveDate: d('2024-09-01'),
        lat: '-39.4776000', lng: '176.9100000',
      },
      {
        address: '1180 Omahu Road', suburb: 'Twyford', town: 'Hastings',
        propertyType: 'showroom_large_format', legalDescription: 'Lot 3 DP 24551', titleNo: 'HB24A/201',
        landArea: '4100.00', floorArea: '2250.00', zoning: 'Large Format Retail', yearBuilt: 2014,
        nbsRating: '100% NBS (IL2)', ratingCapitalValue: '5600000.00',
        lat: '-39.6210000', lng: '176.7960000',
      },
      {
        address: '48 Te Mata Road', suburb: 'Havelock North', town: 'Hastings',
        propertyType: 'mixed_use', legalDescription: 'Lot 4 DP 9087', titleNo: 'HB9D/17',
        landArea: '1015.00', floorArea: '520.00', zoning: 'Village Centre', yearBuilt: 1985,
        nbsRating: '45% NBS (IL2) — earthquake prone', ratingCapitalValue: '1450000.00',
        lat: '-39.6690000', lng: '176.8790000',
      },
      {
        address: '9 Kirkwood Street', suburb: 'Pandora', town: 'Napier',
        propertyType: 'industrial', legalDescription: 'Lot 12 DP 15220', titleNo: 'HB15B/440',
        landArea: '3050.00', floorArea: '2110.00', zoning: 'General Industrial', yearBuilt: 1979,
        nbsRating: '34% NBS (IL2) — earthquake prone', ratingCapitalValue: '2250000.00',
        lat: '-39.4890000', lng: '176.8950000',
      },
      {
        address: '62 Gladstone Road', suburb: 'Gisborne Central', town: 'Gisborne', region: 'Gisborne',
        propertyType: 'retail', legalDescription: 'Lot 1 DP 4412', titleNo: 'GS4A/90',
        landArea: '505.00', floorArea: '390.00', zoning: 'Inner Commercial', yearBuilt: 1962,
        nbsRating: '55% NBS (IL2)', ratingCapitalValue: '780000.00',
        lat: '-38.6620000', lng: '178.0180000',
      },
      {
        address: '27 Thames Street', suburb: 'Pandora', town: 'Napier',
        propertyType: 'industrial', landArea: '1890.00', floorArea: '1240.00',
        zoning: 'General Industrial', yearBuilt: 2002, nbsRating: '80% NBS (IL2)',
        legalDescription: 'Lot 9 DP 17003', titleNo: 'HB17A/55',
      },
    ])
    .returning();

  /* ---------------------------------------------------------------- jobs */
  const j = await db
    .insert(jobs)
    .values([
      {
        jobNo: '25-0412', clientOrgId: anz.id, reportTemplate: 'commercial', reportType: 'market_value', status: 'instructed', propertyId: p[0].id, instructorId: rachel.id, clientId: heretaunga.id,
        borrower: 'Heretaunga Holdings Limited', purpose: 'Mortgage / finance',
        purposeDetail: 'Refinance of existing facility — current market value required.',
        basis: 'Market Value', vosOrderNo: 'VOS-884210', allocatedToId: jo.id, takenById: admin.id,
        instructionDate: d('2026-09-08'), dueDate: d('2026-09-22'),
        appointmentName: 'Rob Little (tenant)', appointmentPhone: '027 444 5555',
        feeMarket: '2200.00', notes: 'Ground floor retail with two upstairs tenancies.',
      },
      {
        jobNo: '25-0408', clientOrgId: bnz.id, reportTemplate: 'commercial', reportType: 'market_value', status: 'inspection_booked', propertyId: p[1].id, instructorId: daniel.id, clientId: pandora.id,
        purpose: 'Mortgage / finance', basis: 'Market Value', allocatedToId: andrew.id, takenById: admin.id,
        instructionDate: d('2026-09-05'), dueDate: d('2026-09-19'), inspectionAt: ts('2026-09-19T10:00:00+12:00'),
        appointmentName: 'Site manager', appointmentPhone: '027 777 8888', feeMarket: '2850.00',
      },
      {
        jobNo: '25-0399', clientOrgId: anz.id, reportTemplate: 'commercial', reportType: 'market_value', status: 'inspected', propertyId: p[2].id, instructorId: rachel.id, clientId: ahuriri.id,
        purpose: 'Financial reporting', basis: 'Fair Value', allocatedToId: andrew.id,
        instructionDate: d('2026-08-28'), dueDate: d('2026-09-20'), inspectionAt: ts('2026-09-11T13:30:00+12:00'),
        feeMarket: '3400.00', effectiveDate: d('2026-09-11'),
      },
      {
        jobNo: '25-0386', clientOrgId: omahuCo.id, reportTemplate: 'commercial', reportType: 'market_rental', status: 'drafting', propertyId: p[3].id, instructorId: daniel.id, clientId: omahu.id,
        purpose: 'Market rental assessment', basis: 'Market Rental', allocatedToId: jo.id,
        instructionDate: d('2026-08-20'), dueDate: d('2026-09-19'), inspectionAt: ts('2026-09-02T09:00:00+12:00'),
        feeMarket: '2600.00', adoptedRental: '292500.00', adoptedRate: '130.00', effectiveDate: d('2026-09-02'),
        notes: 'Rent review — 3 yearly to market, ratchet clause applies.',
      },
      {
        jobNo: '25-0377', clientOrgId: langley.id, reportTemplate: 'residential', reportType: 'market_value', authorisedById: andrew.id, status: 'qa_review', propertyId: p[4].id, instructorId: megan.id, clientId: thompson.id,
        purpose: 'Family / matrimonial', basis: 'Market Value', allocatedToId: sam.id,
        instructionDate: d('2026-08-14'), dueDate: d('2026-09-18'), inspectionAt: ts('2026-08-26T11:00:00+12:00'),
        feeMarket: '1950.00', adoptedValue: '1520000.00', effectiveDate: d('2026-08-26'),
        notes: 'Earthquake-prone notice on the title — seismic strengthening allowance deducted.',
      },
      {
        jobNo: '25-0361', clientOrgId: pandoraTrust.id, reportTemplate: 'commercial', reportType: 'market_value', status: 'issued', propertyId: p[5].id, instructorId: daniel.id, clientId: pandora.id,
        purpose: 'Mortgage / finance', basis: 'Market Value', allocatedToId: andrew.id,
        instructionDate: d('2026-07-30'), dueDate: d('2026-08-15'), inspectionAt: ts('2026-08-06T14:00:00+12:00'),
        issuedDate: d('2026-08-14'), feeMarket: '3100.00', adoptedValue: '2180000.00',
        adoptedYield: '7.250', adoptedRate: '1033.00', effectiveDate: d('2026-08-06'),
      },
      {
        jobNo: '25-0415', clientOrgId: langley.id, reportTemplate: 'commercial', reportType: 'market_value', status: 'quote', propertyId: p[6].id, instructorId: megan.id, clientId: thompson.id,
        purpose: 'Pre-purchase advice', basis: 'Market Value', isQuote: true, takenById: admin.id,
        instructionDate: d('2026-09-15'), feeMarket: '2400.00',
        notes: 'Quote issued 15 Sep, expires 15 Oct. Gisborne — travel included in fee.',
      },
      {
        jobNo: '25-0392', clientOrgId: omahuCo.id, reportTemplate: 'commercial', reportType: 'insurance', status: 'on_hold', propertyId: p[7].id, instructorId: rachel.id, clientId: omahu.id,
        purpose: 'Insurance replacement', basis: 'Insurance Replacement', allocatedToId: sam.id,
        instructionDate: d('2026-08-25'), dueDate: d('2026-09-30'), feeInsurance: '1450.00',
        notes: 'On hold pending plans from the client’s engineer.',
      },
      {
        jobNo: '25-0404', clientOrgId: omahuCo.id, reportTemplate: 'commercial', reportType: 'market_value', status: 'instructed', propertyId: p[7].id, instructorId: daniel.id, clientId: omahu.id,
        purpose: 'Mortgage / finance', basis: 'Market Value', allocatedToId: jo.id,
        instructionDate: d('2026-09-02'), dueDate: d('2026-09-16'), feeMarket: '2750.00',
        notes: 'OVERDUE — chase instructor for access.',
      },
    ])
    .returning();

  /* -------------------------------------------------------- job timeline */
  await db.insert(jobEvents).values([
    { jobId: j[0].id, valuerId: admin.id, kind: 'status_change', toStatus: 'instructed', detail: 'Instruction received by phone', at: ts('2026-09-08T09:12:00+12:00') },
    { jobId: j[1].id, valuerId: admin.id, kind: 'status_change', fromStatus: 'instructed', toStatus: 'inspection_booked', detail: 'Inspection booked for 19 Sep 10:00am', at: ts('2026-09-10T15:40:00+12:00') },
    { jobId: j[2].id, valuerId: andrew.id, kind: 'status_change', fromStatus: 'inspection_booked', toStatus: 'inspected', detail: 'Inspection completed', at: ts('2026-09-11T15:05:00+12:00') },
    { jobId: j[3].id, valuerId: jo.id, kind: 'status_change', fromStatus: 'inspected', toStatus: 'drafting', detail: 'Rental evidence analysed, drafting commenced', at: ts('2026-09-08T08:30:00+12:00') },
    { jobId: j[4].id, valuerId: sam.id, kind: 'status_change', fromStatus: 'drafting', toStatus: 'qa_review', detail: 'Draft to AB for peer review', at: ts('2026-09-15T16:20:00+12:00') },
    { jobId: j[5].id, valuerId: andrew.id, kind: 'status_change', fromStatus: 'qa_review', toStatus: 'issued', detail: 'Report issued to BNZ', at: ts('2026-08-14T11:00:00+12:00') },
    { jobId: j[7].id, valuerId: sam.id, kind: 'note', detail: 'Client engineer to supply floor plans before insurance assessment can proceed.', at: ts('2026-09-01T10:00:00+12:00') },
  ]);

  /* -------------------------------------------------------- inspections */
  await db.insert(inspections).values([
    {
      jobId: j[2].id, inspectedById: andrew.id, inspectedAt: ts('2026-09-11T13:30:00+12:00'),
      presentAt: 'Building manager', weather: 'Fine, 18°C',
      construction: 'Reinforced concrete frame, precast panel and curtain wall infill',
      roof: 'Membrane over concrete deck', condition: 'Good — well maintained throughout',
      services: 'Three-phase power, ducted HVAC, lift, sprinklers',
      carparking: '18 sealed on-site spaces', nbsRating: '100% NBS (IL2)',
      nbsSource: 'DSA by Strata Group dated March 2022',
      deferredMaintenance: 'Nil material items noted',
      measuredFloorArea: '910.00',
      accommodation: [
        { label: 'Ground floor office', areaSqm: '455.00', notes: 'Open plan with 3 meeting rooms' },
        { label: 'First floor office', areaSqm: '455.00', notes: 'Fitted out 2019' },
      ],
      notes: 'Fully leased to two tenants. Seismic report sighted on site.',
      completedAt: ts('2026-09-11T15:00:00+12:00'),
    },
    {
      jobId: j[4].id, inspectedById: sam.id, inspectedAt: ts('2026-08-26T11:00:00+12:00'),
      presentAt: 'Mrs K Thompson', weather: 'Overcast',
      construction: 'Brick veneer over timber frame, unreinforced masonry parapet to street',
      roof: 'Long-run steel, approx 15 years old', condition: 'Fair — dated fitout, some rising damp to rear',
      services: 'Single phase, no HVAC to rear tenancy',
      carparking: '4 spaces at rear off service lane',
      nbsRating: '45% NBS (IL2)', nbsSource: 'IEP by Hawke’s Bay Engineering, June 2021',
      deferredMaintenance: 'Parapet securing, rear wall damp remediation',
      measuredFloorArea: '520.00',
      accommodation: [
        { label: 'Retail tenancy (front)', areaSqm: '210.00' },
        { label: 'Office / studio (rear)', areaSqm: '180.00' },
        { label: 'Residential flat (upper)', areaSqm: '130.00', notes: '2 bedroom, owner occupied' },
      ],
      notes: 'Earthquake-prone building notice affixed. Strengthening estimate to be obtained.',
      completedAt: ts('2026-08-26T12:45:00+12:00'),
    },
  ]);

  /* ------------------------------------------------------ sales evidence */
  const s = await db
    .insert(salesEvidence)
    .values([
      { address: '128 Heretaunga Street West', suburb: 'Hastings Central', town: 'Hastings', propertyType: 'retail', evidenceCategory: 'Commercial', saleDate: d('2026-07-18'), salePrice: '1075000.00', tenure: 'investment', landArea: '540.00', floorArea: '465.00', netIncome: '82000.00', passingYield: '7.630', nbsRating: '70% NBS', zoning: 'Central Commercial', yearBuilt: 1972, vendor: 'Private', purchaser: 'Local investor', source: DEMO },
      { address: '302 Queen Street East', suburb: 'Hastings Central', town: 'Hastings', propertyType: 'retail', evidenceCategory: 'Commercial', saleDate: d('2026-05-02'), salePrice: '860000.00', tenure: 'vacant_possession', landArea: '480.00', floorArea: '402.00', nbsRating: '38% NBS', zoning: 'Central Commercial', yearBuilt: 1960, source: DEMO },
      { address: '21 Karamu Road North', suburb: 'Hastings', town: 'Hastings', propertyType: 'retail', evidenceCategory: 'Commercial', saleDate: d('2026-03-14'), salePrice: '1340000.00', tenure: 'investment', landArea: '710.00', floorArea: '520.00', netIncome: '96500.00', passingYield: '7.200', nbsRating: '100% NBS', yearBuilt: 2009, source: DEMO },
      { address: '6 Turner Place', suburb: 'Onekawa', town: 'Napier', propertyType: 'industrial', evidenceCategory: 'Commercial', saleDate: d('2026-08-06'), salePrice: '2650000.00', tenure: 'investment', landArea: '2610.00', floorArea: '1780.00', netIncome: '188000.00', passingYield: '7.090', nbsRating: '100% NBS', zoning: 'General Industrial', yearBuilt: 2015, source: DEMO },
      { address: '44 Niven Street', suburb: 'Onekawa', town: 'Napier', propertyType: 'industrial', evidenceCategory: 'Commercial', saleDate: d('2026-06-20'), salePrice: '1880000.00', tenure: 'vacant_possession', landArea: '2100.00', floorArea: '1450.00', nbsRating: '80% NBS', yearBuilt: 1996, source: DEMO },
      { address: '18 Kirkwood Street', suburb: 'Pandora', town: 'Napier', propertyType: 'industrial', evidenceCategory: 'Commercial', saleDate: d('2026-04-29'), salePrice: '2050000.00', tenure: 'investment', landArea: '2950.00', floorArea: '1980.00', netIncome: '156000.00', passingYield: '7.610', nbsRating: '45% NBS', yearBuilt: 1981, source: DEMO },
      { address: '7 Thames Street', suburb: 'Pandora', town: 'Napier', propertyType: 'industrial', evidenceCategory: 'Commercial', saleDate: d('2026-02-11'), salePrice: '1620000.00', tenure: 'part_occupied', landArea: '1840.00', floorArea: '1190.00', netIncome: '118000.00', passingYield: '7.280', yearBuilt: 2001, source: DEMO },
      { address: '11 Bridge Street', suburb: 'Ahuriri', town: 'Napier', propertyType: 'office', evidenceCategory: 'Commercial', saleDate: d('2026-07-03'), salePrice: '3950000.00', tenure: 'investment', landArea: '900.00', floorArea: '1050.00', netIncome: '272000.00', passingYield: '6.890', nbsRating: '100% NBS', yearBuilt: 2008, source: DEMO },
      { address: '55 Bower Street', suburb: 'Ahuriri', town: 'Napier', propertyType: 'office', evidenceCategory: 'Commercial', saleDate: d('2026-01-24'), salePrice: '2480000.00', tenure: 'investment', landArea: '620.00', floorArea: '740.00', netIncome: '182000.00', passingYield: '7.340', nbsRating: '85% NBS', yearBuilt: 2004, source: DEMO },
      { address: '1044 Omahu Road', suburb: 'Twyford', town: 'Hastings', propertyType: 'showroom_large_format', evidenceCategory: 'Commercial', saleDate: d('2026-06-05'), salePrice: '5850000.00', tenure: 'investment', landArea: '4300.00', floorArea: '2400.00', netIncome: '406000.00', passingYield: '6.940', nbsRating: '100% NBS', yearBuilt: 2016, source: DEMO },
      { address: '820 Omahu Road', suburb: 'Hastings', town: 'Hastings', propertyType: 'trade_retail', evidenceCategory: 'Commercial', saleDate: d('2026-03-28'), salePrice: '3200000.00', tenure: 'investment', landArea: '3100.00', floorArea: '1650.00', netIncome: '238000.00', passingYield: '7.440', yearBuilt: 2011, source: DEMO },
      { address: '32 Te Mata Road', suburb: 'Havelock North', town: 'Hastings', propertyType: 'mixed_use', evidenceCategory: 'Commercial', saleDate: d('2026-05-16'), salePrice: '1680000.00', tenure: 'part_occupied', landArea: '980.00', floorArea: '540.00', netIncome: '112000.00', passingYield: '6.670', nbsRating: '67% NBS', yearBuilt: 1988, source: DEMO },
      { address: '9 Napier Road', suburb: 'Havelock North', town: 'Hastings', propertyType: 'mixed_use', evidenceCategory: 'Commercial', saleDate: d('2025-11-20'), salePrice: '1395000.00', tenure: 'investment', landArea: '860.00', floorArea: '470.00', netIncome: '98000.00', passingYield: '7.030', nbsRating: '40% NBS', yearBuilt: 1975, source: DEMO },
      { address: '88 Gladstone Road', suburb: 'Gisborne Central', town: 'Gisborne', region: 'Gisborne', propertyType: 'retail', evidenceCategory: 'Commercial', saleDate: d('2026-04-09'), salePrice: '795000.00', tenure: 'investment', landArea: '520.00', floorArea: '410.00', netIncome: '62000.00', passingYield: '7.800', nbsRating: '60% NBS', yearBuilt: 1965, source: DEMO },
      { address: '14 Peel Street', suburb: 'Gisborne Central', town: 'Gisborne', region: 'Gisborne', propertyType: 'office', evidenceCategory: 'Commercial', saleDate: d('2026-02-27'), salePrice: '1120000.00', tenure: 'vacant_possession', landArea: '610.00', floorArea: '580.00', nbsRating: '75% NBS', yearBuilt: 1998, source: DEMO },
    ])
    .returning();

  /* ----------------------------------------------------- rental evidence */
  await db.insert(rentalEvidence).values([
    { address: '1044 Omahu Road', suburb: 'Twyford', town: 'Hastings', propertyType: 'showroom_large_format', evidenceCategory: 'Commercial', kind: 'new_letting', commencementDate: d('2026-07-01'), tenant: 'National retailer', lettableArea: '2400.00', annualRent: '324000.00', netOrGross: 'Net', termYears: '9.00', rightsOfRenewal: '2 x 6 years', reviewPattern: '3 yearly to market, CPI in between', carparks: 40, incentives: '3 months rent free', source: DEMO },
    { address: '215 Heretaunga Street East', suburb: 'Hastings Central', town: 'Hastings', propertyType: 'retail', evidenceCategory: 'Retail', kind: 'rent_review', commencementDate: d('2026-06-01'), tenant: 'Hospitality operator', lettableArea: '240.00', annualRent: '61200.00', netOrGross: 'Net', termYears: '6.00', reviewPattern: '3 yearly to market', source: DEMO },
    { address: '128 Heretaunga Street West', suburb: 'Hastings Central', town: 'Hastings', propertyType: 'retail', evidenceCategory: 'Retail', kind: 'new_letting', commencementDate: d('2026-04-15'), tenant: 'Specialty retail', lettableArea: '465.00', annualRent: '104600.00', netOrGross: 'Net', termYears: '6.00', rightsOfRenewal: '2 x 3 years', source: DEMO },
    { address: '6 Turner Place', suburb: 'Onekawa', town: 'Napier', propertyType: 'industrial', evidenceCategory: 'Industrial', kind: 'new_letting', commencementDate: d('2026-05-01'), tenant: 'Transport operator', lettableArea: '1780.00', annualRent: '191000.00', netOrGross: 'Net', termYears: '8.00', rightsOfRenewal: '2 x 4 years', reviewPattern: 'Annual CPI, market at renewal', carparks: 12, source: DEMO },
    { address: '44 Niven Street', suburb: 'Onekawa', town: 'Napier', propertyType: 'industrial', evidenceCategory: 'Industrial', kind: 'rent_review', commencementDate: d('2026-03-01'), tenant: 'Engineering firm', lettableArea: '1450.00', annualRent: '148000.00', netOrGross: 'Net', termYears: '6.00', source: DEMO },
    { address: '18 Kirkwood Street', suburb: 'Pandora', town: 'Napier', propertyType: 'industrial', evidenceCategory: 'Industrial', kind: 'renewal', commencementDate: d('2026-02-01'), tenant: 'Food processor', lettableArea: '1980.00', annualRent: '178000.00', netOrGross: 'Net', termYears: '4.00', source: DEMO },
    { address: '27 Thames Street', suburb: 'Pandora', town: 'Napier', propertyType: 'industrial', evidenceCategory: 'Industrial', kind: 'new_letting', commencementDate: d('2025-12-01'), tenant: 'Distribution', lettableArea: '1240.00', annualRent: '124000.00', netOrGross: 'Net', termYears: '6.00', source: DEMO },
    { address: '3 Bridge Street', suburb: 'Ahuriri', town: 'Napier', propertyType: 'office', evidenceCategory: 'Office', kind: 'new_letting', commencementDate: d('2026-08-01'), tenant: 'Professional services', lettableArea: '455.00', annualRent: '141000.00', netOrGross: 'Net', termYears: '9.00', rightsOfRenewal: '2 x 6 years', carparks: 9, carparkRate: '2400.00', incentives: 'Landlord fitout contribution $120,000', source: DEMO },
    { address: '11 Bridge Street', suburb: 'Ahuriri', town: 'Napier', propertyType: 'office', evidenceCategory: 'Office', kind: 'rent_review', commencementDate: d('2026-05-01'), tenant: 'Government agency', lettableArea: '1050.00', annualRent: '283500.00', netOrGross: 'Net', termYears: '12.00', carparks: 16, carparkRate: '2600.00', source: DEMO },
    { address: '55 Bower Street', suburb: 'Ahuriri', town: 'Napier', propertyType: 'office', evidenceCategory: 'Office', kind: 'new_letting', commencementDate: d('2026-01-15'), tenant: 'Consultancy', lettableArea: '370.00', annualRent: '96200.00', netOrGross: 'Net', termYears: '6.00', source: DEMO },
    { address: '820 Omahu Road', suburb: 'Hastings', town: 'Hastings', propertyType: 'trade_retail', evidenceCategory: 'Commercial', kind: 'new_letting', commencementDate: d('2026-02-01'), tenant: 'Trade supplier', lettableArea: '1650.00', annualRent: '243000.00', netOrGross: 'Net', termYears: '10.00', source: DEMO },
    { address: '32 Te Mata Road', suburb: 'Havelock North', town: 'Hastings', propertyType: 'mixed_use', evidenceCategory: 'Commercial', kind: 'new_letting', commencementDate: d('2026-06-15'), tenant: 'Cafe operator', lettableArea: '165.00', annualRent: '57750.00', netOrGross: 'Net', termYears: '6.00', source: DEMO },
  ]);

  /* --------------------------------------------- comparables on job 25-0412 */
  await db.insert(jobComparables).values([
    { jobId: j[0].id, salesEvidenceId: s[0].id, rating: 'comparable', sortOrder: 1, commentary: 'Similar central Hastings retail holding of comparable age and floor area, let at a market level rental. Located one block west of the subject with broadly similar pedestrian exposure. Overall assessed as directly comparable.' },
    { jobId: j[0].id, salesEvidenceId: s[1].id, rating: 'inferior', sortOrder: 2, commentary: 'Sold with vacant possession and a 38% NBS rating, requiring both re-letting and seismic strengthening. Inferior to the subject, which is fully let with a 67% NBS rating.' },
    { jobId: j[0].id, salesEvidenceId: s[2].id, rating: 'superior', sortOrder: 3, commentary: 'Modern 2009 building at 100% NBS on a larger site with superior parking. Superior to the subject on age, seismic capacity and configuration.' },
  ]);

  /* ------------------------------------------------- tenancy schedules */
  const t = await db
    .insert(tenancies)
    .values([
      // 215 Heretaunga Street East — ground floor retail, two upstairs tenancies.
      {
        propertyId: p[0].id, tenant: 'Hospitality operator', unit: 'Ground floor', use: 'Cafe',
        areaSqm: '240.00', rentPa: '61200.00', outgoingsBasis: 'Net', outgoingsPa: '12400.00',
        marketRentPa: '63000.00', leaseStart: d('2023-06-01'), leaseExpiry: d('2029-05-31'),
        renewals: '2 x 3 years', finalExpiry: d('2035-05-31'),
        reviewBasis: '3 yearly to market', nextReview: d('2026-06-01'),
        bondOrGuarantee: 'Personal guarantee', comments: 'Established operator, no arrears.',
        sortOrder: 1,
      },
      {
        propertyId: p[0].id, tenant: 'Accountancy practice', unit: 'First floor east', use: 'Office',
        areaSqm: '112.00', rentPa: '22400.00', outgoingsBasis: 'Gross', marketRentPa: '23500.00',
        leaseStart: d('2024-04-01'), leaseExpiry: d('2027-03-31'), renewals: '1 x 3 years',
        reviewBasis: 'Annual CPI', sortOrder: 2,
      },
      {
        propertyId: p[0].id, tenant: 'Vacant', unit: 'First floor west', use: 'Office',
        areaSqm: '86.00', marketRentPa: '17200.00',
        comments: 'Vacant since March. Letting up allowance applied.', sortOrder: 3,
      },
      // 3 Bridge Street — two office tenants over two floors.
      {
        propertyId: p[2].id, tenant: 'Professional services firm', unit: 'Ground floor', use: 'Office',
        areaSqm: '455.00', carParks: 9, rentPa: '141000.00', outgoingsBasis: 'Net',
        marketRentPa: '141000.00', leaseStart: d('2026-08-01'), leaseExpiry: d('2035-07-31'),
        renewals: '2 x 6 years', reviewBasis: '3 yearly to market, CPI in between', sortOrder: 1,
      },
      {
        propertyId: p[2].id, tenant: 'Government agency', unit: 'First floor', use: 'Office',
        areaSqm: '455.00', carParks: 9, rentPa: '137000.00', outgoingsBasis: 'Net',
        marketRentPa: '141000.00', leaseStart: d('2019-09-01'), leaseExpiry: d('2031-08-31'),
        renewals: '1 x 6 years', reviewBasis: '3 yearly to market', nextReview: d('2028-09-01'),
        sortOrder: 2,
      },
    ])
    .returning();

  /* --------------------------------- the written report for job 25-0412 */
  // Keyed by the names the commercial master template uses, so this is exactly
  // what the fill reads. The wording is written as a valuer would write it.
  await db.insert(jobReportValues).values(
    Object.entries({
      'Valuations.Location':
        'The property occupies a central position on the southern side of Heretaunga Street East, '
        + 'within the Hastings central retail core and a short walk from the Municipal Building and '
        + 'the main public car parking.',
      'Valuations.Neighbourhood':
        'Surrounding development is a mix of two-storey commercial buildings of similar age, in '
        + 'retail and hospitality use at ground level with office and residential above.',
      'Valuations.SiteDescriptionTopography':
        'A level, rectangular site with a 15 metre frontage to Heretaunga Street East and a depth '
        + 'of approximately 41 metres, with rear service access from the council lane.',
      'Valuations.ImprovementsDescription':
        'A two-storey building constructed about 1968 of reinforced concrete frame with unreinforced '
        + 'masonry infill, providing a ground floor retail tenancy and two first floor office '
        + 'tenancies, one of which is vacant.',
      'Valuations.ExternalCondition': 'Fair to good for its age. The parapet has been secured.',
      'Valuations.InternalCondition':
        'The ground floor fitout was renewed in 2023 by the current tenant. The first floor is dated.',
      'Valuations.Strengths':
        'Central retail position with high pedestrian exposure; established ground floor tenant on '
        + 'a lease to 2029; 67% NBS, above the earthquake-prone threshold.',
      'Valuations.Weaknesses':
        'Vacant first floor west tenancy; dated first floor fitout; no on-site parking.',
      'Valuations.Opportunities':
        'Letting the vacant tenancy at the assessed market rental would lift net income by '
        + 'approximately $17,200 per annum.',
      'Valuations.Threats':
        'Continued softening of secondary retail demand; further seismic requirements affecting '
        + 'buildings below 100% NBS.',
      'Valuations.GeneralComments':
        'Our assessment reflects the property as a part-let investment, with a letting up allowance '
        + 'for the vacant tenancy and no allowance for seismic strengthening beyond the works already '
        + 'completed.',
      'Valuations.LegalInstruments':
        'The record of title is subject to a right of way in gross over the rear service lane.',
    }).map(([fieldName, value]) => ({ jobId: j[0].id, fieldName, value })),
  );

  await db.insert(jobReportSwitches).values(
    Object.entries({
      'Valuations.ComReport': 'Market Value',
      'Valuations.LandValueAssessment': 'Yes',
      'Valuations.UseGST': 'No',
      'Valuations.UseAuthorisingSignature': 'No',
    }).map(([fieldName, value]) => ({ jobId: j[0].id, fieldName, value })),
  );

  const counts = {
    valuers: 4, clients: cl.length, contacts: c.length, properties: p.length,
    jobs: j.length, sales: s.length, rentals: 12, inspections: 2, comparables: 3,
    tenancies: t.length, reportValues: 12,
  };
  console.log('Seeded (all data SYNTHETIC):', counts);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
