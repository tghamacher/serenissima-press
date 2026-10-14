# Serenissima Press (beta)

Turn a MusicXML score of Renaissance polyphony into **partbooks** (one voice per page) or a **choirbook** (voices spread across facing pages), in mensural notation with text underlay, set in the [EMS Serenissima](https://www.earlymusicsources.com/) font.

Everything runs in the browser: nothing is uploaded. Save the result as a PDF from the browser's print dialog.

## Using it

1. Open the site and choose a `.musicxml`, `.xml` or `.mxl` file (one voice per part, lyrics included).
2. Pick **Partbook** or **Choirbook**, page size, labels and clefs.
3. Check **Note values**: editions in x/2 time usually keep the original values (whole note = semibreve); editions in x/4 usually halve them (half note = semibreve). The tool guesses; check it.
4. **Print / save as PDF**: choose "Save as PDF", margins "None", and turn on "Background graphics".

A link like `index.html?score=examples/sample.musicxml&format=choirbook` opens a score directly.

### What it does

- Notes become mensural values (maxima to semifusa); ties merge, triplets become coloration, dotted notes get a dot of addition, and 3-semibreve breves under O are perfect.
- Accidentals are worked out from pitch against the key signature; editorial accidentals (ficta) are left out unless you ask for them. Mensural notation has no sharp key signatures, so sharps are printed on their notes; transposing can help.
- Each line has a clef, signature and custos; staves are justified to full width; a decorated initial opens each voice.
- The font has no ledger lines, so a clef is chosen that keeps every note on the staff.

### Not yet

Mensural ligatures, perfection and alteration beyond simple cases, "ij" repeat signs, multiple pieces per book, OMR.

## Files

- `index.html`, `css/`, `js/` — the web tool (`convert.js`: MusicXML to mensural tokens; `layout.js`: page layout; `app.js`: controls; `zip.js`: `.mxl` reader)
- `cheatsheet.html` — keyboard map of the font
- `fonts/` — EMS Serenissima and its licence
- `tools/` — the original Windows PowerShell converter (`ConvertTo-Ems.ps1`), which writes HTML/PDF books locally
- `examples/` — a small test score

## Credits

- **Music font:** EMS Serenissima by Elam Rotem, Early Music Sources, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See `fonts/LICENSE-EMS_Serenissima.md`.
- **Text fonts:** EB Garamond and IM Fell French Canon (SIL Open Font License), loaded from Google Fonts.
- When you share a book, credit the editor of the MusicXML edition it was made from.
