# My Valuer — Practice Platform

An in-house valuation practice management platform for My Valuer Limited: job
pipeline, inspections, sales and rental evidence, and report assembly. Built to
cover the same ground as the firm's VPX (ValuePRO) tenancy with data the firm
owns outright.

Nothing here is derived from ValuePRO's code, markup or assets. The feature set
is modelled on the work a Hawke's Bay valuation practice actually does.

---

## What works today

| Module | State |
|---|---|
| **Dashboard** | KPI tiles (live, overdue, due in 7 days, awaiting inspection, in QA), due/overdue list, workload and fees by valuer, upcoming inspections, pipeline by stage, activity feed |
| **Job pipeline** | Drag-and-drop kanban across 8 stages, list view, overdue and per-valuer filters, every stage change logged to the job's file history |
| **Job record** | Property, parties, instruction, dates, fees, allocation; valuation conclusions (value, rental, yield, rate, insurance replacement); file notes and full history |
| **New instruction** | Intake form mirroring the existing staff instruction form, reusing existing properties/contacts, auto-allocating the next `YY-NNNN` job number |
| **Inspections** | Phone-first capture: attendance, construction, services, seismic/NBS and source, deferred maintenance, live-totalling accommodation schedule, camera photo upload; completing one advances the job to Inspected |
| **Evidence ledger** | Sales and rental evidence with address/type/town/date filters and median rate and yield analytics; $/m² and yields are **derived on read**, never stored, so they cannot disagree with the underlying figures |
| **Comparables** | Attach sales or lettings to a job, rate each Inferior / Comparable / Superior, write per-sale comparison commentary |
| **Clients** | The organisations that instruct us: named contacts, standing terms, standard fee and turnaround, every job and fee against them, and what is still open |
| **Report writing** | A per-job form generated from the firm's own master templates, asking only for what this kind of report prints, under the template's own section headings |
| **Report output** | One click fills the firm's commercial or residential master template — the approved layout, clause wording and compliance text, with this job's data in it |
| **Properties register** | Every property valued, with job counts, so repeat instructions reuse title, area and seismic details |
| **Tenancy schedules** | The subject property's tenancies, typed, because the income capitalisation works off them and the schedule prints in the report |

Deliberately **not** built (per instruction): invoicing and fee chasing.

## Not yet built

- Paid data integrations (CoreLogic/QV sales, LINZ titles, council rates) — these
  need the firm's own licences and API keys; the schema has the fields waiting.
- Map view of jobs and evidence (`lat`/`lng` are on both tables already).
- Client/instructor portal, and emailing quotes and reports from within the app
  (the existing instruction form already does this through Microsoft Graph).
- Offline inspection capture (currently needs a connection to save).
- Evidence import from existing reports and spreadsheets.
- Photographs into the templates' image slots (18 commercial, 23 residential):
  the slots are read and reported, but not yet filled, so photographs still go
  in by hand.

---

## Stack

- **Next.js 15** (App Router, React 19, server actions — no separate API tier)
- **PostgreSQL** via **Drizzle ORM**, typed end to end
- **Microsoft Entra ID** sign-in through Auth.js, against the firm's existing
  M365 tenant, so there are no extra passwords
- **jszip** for reading and rewriting the firm's own `.docx` templates
- Tailwind CSS 4, styled to the My Valuer palette from the instruction form

Money and area columns are Postgres `numeric` and are carried as strings all the
way to the screen, so figures round-trip exactly as typed — no float drift on a
valuation figure. Dates and times always render in `Pacific/Auckland` regardless
of where the server runs.

---

## The report module

The firm's reports come out of two Word mail-merge documents:
`templates/commercial-v65.docx` and `templates/residential-v48.docx`. The
platform fills them rather than building a report of its own, so the layout,
clause wording and compliance text stay exactly as the firm approved them, and
stay the firm's to change in Word.

`tools/extract-template-spec.py` reads both templates into
`src/report/field-dictionary.json` — 110 job fields, 100 row fields, 55
repeating regions, 48 conditional blocks and 18 image slots in the commercial
template; 146 / 65 / 49 / 65 / 23 in the residential one. Everything downstream
is generated from that file, so a new template version is a re-run, not a code
change.

Three things the templates do that are worth knowing:

- **`VPDelStart:Cond … VPDelEnd:Cond` deletes its block when the condition
  holds**, not the other way round. The insurance cost estimates sit inside
  `ComReport_neq_Insurance`, so they come out of every report except an
  insurance one.
- **Each template holds every report type in one file.** The job's report type
  decides which sections survive, and is written into the template's own switch
  during the fill, so the document cannot disagree with the job.
- **The commercial template leaves its value conclusion as literal text** —
  `??? Thousand Dollars ($,000) plus GST, if any` — rather than as a merge
  field, in 37 places. The fill cannot reach those, so it reports them; they are
  worth turning into merge fields in Word.

Three sources feed a report and are kept apart. The typed columns on `jobs` hold
what the practice manages — dates, fees, allocation, the value conclusions the
dashboard reads — and win wherever both have something to say.
`job_report_values` holds the narrative the valuer writes for this report, keyed
by the template's own field names, so a new template version adds names rather
than database columns. `job_report_rows`, the tenancies and the evidence fill the
repeating schedules.

```
npm run template:spec     # re-read the templates into the field dictionary
npm run template:verify   # 90 checks, both templates, end to end
```

---

## Running it locally

Requires Node 20+ and a PostgreSQL 14+ server.

```bash
cd platform
npm install
cp .env.example .env          # then edit DATABASE_URL

createdb myvaluer             # or point DATABASE_URL at an existing database
npm run db:push               # create the tables
npm run db:seed               # optional demo data — see the warning below
npm run dev                   # http://localhost:3000
```

`DEV_USER_EMAIL` in `.env` skips Entra sign-in and acts as that seeded valuer.
**It must be unset in production**, where sign-in falls through to Entra ID.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Session signing key — `openssl rand -base64 32` |
| `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_ISSUER` | Entra app registration; redirect URI `https://<host>/api/auth/callback/microsoft-entra-id` |
| `DEV_USER_EMAIL` | Development only — bypasses sign-in |
| `UPLOAD_DIR` | Where inspection photos are written (local disk in dev) |

A valuer can only sign in if their Entra email matches a row in the `valuers`
table — that table is the firm's staff list and access control in one.

### Useful commands

```bash
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run db:generate # write a SQL migration from schema changes
npm run db:studio   # browse the database
npm run template:spec    # re-read the master templates into the field dictionary
npm run template:verify  # check both templates fill correctly, end to end
```

---

## ⚠️ About the seeded data

`npm run db:seed` inserts **synthetic** jobs, properties, sales and rentals. The
street names are real Hawke's Bay and Gisborne streets but **every price, rent,
yield, tenant and NBS rating is invented** for demonstration. Each evidence row
carries `source = 'DEMO DATA — NOT REAL EVIDENCE'`, and any report generated
from it prints a warning on the front page.

Clear it before entering real evidence:

```sql
truncate table job_comparables, inspection_photos, inspections, job_events,
  jobs, properties, contacts, sales_evidence, rental_evidence, valuers
  restart identity cascade;
```

Then insert the real staff list into `valuers` (name, email, initials, role) so
people can sign in.

---

## Deployment notes

Intended shape for production:

- **App** — Azure App Service or Container Apps, in the same tenant as M365.
- **Database** — Azure Database for PostgreSQL Flexible Server, `sslmode=require`.
  Run `npm run db:push` (or a generated migration) on deploy.
- **Photos** — replace the `UPLOAD_DIR` disk writes in `src/app/actions.ts` with
  an Azure Blob container, and make `src/app/api/photos/[id]/route.ts` redirect
  to a short-lived SAS URL. Both are isolated to those two files for exactly
  this reason.
- **Backups** — the database is the system of record; point-in-time restore on
  the Flexible Server covers it. Reports are regenerated from data, not stored.

Before going live: unset `DEV_USER_EMAIL`, set a real `AUTH_SECRET`, and confirm
the Entra app registration's redirect URI matches the deployed host.

---

## Layout

```
templates/                       the firm's master templates, filled as they are
tools/
  extract-template-spec.py       reads the templates into the field dictionary
  verify-template-fill.ts        both templates fill to well-formed output
  verify-field-expressions.ts    Word IF and = fields evaluate correctly
  verify-job-mapping.ts          a job reaches the document, end to end
  verify-report-entry.ts         the entry form asks the right questions
src/
  app/
    page.tsx                     dashboard
    jobs/                        pipeline, new instruction, job record, inspection
    jobs/[id]/report/            the report entry form
    clients/                     client list, client record, new client
    evidence/                    ledger and evidence entry
    properties/                  property register
    actions.ts                   all server actions (writes)
    api/jobs/[id]/report/        fills the master template and returns the .docx
    api/photos/[id]/             inspection photo serving
  components/                    kanban, inspection form, shared UI
  db/schema.ts                   the whole data model
  db/seed.ts                     synthetic demo data
  lib/format.ts                  NZ money/area/date formatting, derived rates
  lib/status.ts                  job stages
  lib/session.ts                 signed-in valuer
  report/
    field-dictionary.json        the templates, read into a spec
    docx-template.ts             the fill engine
    job-fields.ts                a job mapped onto the template's field names
    entry.ts                     the entry form, generated from the dictionary
    build.ts                     reads a job and fills its template
```

Two files are the ones to read first: `src/db/schema.ts` for the data model, and
`src/report/docx-template.ts` for how a template gets filled.
