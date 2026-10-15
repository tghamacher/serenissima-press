# Serenissima Press (beta)

Turn a MusicXML score of Renaissance polyphony into **partbooks** (one voice per page) or a **choirbook** (voices spread across facing pages), in mensural notation with text underlay, set in the [EMS Serenissima](https://www.earlymusicsources.com/) font.

Everything runs in the browser: nothing is uploaded. Save the result as a PDF from the browser's print dialog.

## Using it

1. Open the site and choose a `.musicxml`, `.xml` or `.mxl` file (one voice per part, lyrics included).
2. Pick **Partbook** or **Choirbook**, page size, labels and clefs.
3. Check **Note values**: editions in x/2 time usually keep the original values (whole note = semibreve); editions in x/4 usually halve them (half note = semibreve). The tool guesses; check it.
4. **Print / save as PDF**: choose "Save as PDF", margins "None", and turn on "Background graphics".

A link like `index.html?score=examples/o-quam-gloriosum.mxl&format=choirbook` opens a score directly.

### What it does

- Notes become mensural values (maxima to semifusa); ties merge, triplets become coloration, dotted notes get a dot of addition, and 3-semibreve breves under O are perfect.
- Accidentals are worked out from pitch against the key signature; editorial accidentals (ficta) are left out unless you ask for them. Mensural notation has no sharp key signatures, so sharps are printed on their notes; transposing can help.
- Each line has a clef, signature and custos; staves are justified to full width.
- Initials: in a choirbook, a large decorated initial opens the voice at the top left and smaller ones open the others (engraved or plain capitals, optionally in red); in partbooks each voice opens with the large one. Styles: woodcut (EB Garamond Initials, after Berner's 1592 specimen; it has only A D F G L N O Q T, other letters fall back to a dotted ground), flourished Gothic (Yinit), letter on dotted ground, engraved capital (Libertinus Serif Initials), plain capital, blank frame, your own image, or none.
- The font reaches one ledger line above and below the staff. With **period** clefs (the default), a part that goes further in the edition's clef gets the clef a scribe would have used: a common one (C1, C3, C4, F4, then G2, C2, F3) that keeps every note within reach. This is listed as a note, not a warning.
- **Modern** clefs, for singers learning the notation, set sopranos and altos in treble, tenors in treble an octave lower and basses in F4. A note past the font's reach is drawn from the font's own note, with only the extra ledger lines it needs, copied from the font's first one (the option can be turned off).
- Optionally, ligature brackets marked in the edition (MusicXML brackets) are printed above the staff. Slurs have no place in mensural notation and are not drawn, but they guide the text given to a voice that has none of its own.
- Repeats (with first and second endings) are written out in full by default, or kept as written with the dotted repeat sign.
- Choral scores with two singers on a staff (S+A, T+B) are split into separate voices by pitch, so swapped layers and shared chords still come out right; a lower voice without its own words takes the text sung on its staff.
- Optionally, text sung again straight away is written as "ij" under the first note of the repeat, as in the sources (the longest repeated phrase, up to 8 words).

### Not yet

Mensural ligatures, perfection and alteration beyond simple cases, multiple pieces per book, OMR.

## Files

- `index.html`, `css/`, `js/` — the web tool (`convert.js`: MusicXML to mensural tokens; `layout.js`: page layout; `app.js`: controls; `zip.js`: `.mxl` reader)
- `cheatsheet.html` — keyboard map of the font
- `fonts/` — EMS Serenissima and the initial fonts, with their licences
- `tools/` — the original Windows PowerShell converter (`ConvertTo-Ems.ps1`), which writes HTML/PDF books locally
- `examples/` — a small test score

## Credits

- **Music font:** EMS Serenissima by Elam Rotem, Early Music Sources, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See `fonts/LICENSE-EMS_Serenissima.md`.
- **Text fonts:** EB Garamond and IM Fell French Canon (SIL Open Font License), loaded from Google Fonts.
- **Initials:** EB Garamond Initials by Georg Duffner and Libertinus Serif Initials by the Libertinus Project ([SIL Open Font License 1.1](https://openfontlicense.org), see `fonts/OFL-*.txt`); Yinit by Yannis Haralambous (public domain, see `fonts/LICENSE-Yinit.md`). Shipped unmodified from CTAN.
- When you share a book, credit the editor of the MusicXML edition it was made from.
