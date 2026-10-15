<#
.SYNOPSIS
  Converts a MusicXML file (modern notation) into mensural notation in the
  EMS Serenissima font, with text underlay, as partbook and/or choirbook pages
  (HTML + PDF), plus a text file of the key codes.

.DESCRIPTION
  Each part becomes one voice in separate parts, as in a choirbook or partbook. The output is a
  starting point for editing, not a finished edition. Ties, triplets, perfection
  and alteration all need human judgement; anything the script can't map cleanly is
  reported as a warning.

.PARAMETER Path
  .musicxml, .xml or compressed .mxl file (partwise MusicXML).

.PARAMETER Reduction
  How many modern quarter notes equal one semibreve. 2 (default) means the
  edition halved the values: half note = semibreve. Use 4 for unreduced
  transcriptions (whole note = semibreve), 1 for quartered ones.

.PARAMETER Clef
  Optional EMS clef per part, in part order, e.g. -Clef C1,C3,C4,F4.
  Use "auto" for any part to let the script pick the clef that best fits the
  range. Without this, the file's clef is used if EMS has it, else "auto".

.PARAMETER Mensuration
  Optional EMS sign (T1..T9) for the opening, overriding the time signature.

.PARAMETER FontSize / LineWidthInches
  Used to decide where each staff line ends (and the custos goes).

.PARAMETER IncludeFicta
  Also print editorial accidentals (those marked editorial, bracketed or
  parenthesised). Off by default, as they aren't in the original.
  Other accidentals are worked out from each note's pitch against the key
  signature, so they survive transposition.

.PARAMETER Transpose
  Transpose by this many semitones (e.g. -2 = down a tone), key signature
  included. Mensural notation has no sharp key signatures: if the result
  would need one, the signature is left empty and each sharp is printed.

.PARAMETER Parts
  Which parts to convert, by number (1 = first) or name, e.g. -Parts 1,2,3,4
  or -Parts Soprano,Bass. By default all parts except piano / rehearsal
  reductions and other multi-staff parts.

.PARAMETER Barlines
  Put a barline (B) at every modern barline. Off by default.

.PARAMETER Brackets
  Print the edition's ligature brackets (from MusicXML <bracket> directions)
  under the staff. Off by default: the bracket glyphs leave a small gap in the staff.

.EXAMPLE
  .\ConvertTo-Ems.ps1 .\examples\o-quam-gloriosum.mxl
  .\ConvertTo-Ems.ps1 .\josquin.mxl -Reduction 2 -Clef C1,C3,C4,F4 -Mensuration T2
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Path,
  [string]$OutDir,
  [double]$Reduction = 2,
  [string[]]$Clef,
  [string]$Mensuration,
  [double]$FontSize = 36,
  [double]$LineWidthInches = 6.5,
  [string]$Spacer = 'p',
  [switch]$IncludeFicta,
  [switch]$Barlines,
  [switch]$Brackets,
  [int]$Transpose = 0,
  [string[]]$Parts,
  [ValidateSet('partbook', 'choirbook', 'both')][string]$Format = 'both',
  [string]$Initial = 'letter',
  [int]$InitialLines = 2,
  [double]$StaffSize = 0,
  [string[]]$PartNames,
  [string]$Title,
  [string]$Composer,
  [string]$PartbookPage = '8.5x11',
  [string]$ChoirbookPage = '11x17',
  [string[]]$Verso,
  [string[]]$Recto,
  [string]$TextFont = 'EB Garamond',
  [switch]$NoPdf,
  [switch]$Docx,
  [string]$Suffix
)

$ErrorActionPreference = 'Stop'
function Split-List($list) { if ($list) { @($list | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ }) } }
$Clef = Split-List $Clef; $Parts = Split-List $Parts; $PartNames = Split-List $PartNames; $Verso = Split-List $Verso; $Recto = Split-List $Recto
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

# ---------------------------------------------------------------- font facts
$PitchKeys = @('z','s','x','d','c','f','v','g','b','h','n','j','m','k',',')   # position 0..14, bottom line d = 3
$StepIndex = @{ C = 0; D = 1; E = 2; F = 3; G = 4; A = 5; B = 6 }
$EmsClefs = @{   # clef -> staff position of its line, diatonic number of the pitch it names
  C1 = @(3, 28);  C2 = @(5, 28);  C3 = @(7, 28);  C4 = @(9, 28);  C5 = @(11, 28)
  F3 = @(7, 24);  F4 = @(9, 24);  F5 = @(11, 24)
  G1 = @(3, 32);  G2 = @(5, 32)
  'G2-8' = @(5, 25)   # octave treble, as modern tenor parts: G2 sign, G below middle C on the 2nd line
}
# semibreve value -> key for white notes, black (coloured) notes and rests
# (lists of @(value, key), largest first: numeric hashtable keys are unreliable in PowerShell)
$NoteKey  = @(@(8, 'r'), @(4, '1'), @(2, '2'), @(1, '3'), @(0.5, '4'), @(0.25, '5'), @(0.125, '6'), @(0.0625, '8'))
$BlackKey = @(@(4, 'q'), @(2, 'w'), @(1, 'e'), @(0.5, '5'))
$RestKey  = @(@(4, '10'), @(2, '20'), @(1, '30'), @(0.5, '40'), @(0.25, '50'), @(0.125, '60'), @(0.0625, '70'))
# approximate advance widths in em, for line breaking
$Width = @{ note = 0.207; maxima = 0.341; dot = 0.095; flat = 0.111; sharp = 0.161; clef = 0.207; mens = 0.206; custos = 0.206; bar = 0.124; bracket = 0.097; p = 0.065; o = 0.105; i = 0.206 }

$Natural = @(0, 2, 4, 5, 7, 9, 11)                      # semitones of C D E F G A B
$SharpOrder = @(3, 0, 4, 1, 5, 2, 6); $FlatOrder = @(6, 2, 5, 1, 4, 0, 3)
function Get-KeyAlter([int]$fifths, [int]$stepIdx) {
  if ($fifths -gt 0) { if ([array]::IndexOf($SharpOrder, $stepIdx) -lt $fifths) { return 1 } }
  elseif ($fifths -lt 0) { if ([array]::IndexOf($FlatOrder, $stepIdx) -lt -$fifths) { return -1 } }
  0
}
# transposition: semitones -> diatonic steps and key-signature change
$abs = [math]::Abs($Transpose)
$TrDia = [math]::Sign($Transpose) * ([math]::Floor($abs / 12) * 7 + @(0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6)[$abs % 12])
$TrFifths = ((($Transpose * 7) % 12) + 12) % 12; if ($TrFifths -gt 6) { $TrFifths -= 12 }

$script:Warnings = New-Object System.Collections.Generic.List[string]
function Warn([string]$msg) { $script:Warnings.Add($msg) }
function Near([double]$a, [double]$b) { [math]::Abs($a - $b) -lt 1e-6 }

# ---------------------------------------------------------------- load MusicXML
function Read-MusicXml([string]$file) {
  if ([IO.Path]::GetExtension($file) -eq '.mxl') {
    $zip = [IO.Compression.ZipFile]::OpenRead($file)
    try {
      $container = $zip.GetEntry('META-INF/container.xml')
      $rootPath = $null
      if ($container) {
        $cx = New-Object Xml.XmlDocument; $sr = New-Object IO.StreamReader($container.Open()); $cx.LoadXml($sr.ReadToEnd()); $sr.Close()
        $rootPath = ($cx.GetElementsByTagName('rootfile') | Select-Object -First 1).GetAttribute('full-path')
      }
      $entry = if ($rootPath) { $zip.GetEntry($rootPath) } else { $zip.Entries | Where-Object { $_.FullName -notlike 'META-INF/*' -and $_.FullName -match '\.(xml|musicxml)$' } | Select-Object -First 1 }
      $sr = New-Object IO.StreamReader($entry.Open()); $text = $sr.ReadToEnd(); $sr.Close()
    } finally { $zip.Dispose() }
  } else { $text = [IO.File]::ReadAllText($file) }
  $doc = New-Object Xml.XmlDocument
  $doc.XmlResolver = $null    # don't fetch the DTD
  $settings = New-Object Xml.XmlReaderSettings; $settings.DtdProcessing = 'Ignore'; $settings.XmlResolver = $null
  $reader = [Xml.XmlReader]::Create((New-Object IO.StringReader($text)), $settings)
  $doc.Load($reader); $reader.Close()
  if ($doc.DocumentElement.Name -ne 'score-partwise') { throw "Only partwise MusicXML is supported (found <$($doc.DocumentElement.Name)>). Re-export from your notation program." }
  $doc
}

# ---------------------------------------------------------------- mensural values
# Returns a list of @(kind, key) items for a duration in semibreves.
function Get-Values([double]$sb, [bool]$isRest, [bool]$perfectTempus, [string]$where) {
  $table = if ($isRest) { $RestKey } else { $NoteKey }
  foreach ($e in $table) { if (Near $sb $e[0]) { return ,@(,@('val', $e[1])) } }
  if (-not $isRest) {
    if ($perfectTempus -and (Near $sb 3)) { return ,@(,@('val', '2')) }          # perfect breve
    if ($perfectTempus -and (Near $sb 6)) { return ,@(,@('val', '1')) }          # imperfect longa in O
    foreach ($e in $table) { if (Near $sb (1.5 * $e[0])) { return ,@(@('val', $e[1]), @('dot', '.')) } }
    foreach ($e in $BlackKey) { if (Near $sb ($e[0] * 2 / 3)) { return ,@(,@('val', $e[1])) } }  # coloration
  }
  # greedy split: no ties in mensural notation
  $out = @(); $left = $sb
  foreach ($e in $table) { while ($left -ge $e[0] - 1e-6) { $out += ,@('val', $e[1]); $left -= $e[0] } }
  if ($left -gt 1e-6) { Warn "$where : $([math]::Round($sb,4)) semibreves can't be written exactly; $([math]::Round($left,4)) dropped." }
  elseif ($out.Count -gt 1 -and -not $isRest) { Warn "$where : $([math]::Round($sb,4)) semibreves split into $($out.Count) notes (tie or odd value). Check it." }
  ,$out
}

function Get-MensSign([Xml.XmlElement]$time, [double]$reduction) {
  $sym = $time.GetAttribute('symbol')
  if ($sym -eq 'common') { return 'T1' }
  if ($sym -eq 'cut') { return 'T2' }
  $beats = [double](($time.SelectSingleNode('beats').InnerText -split '\+')[0]); $type = [double]$time.SelectSingleNode('beat-type').InnerText
  $measureSb = $beats * 4 / $type / $reduction
  if ($beats -eq 3 -and (Near $measureSb 3)) { return 'T3' }    # tempus perfectum
  if ($beats -eq 3 -and (Near $measureSb 1.5)) { return 'T5' }  # triple proportion
  if ($beats -eq 6) { Warn "Time $beats/$type : the font has no prolatio major sign (C or O with a dot); used C. Override with -Mensuration."; return 'T1' }
  if ($beats -in 2, 4, 1) { return 'T1' }
  Warn "Time $beats/$type has no obvious mensuration sign; used C."; 'T1'
}

# ---------------------------------------------------------------- read one part into events
function Read-Part([Xml.XmlElement]$part, [string]$partName) {
  $events = New-Object System.Collections.Generic.List[object]
  $divisions = 1; $clefInfo = $null; $fifths = 0; $shownFifths = $TrFifths; $voice = $null; $tiePending = $null; $perfect = $false
  if ($shownFifths -gt 0) { $shownFifths = 0 }
  foreach ($measure in $part.SelectNodes('measure')) {
    $mno = $measure.GetAttribute('number'); $edMem = @{}
    foreach ($node in $measure.ChildNodes) {
      switch ($node.Name) {
        'attributes' {
          $d = $node.SelectSingleNode('divisions'); if ($d) { $divisions = [double]$d.InnerText }
          $k = $node.SelectSingleNode('key/fifths')
          if ($k) {
            if ($events.Count -gt 0) { Warn "$partName m.$mno : key change; signature not reprinted, accidentals follow the new key." }
            $fifths = [int]$k.InnerText; $shownFifths = $fifths + $TrFifths
            if ($shownFifths -gt 0) { Warn "$partName : the key needs $shownFifths sharp(s); mensural notation has no sharp signatures, so each sharp is printed on its note. Consider -Transpose."; $shownFifths = 0 }
          }
          $c = $node.SelectSingleNode('clef[not(@number) or @number="1"]')
          if ($c) {
            $oc = $c.SelectSingleNode('clef-octave-change'); $lineNode = $c.SelectSingleNode('line')
            $ci = @{ Sign = $c.SelectSingleNode('sign').InnerText; Line = $(if ($lineNode) { [int]$lineNode.InnerText } else { 0 }); Octave = $(if ($oc) { [int]$oc.InnerText } else { 0 }) }
            if (-not $clefInfo) { $clefInfo = $ci } elseif ($ci.Sign -ne $clefInfo.Sign -or $ci.Line -ne $clefInfo.Line) { Warn "$partName m.$mno : clef change ignored (kept the first clef)." }
          }
          $t = $node.SelectSingleNode('time')
          if ($t -and $t.SelectSingleNode('beats')) {
            $sign = if ($Mensuration -and $events.Count -eq 0) { $Mensuration } else { Get-MensSign $t $Reduction }
            $beats = [double](($t.SelectSingleNode('beats').InnerText -split '\+')[0]); $type = [double]$t.SelectSingleNode('beat-type').InnerText
            $perfect = ($sign -in 'T3', 'T4') -or ($beats -eq 3 -and (Near ($beats * 4 / $type / $Reduction) 3))
            $events.Add(@{ Kind = 'mens'; Code = $sign })
          }
        }
        'direction' {
          if (-not $Brackets) { continue }
          foreach ($br in $node.SelectNodes('direction-type/bracket')) {
            if ($br.GetAttribute('type') -eq 'start') { $events.Add(@{ Kind = 'bracket'; Code = '{' }) }
            elseif ($br.GetAttribute('type') -eq 'stop') { $events.Add(@{ Kind = 'bracketEnd'; Code = '}' }) }
          }
        }
        'note' {
          if ($node.SelectSingleNode('grace')) { Warn "$partName m.$mno : grace note skipped."; continue }
          $v = $node.SelectSingleNode('voice'); $vText = if ($v) { $v.InnerText } else { '1' }
          if (-not $voice) { $voice = $vText }
          if ($vText -ne $voice) { continue }
          if ($node.SelectSingleNode('chord')) { Warn "$partName m.$mno : chord note skipped (one line per part)."; continue }
          $durNode = $node.SelectSingleNode('duration'); if (-not $durNode) { continue }
          $ql = [double]$durNode.InnerText / $divisions
          $fermata = [bool]$node.SelectSingleNode('notations/fermata')
          if ($node.SelectSingleNode('rest')) {
            # consecutive rests merge, so long silences come out as longa + breve rests as in the sources
            $prev = if ($events.Count) { $events[$events.Count - 1] } else { $null }
            if ($prev -and $prev.Kind -eq 'rest') { $prev.QL += $ql } else { $events.Add(@{ Kind = 'rest'; QL = $ql; Where = "$partName m.$mno"; Perfect = $perfect }) }
            $tiePending = $null; continue
          }
          $step = $node.SelectSingleNode('pitch/step').InnerText; $oct = [int]$node.SelectSingleNode('pitch/octave').InnerText
          $altNode = $node.SelectSingleNode('pitch/alter'); $alter = if ($altNode) { [int][math]::Round([double]$altNode.InnerText) } else { 0 }
          $dia0 = $oct * 7 + $StepIndex[$step]
          # editorial (ficta) status: from this note's accidental, or carried from earlier in the bar
          $accNode = $node.SelectSingleNode('accidental')
          if ($accNode) { $edMem[$dia0] = ($accNode.GetAttribute('editorial') -eq 'yes' -or $accNode.GetAttribute('parentheses') -eq 'yes' -or $accNode.GetAttribute('bracket') -eq 'yes') }
          $chromatic = $alter -ne (Get-KeyAlter $fifths $StepIndex[$step])
          $editorial = $chromatic -and $edMem.ContainsKey($dia0) -and $edMem[$dia0]
          # transpose, then compare with the key signature actually printed
          $dia = $dia0 + $TrDia
          $midi = $oct * 12 + $Natural[$StepIndex[$step]] + $alter + $Transpose
          $alter2 = $midi - ([math]::Floor($dia / 7) * 12 + $Natural[(($dia % 7) + 7) % 7])
          $keyAlter2 = Get-KeyAlter $shownFifths ((($dia % 7) + 7) % 7)
          $acc = $null
          if ($alter2 -ne $keyAlter2 -and (-not $editorial -or $IncludeFicta)) {
            if ([math]::Abs($alter2) -gt 1) { Warn "$partName m.$mno : double sharp/flat can't be shown." }
            $acc = if ($alter2 -gt $keyAlter2) { '+' } else { 'b' }
          }
          $ties = @($node.SelectNodes('tie') | ForEach-Object { $_.GetAttribute('type') })
          if ($tiePending -and $ties -contains 'stop' -and $tiePending.Dia -eq $dia) {
            $tiePending.QL += $ql; if ($fermata) { $tiePending.Fermata = $true }
            if ($ties -notcontains 'start') { $tiePending = $null }
            continue
          }
          # first verse of the lyric, if any
          $syl = $null; $lyr = $node.SelectSingleNode('lyric[@number="1"]'); if (-not $lyr) { $lyr = $node.SelectSingleNode('lyric') }
          if ($lyr) {
            $text = (@($lyr.SelectNodes('text') | ForEach-Object { $_.InnerText }) -join ' ').Trim()
            $sy = $lyr.SelectSingleNode('syllabic'); $sy = if ($sy) { $sy.InnerText } else { 'single' }
            if ($text) { $syl = @{ Text = $text; Syllabic = $sy } }
          }
          $ev = @{ Kind = 'note'; Dia = $dia; QL = $ql; Acc = $acc; Fermata = $fermata; Syl = $syl; Where = "$partName m.$mno"; Perfect = $perfect }
          $events.Add($ev)
          $tiePending = if ($ties -contains 'start') { $ev } else { $null }
        }
        'barline' { }
      }
    }
    if ($Barlines) { $events.Add(@{ Kind = 'bar'; Code = 'B' }) }
  }
  if ($Barlines -and $events.Count -and $events[$events.Count - 1].Kind -eq 'bar') { $events.RemoveAt($events.Count - 1) }
  @{ Events = $events; ClefInfo = $clefInfo; Fifths = $shownFifths }
}

# ---------------------------------------------------------------- choose clef
function Get-ClefFit([string]$clefName, $dias) {
  $c = $EmsClefs[$clefName]; $out = 0; $spread = 0
  foreach ($d in $dias) { $p = $c[0] + ($d - $c[1]); if ($p -lt 0 -or $p -gt 14) { $out++ }; $spread += [math]::Abs($p - 7) }
  $out * 1000 + $spread / [math]::Max(1, @($dias).Count)
}
function Select-Clef($info, $dias, [string]$override, [string]$partName) {
  if ($override -and $override -ne 'auto') {
    if (-not $EmsClefs.ContainsKey($override)) { throw "Unknown clef '$override'. Use one of: $($EmsClefs.Keys -join ', ')" }
    return $override
  }
  if (-not $override -and $info -and $info.Octave -eq 0) {
    $name = "$($info.Sign)$($info.Line)"
    if ($EmsClefs.ContainsKey($name)) { return $name }
  }
  $best = $EmsClefs.Keys | Where-Object { $_ -notlike '*-8' } | Sort-Object { Get-ClefFit $_ $dias }, { $_ } | Select-Object -First 1
  $from = if ($info) { "$($info.Sign)$($info.Line)" + $(if ($info.Octave) { " (octave $($info.Octave))" } else { '' }) } else { 'none' }
  Warn "$partName : file clef $from -> chose $best to fit the range. Override with -Clef if the source uses another."
  $best
}

# ---------------------------------------------------------------- build tokens
# A token is one unbreakable unit: a: accidental, g: the sign itself, d: dot/fermata after it,
# k: pitch key (for the custos), s/y: syllable and its MusicXML syllabic type.
function Build-Tokens($parsed, [string]$clefName, [string]$partName) {
  $cl = $EmsClefs[$clefName]
  $keyOf = { param($dia, $where)
    $p = $cl[0] + ($dia - $cl[1])
    if ($p -lt 0 -or $p -gt 14) { Warn "$where : note is off the staff in $clefName (position $p); clamped."; $p = [math]::Max(0, [math]::Min(14, $p)) }
    $PitchKeys[$p] }

  # key-signature flats: every position of that note inside the staff
  $sig = ''
  if ($parsed.Fifths -lt 0) {
    foreach ($step in @('B','E','A','D','G','C','F')[0..(-$parsed.Fifths - 1)]) {
      for ($p = 3; $p -le 11; $p++) { if ((($p - $cl[0] + $cl[1]) % 7 + 7) % 7 -eq $StepIndex[$step]) { $sig += 'b' + $PitchKeys[$p] } }
    }
  }

  $tokens = New-Object System.Collections.Generic.List[object]
  foreach ($e in $parsed.Events) {
    switch ($e.Kind) {
      'mens'       { $tokens.Add([ordered]@{ t = 'm'; g = $e.Code }) }
      'bar'        { $tokens.Add([ordered]@{ t = 'b'; g = 'B' }) }
      'bracket'    { $tokens.Add([ordered]@{ t = 'x'; g = '{' }) }
      'bracketEnd' { $tokens.Add([ordered]@{ t = 'x'; g = '}' }) }
      'rest' {
        foreach ($v in (Get-Values ($e.QL / $Reduction) $true $e.Perfect $e.Where)) { $tokens.Add([ordered]@{ t = 'r'; g = $v[1] + 'g' }) }
      }
      'note' {
        $k = & $keyOf $e.Dia $e.Where
        $first = $true
        foreach ($v in (Get-Values ($e.QL / $Reduction) $false $e.Perfect $e.Where)) {
          if ($v[0] -eq 'dot') { $tokens[$tokens.Count - 1].d += '.' + $k; continue }
          $tk = [ordered]@{ t = 'n'; a = ''; g = $v[1] + $k; d = ''; k = $k }
          if ($first) {
            if ($e.Acc) { $tk.a = $e.Acc + $k }
            if ($e.Syl) { $tk.s = $e.Syl.Text; $tk.y = $e.Syl.Syllabic }
          }
          $tokens.Add($tk); $first = $false
        }
        if ($e.Fermata) { $tokens[$tokens.Count - 1].d += '*' }
      }
    }
  }
  $tokens.Add([ordered]@{ t = 'b'; g = 'E' })
  @{ Head = ($clefName -replace '-8$', ''); Sig = $sig; Tokens = $tokens }
}

# Plain key-code lines (for the .txt and .docx): fixed-width line breaking with custos.
function Build-Lines($built) {
  $sp = $Width[$Spacer]
  $head = $built.Head + $Spacer + $built.Sig + $(if ($built.Sig) { $Spacer } else { '' })
  $headWidth = $Width.clef + $sp * 2 + $Width.flat * ($built.Sig.Length / 2)
  $limit = $LineWidthInches * 72 / $FontSize
  $toks = $built.Tokens
  $lines = @(); $cur = $head; $w = $headWidth
  for ($i = 0; $i -lt $toks.Count; $i++) {
    $tk = $toks[$i]
    $text = "$($tk.a)$($tk.g)$($tk.d)" + $Spacer
    $tw = $(if ($tk.g -like 'r*') { $Width.maxima } else { $Width.note }) + $sp + $Width.flat * ("$($tk.a)".Length / 2) + $Width.dot * ("$($tk.d)".Length / 2)
    $nextKey = $null; for ($j = $i; $j -lt $toks.Count; $j++) { if ($toks[$j].k) { $nextKey = $toks[$j].k; break } }
    if ($tk.g -ne 'E' -and $w + $tw + $Width.custos -gt $limit -and $cur -ne $head) {
      if ($nextKey) { $cur += 'U' + $nextKey }
      $lines += $cur; $cur = $head; $w = $headWidth
    }
    $cur += $text; $w += $tw
  }
  $lines += $cur.TrimEnd($Spacer)
  ,$lines
}

# Latin part labels, as printed in partbooks
function Get-PartLabel([string]$name) {
  $n = $name.ToLower()
  $label = switch -regex ($n) {
    '^(soprano|superius|cantus|discantus|treble)' { 'CANTVS'; break }
    '^(alto|altus|contra|countertenor|mezzo)' { 'ALTVS'; break }
    '^tenor' { 'TENOR'; break }
    '^(bass|bassus|baritone)' { 'BASSVS'; break }
    '^quintus' { 'QVINTVS'; break }
    '^sextus' { 'SEXTVS'; break }
    default { $name.ToUpper().Replace('U', 'V') }
  }
  $num = [regex]::Match($name, '\s(\d|I+V?|V?I*)$').Groups[1].Value
  if ($num) { $label += ' ' + $num.ToUpper() }
  $label
}

# ---------------------------------------------------------------- writers
function Escape-Xml([string]$s) { [Security.SecurityElement]::Escape($s) }

function Write-Docx([string]$file, $parts, [string]$title) {
  $sz = [int]($FontSize * 2)
  $body = New-Object Text.StringBuilder
  [void]$body.Append("<w:p><w:pPr><w:spacing w:after=`"120`"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val=`"32`"/></w:rPr><w:t xml:space=`"preserve`">$(Escape-Xml $title)</w:t></w:r></w:p>")
  foreach ($p in $parts) {
    [void]$body.Append("<w:p><w:pPr><w:keepNext/><w:spacing w:before=`"240`" w:after=`"0`"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t xml:space=`"preserve`">$(Escape-Xml $p.Name)</w:t></w:r></w:p>")
    foreach ($l in $p.Lines) {
      [void]$body.Append("<w:p><w:pPr><w:spacing w:before=`"0`" w:after=`"0`" w:line=`"240`" w:lineRule=`"auto`"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii=`"EMS_Serenissima`" w:hAnsi=`"EMS_Serenissima`" w:cs=`"EMS_Serenissima`"/><w:sz w:val=`"$sz`"/><w:szCs w:val=`"$sz`"/><w14:ligatures w14:val=`"standard`"/></w:rPr><w:t xml:space=`"preserve`">$(Escape-Xml $l)</w:t></w:r></w:p>")
    }
  }
  $docXml = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><w:document xmlns:w=`"http://schemas.openxmlformats.org/wordprocessingml/2006/main`" xmlns:mc=`"http://schemas.openxmlformats.org/markup-compatibility/2006`" xmlns:w14=`"http://schemas.microsoft.com/office/word/2010/wordml`" mc:Ignorable=`"w14`"><w:body>$($body.ToString())<w:sectPr><w:pgSz w:w=`"12240`" w:h=`"15840`"/><w:pgMar w:top=`"1080`" w:right=`"1080`" w:bottom=`"1080`" w:left=`"1080`" w:header=`"720`" w:footer=`"720`" w:gutter=`"0`"/></w:sectPr></w:body></w:document>"
  $files = [ordered]@{
    '[Content_Types].xml' = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    '_rels/.rels' = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
    'word/document.xml' = $docXml
  }
  if (Test-Path $file) { Remove-Item $file -Force }
  $zip = [IO.Compression.ZipFile]::Open($file, 'Create')
  try {
    foreach ($name in $files.Keys) {
      $sw = New-Object IO.StreamWriter($zip.CreateEntry($name).Open(), (New-Object Text.UTF8Encoding $false))
      $sw.Write($files[$name]); $sw.Close()
    }
  } finally { $zip.Dispose() }
}

function Get-PageSize([string]$spec) {
  if ($spec -notmatch '^\s*([\d.]+)\s*x\s*([\d.]+)\s*$') { throw "Page size '$spec' should look like 8.5x11 (inches)." }
  @([double]$matches[1], [double]$matches[2])
}

function Write-Book([string]$file, [string]$format, $data) {
  $template = Join-Path $PSScriptRoot 'book-template.html'
  if (-not (Test-Path $template)) { throw "Missing $template (it must sit next to this script)." }
  $data.format = $format
  $json = ConvertTo-Json -InputObject $data -Depth 10 -Compress
  $html = [IO.File]::ReadAllText($template)
  $html = $html.Replace('/*__DATA__*/null', $json).Replace('__TITLE__', (Escape-Xml "$($data.title) ($format)"))
  [IO.File]::WriteAllText($file, $html, (New-Object Text.UTF8Encoding $false))
}

function Find-Browser {
  foreach ($p in @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
                   "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe")) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  $null
}

function Write-Pdf([string]$html, [string]$pdf) {
  $browser = Find-Browser
  if (-not $browser) { Warn "No Edge or Chrome found, so no PDF. Open the .html and print to PDF instead."; return }
  if (Test-Path $pdf) { Remove-Item $pdf -Force }
  $userDir = Join-Path ([IO.Path]::GetTempPath()) ('ems-pdf-' + [guid]::NewGuid())
  $url = 'file:///' + ($html -replace '\\', '/' -replace ' ', '%20')
  $argList = @('--headless=new', '--disable-gpu', '--no-pdf-header-footer', "--user-data-dir=`"$userDir`"", '--virtual-time-budget=20000', '--run-all-compositor-stages-before-draw', "--print-to-pdf=`"$pdf`"", "`"$url`"")
  $proc = Start-Process -FilePath $browser -ArgumentList $argList -PassThru -WindowStyle Hidden
  if (-not $proc.WaitForExit(90000)) { $proc.Kill(); Warn "Browser timed out writing $pdf." }
  Remove-Item $userDir -Recurse -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path $pdf)) { Warn "PDF was not created ($pdf). Open the .html and print to PDF instead." }
}

# ---------------------------------------------------------------- main
$src = (Resolve-Path $Path).Path
if (-not $OutDir) { $OutDir = Split-Path $src }
$base = Join-Path $OutDir ([IO.Path]::GetFileNameWithoutExtension($src))
$doc = Read-MusicXml $src

$names = @{}
foreach ($sp in $doc.SelectNodes('/score-partwise/part-list/score-part')) {
  $nn = $sp.SelectSingleNode('part-name'); $names[$sp.GetAttribute('id')] = $(if ($nn -and $nn.InnerText.Trim()) { $nn.InnerText.Trim() } else { $sp.GetAttribute('id') })
}
if (-not $Title) {
  $Title = @('/score-partwise/work/work-title', '/score-partwise/movement-title') | ForEach-Object { $doc.SelectSingleNode($_) } |
    Where-Object { $_ -and $_.InnerText.Trim() } | ForEach-Object { $_.InnerText.Trim() } | Select-Object -First 1
  if (-not $Title) { $Title = [IO.Path]::GetFileNameWithoutExtension($src) }
}
if (-not $Composer) { $cn = $doc.SelectSingleNode('/score-partwise/identification/creator[@type="composer"]'); $Composer = if ($cn) { $cn.InnerText.Trim() } else { '' } }
if ($Transpose) { $base += '.transposed' + $(if ($Transpose -gt 0) { '+' } else { '' }) + $Transpose }
if ($Suffix) { $base += '.' + $Suffix }

$outParts = @(); $i = 0; $n = 0
foreach ($part in $doc.SelectNodes('/score-partwise/part')) {
  $n++
  $name = $names[$part.GetAttribute('id')] -replace '\s+', ' '
  if ($Parts) {
    if (-not ($Parts -contains "$n" -or $Parts -contains $name)) { continue }
  } elseif ($name -match 'piano|rehearsal|reduction|keyboard' -or $part.SelectSingleNode('measure/attributes/staves[. > 1]')) {
    Warn "Skipped part $n '$name' (keyboard / reduction). Use -Parts to include it."
    continue
  }
  $parsed = Read-Part $part $name
  $dias = @($parsed.Events | Where-Object { $_.Kind -eq 'note' } | ForEach-Object { $_.Dia })
  $override = if ($Clef -and $i -lt $Clef.Count) { $Clef[$i] } else { $null }
  $clefName = Select-Clef $parsed.ClefInfo $dias $override $name
  $built = Build-Tokens $parsed $clefName $name
  $label = if ($PartNames -and $i -lt $PartNames.Count) { $PartNames[$i] } else { Get-PartLabel $name }
  $outParts += @{ Name = $name; Label = $label; Clef = $clefName; Built = $built; Lines = (Build-Lines $built) }
  $i++
}
if (-not $outParts.Count) { throw "No parts selected." }

$txt = foreach ($p in $outParts) { "== $($p.Name)  [$($p.Clef)]"; $p.Lines; '' }
if ($script:Warnings.Count) { $txt += '== Things to check'; $txt += $script:Warnings }
[IO.File]::WriteAllLines("$base.ems.txt", [string[]]$txt, (New-Object Text.UTF8Encoding $false))
$written = @("$base.ems.txt")
if ($Docx) { Write-Docx "$base.ems.docx" $outParts $Title; $written += "$base.ems.docx" }

# initial: 'letter', 'blank', or an image file embedded in the page
$initialSpec = @{ mode = 'letter'; src = '' }
if ($Initial -eq 'blank') { $initialSpec.mode = 'blank' }
elseif ($Initial -ne 'letter') {
  $img = (Resolve-Path $Initial).Path
  $mime = switch ([IO.Path]::GetExtension($img).ToLower()) { '.png' { 'image/png' } '.jpg' { 'image/jpeg' } '.jpeg' { 'image/jpeg' } '.svg' { 'image/svg+xml' } '.gif' { 'image/gif' } default { throw "Initial image must be .png, .jpg, .svg or .gif" } }
  $initialSpec = @{ mode = 'image'; src = "data:$mime;base64," + [Convert]::ToBase64String([IO.File]::ReadAllBytes($img)) }
}
# choirbook page sides: by default 1st, 3rd, 5th… part on the verso (Cantus, Tenor), the others on the recto
$versoIdx = @(); $rectoIdx = @()
for ($j = 0; $j -lt $outParts.Count; $j++) {
  if ($Verso -or $Recto) {
    if ($Verso -contains "$($j + 1)") { $versoIdx += $j } elseif ($Recto -contains "$($j + 1)") { $rectoIdx += $j } else { Warn "Part $($j + 1) is in neither -Verso nor -Recto; left out of the choirbook." }
  } elseif ($j % 2 -eq 0) { $versoIdx += $j } else { $rectoIdx += $j }
}

$pb = Get-PageSize $PartbookPage; $cb = Get-PageSize $ChoirbookPage
$data = [ordered]@{
  title = $Title; composer = $Composer; format = ''
  opt = [ordered]@{ staffSize = $StaffSize; initial = $initialSpec; initialLines = $InitialLines; textFont = $TextFont
                    partbookPage = $pb; choirbookPage = $cb; verso = $versoIdx; recto = $rectoIdx }
  parts = @($outParts | ForEach-Object { [ordered]@{ name = $_.Name; label = $_.Label; clef = $_.Built.Head; sig = $_.Built.Sig; tokens = $_.Built.Tokens.ToArray() } })
  warnings = $script:Warnings.ToArray()
}
$formats = if ($Format -eq 'both') { @('partbook', 'choirbook') } else { @($Format) }
foreach ($f in $formats) {
  # books go into Partbooks\ and Choirbooks\ next to the other output
  $dir = Join-Path $OutDir $(if ($f -eq 'partbook') { 'Partbooks' } else { 'Choirbooks' })
  New-Item -ItemType Directory -Force $dir | Out-Null
  $stem = Join-Path $dir ("$([IO.Path]::GetFileName($base)).$f")
  Write-Book "$stem.html" $f $data; $written += "$stem.html"
  if (-not $NoPdf) { Write-Pdf "$stem.html" "$stem.pdf"; if (Test-Path "$stem.pdf") { $written += "$stem.pdf" } }
}

Write-Host "Wrote ($($outParts.Count) parts):"; $written | ForEach-Object { Write-Host "  $_" }
if ($script:Warnings.Count) { Write-Host "$($script:Warnings.Count) things to check:"; $script:Warnings | ForEach-Object { Write-Host "  - $_" } }
