# Regenerate deterministic demo data and SQL seed from the original MS Lists exports.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$utf8 = [System.Text.UTF8Encoding]::new($false)
function Id([int]$kind, [int]$number) { '00000000-0000-4000-8000-{0:d4}{1:d8}' -f $kind,$number }
function Bool($value) { $value -in @('Pravilno','True','true','1') }
function Nullable($value) { if ([string]::IsNullOrWhiteSpace($value)) { $null } else { $value } }
function Numeric($value) { if ([string]::IsNullOrWhiteSpace($value)) { $null } else { [double]::Parse($value,[Globalization.CultureInfo]::InvariantCulture) } }
function DateValue($value) { if ([string]::IsNullOrWhiteSpace($value)) { $null } else { [DateTime]::Parse($value,[Globalization.CultureInfo]::GetCultureInfo('sl-SI')).ToString('yyyy-MM-dd') } }
$procedures = @(); $products = @(); $links = @(); $index = 0
foreach ($r in (Import-Csv (Join-Path $root 'data/KP_Postopki.csv') -Encoding UTF8)) {
  $index++
  $procedures += [ordered]@{ id=(Id 1 $index); default_order=[int]$r.PrivzetiVrstniRed; name=$r.'Naziv postopka'; code=$r.KodaPostopka; input_type=$r.TipVnosa; instruction=$r.Navodilo; default_unit=(Nullable $r.PrivzetaEnota); group_name=$r.Skupina; active=(Bool $r.Aktiven); internal_note=(Nullable $r.InternaOpomba); affiliation=$r.Pripadnost; sequence_number=[int]$r.ZaporednaStevilka; test_phase=$r.FazaTesta; keywords=(Nullable $r.KljucneBesede); procedure_status=$r.StatusPostopka; visible=$true }
}
$index = 0
foreach ($r in (Import-Csv (Join-Path $root 'data/KP_Artikli.csv') -Encoding UTF8)) {
  $index++
  $products += [ordered]@{ id=(Id 2 $index); name=$r.Naziv; code=$r.Sifra; active=(Bool $r.Aktiven); source=$r.Vir; last_synced_at=(Nullable $r.ZadnjaSinhronizacija); sync_status=(Nullable $r.SyncStatus); manually_locked=(Bool $r.RocnoZakljenjen); note=(Nullable $r.Opomba); visible=$true }
}
$index = 0
foreach ($r in (Import-Csv (Join-Path $root 'data/KP_ArtikelPostopki.csv') -Encoding UTF8)) {
  $index++
  $product = $products | Where-Object { $_.code -eq $r.ArtikelSifra }
  # Postopek is the legacy MS Lists ID, not the ordinal extracted from KP code.
  $procedure = $procedures[[int]$r.Postopek - 1]
  if (!$product -or !$procedure -or $r.Naslov -ne ($product.code + '|' + $procedure.code)) { throw 'Unresolved legacy procedure relationship. Verify MS Lists ID mapping.' }
  $links += [ordered]@{ id=(Id 3 $index); title=$r.Naslov; product_id=$product.id; procedure_id=$procedure.id; sort_order=[int]$r.VrstniRed; required=(Bool $r.Obvezen); min_value=(Numeric $r.MinVrednost); max_value=(Numeric $r.MaxVrednost); nominal_value=(Numeric $r.NominalnaVrednost); photo_required=(Bool $r.SlikaObvezna); poka_yoke=(Bool $r.PokaYoke); unit_override=(Nullable $r.EnotaOverride); instruction_override=(Nullable $r.NavodiloOverride); active=(Bool $r.Aktiven); valid_from=(DateValue $r.VeljaOD); valid_to=(DateValue $r.VeljaDO); visible=$true }
}
$data = [ordered]@{ procedures=$procedures; products=$products; links=$links }
[IO.File]::WriteAllText((Join-Path $root 'src/seed.json'),($data | ConvertTo-Json -Depth 8),$utf8)
function SqlValue($value) {
  if ($null -eq $value) { return 'null' }
  if ($value -is [bool]) { return $value.ToString().ToLowerInvariant() }
  if ($value -is [int] -or $value -is [double]) { return $value.ToString([Globalization.CultureInfo]::InvariantCulture) }
  return "'" + $value.Replace("'", "''") + "'"
}
$sql = "-- Generated from data/*.csv. Run AFTER 001_schema.sql. Existing records are preserved.`nBEGIN;`n"
foreach ($pair in @(@('rbo_postopki',$procedures),@('rbo_artikli',$products),@('tl_rbo_artikel_postopki',$links))) {
  foreach ($row in $pair[1]) {
    $columns = $row.Keys -join ', '
    $values = ($row.Values | ForEach-Object { SqlValue $_ }) -join ', '
    $sql += "INSERT INTO public.$($pair[0]) ($columns) VALUES ($values) ON CONFLICT DO NOTHING;`n"
  }
}
$sql += "COMMIT;`n"
[IO.File]::WriteAllText((Join-Path $root 'supabase/002_seed.sql'),$sql,$utf8)
Write-Output "Generated $($procedures.Count) procedures, $($products.Count) products and $($links.Count) relationships."
