<#
  My Valuer — Valuation Instruction Form
  ---------------------------------------------------------------------------
  Sets up the SharePoint list that powers the form's Job Archive and the
  returning-client autofill. It creates (or updates) the "Valuation
  Instructions" list on the MyValuer site with every column the form
  reads and writes. Safe to re-run — existing columns are skipped.

  PREREQUISITES
  -------------
  1. PnP PowerShell (one-time install, run PowerShell as a normal user):
         Install-Module PnP.PowerShell -Scope CurrentUser
  2. You must be a site owner / admin on the MyValuer site.

  HOW TO RUN
  ----------
  1. Open PowerShell 7 (pwsh).
  2. cd into the folder containing this file.
  3. Run:   ./sharepoint-setup.ps1
  4. Sign in with your My Valuer Microsoft account when prompted.

  If you cannot run PowerShell, see SHAREPOINT-SETUP.md for how to add the
  same columns by hand in the SharePoint web interface.
#>

param(
    [string]$SiteUrl  = "https://myvaluer.sharepoint.com/sites/MyValuer",
    [string]$ListName = "Valuation Instructions"
)

# Column internal name => type.  Text = single line, Note = multiple lines.
# These names MUST match exactly what the form sends to Microsoft Graph.
$columns = [ordered]@{
    InstructionDate  = "Text"
    TakenBy          = "Text"
    AllocatedTo      = "Text"
    VOSOrderNo       = "Text"
    PropertyType     = "Text"
    Purpose          = "Note"
    InstructorName   = "Text"
    InstructorPhone  = "Text"
    ClientName       = "Text"
    ClientEmail      = "Text"
    ClientPhone      = "Text"
    ClientAddress    = "Text"
    Borrower         = "Text"
    LegalDescription = "Note"
    TitleNo          = "Text"
    Area             = "Text"
    AppointmentName  = "Text"
    AppointmentPhone = "Text"
    DueDate          = "Text"
    MarketFee        = "Text"
    InsuranceFee     = "Text"
    ValuationNotes   = "Note"
    LandValue        = "Text"
    CapitalValue     = "Text"
    CouncilRates     = "Text"
    IsQuote          = "Text"
}

Write-Host "Connecting to $SiteUrl ..." -ForegroundColor Cyan
Connect-PnPOnline -Url $SiteUrl -Interactive

# Create the list if it doesn't already exist.
$list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
if (-not $list) {
    Write-Host "Creating list '$ListName' ..." -ForegroundColor Yellow
    $list = New-PnPList -Title $ListName -Template GenericList -OnQuickLaunch
}
else {
    Write-Host "List '$ListName' already exists." -ForegroundColor Green
}

# The built-in Title column is used for the property address.
try {
    Set-PnPField -List $ListName -Identity "Title" -Values @{ Title = "Property Address" } -ErrorAction SilentlyContinue | Out-Null
}
catch { }

# Add each column if it is missing.
foreach ($name in $columns.Keys) {
    $type = $columns[$name]
    $existing = Get-PnPField -List $ListName -Identity $name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host ("  = {0,-17} ({1}) already exists — skipped" -f $name, $type)
        continue
    }
    Add-PnPField -List $ListName -DisplayName $name -InternalName $name -Type $type -AddToDefaultView | Out-Null
    Write-Host ("  + {0,-17} ({1}) created" -f $name, $type) -ForegroundColor Green
}

Write-Host "`nDone. The '$ListName' list is ready for the instruction form." -ForegroundColor Cyan
