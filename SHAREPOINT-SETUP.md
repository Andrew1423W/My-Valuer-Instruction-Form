# SharePoint setup — Valuation Instruction Form

The form saves every job to a SharePoint list and uses it for two features:

- **Job Archive** — browse/search past jobs.
- **Returning-client autofill** — when you enter a client's name or phone, it
  offers to fill in their saved contact details (and lists their properties to
  choose from).

For these to work, a list called **`Valuation Instructions`** must exist on the
**MyValuer** site (`https://myvaluer.sharepoint.com/sites/MyValuer`) with the
columns below.

---

## Option A — Run the setup script (fastest, for IT/admin)

The included [`sharepoint-setup.ps1`](./sharepoint-setup.ps1) creates the list
and all columns in one go (and is safe to re-run).

1. Install PnP PowerShell once (normal user):
   ```powershell
   Install-Module PnP.PowerShell -Scope CurrentUser
   ```
2. In PowerShell 7, from this folder:
   ```powershell
   ./sharepoint-setup.ps1
   ```
3. Sign in with your My Valuer Microsoft account when prompted.

---

## Option B — Add the columns by hand (no PowerShell needed)

1. Go to the **MyValuer** SharePoint site.
2. **+ New → List → Blank list**, name it exactly **`Valuation Instructions`**.
3. The list already has a **Title** column — that's used for the **property
   address** (you can rename its display to "Property Address", but leave the
   internal name as Title).
4. Add each column below with **+ Add column**. Use **Single line of text** for
   every column **except** the three marked *Multi-line*, which should be
   **Multiple lines of text**.

> ⚠️ The names must match **exactly** (no spaces, same capitalisation), because
> the form looks them up by these internal names.

| Column name        | Type            |
|--------------------|-----------------|
| InstructionDate    | Single line     |
| TakenBy            | Single line     |
| AllocatedTo        | Single line     |
| VOSOrderNo         | Single line     |
| PropertyType       | Single line     |
| Purpose            | **Multi-line**  |
| InstructorName     | Single line     |
| InstructorPhone    | Single line     |
| ClientName         | Single line     |
| ClientEmail        | Single line     |
| ClientPhone        | Single line     |
| ClientAddress      | Single line     |
| Borrower           | Single line     |
| LegalDescription   | **Multi-line**  |
| TitleNo            | Single line     |
| Area               | Single line     |
| AppointmentName    | Single line     |
| AppointmentPhone   | Single line     |
| DueDate            | Single line     |
| MarketFee          | Single line     |
| InsuranceFee       | Single line     |
| ValuationNotes     | **Multi-line**  |
| LandValue          | Single line     |
| CapitalValue       | Single line     |
| CouncilRates       | Single line     |
| IsQuote            | Single line     |

---

## Notes

- If the list **already exists** with most of these columns, you only need to
  add the missing one — most likely **`ClientAddress`** (added for the
  returning-client autofill). The form is built to keep working even if
  `ClientAddress` is absent; it just won't store/fill the address until you add
  it.
- Dates and fees are stored as plain text so the values round-trip exactly as
  typed in the form — that's intentional, keep them as Single line of text.
- The site URL and list name are configurable at the top of
  `sharepoint-setup.ps1` if they ever change.
