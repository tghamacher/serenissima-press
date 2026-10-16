# Serenissima Press

**[Open Serenissima Press](https://tghamacher.github.io/serenissima-press/)** · version 0.11.0 (beta) · [Release notes](#release-notes) · [Feedback](#feedback)

Turn a MusicXML score of Renaissance polyphony into **partbooks** (one voice per book) or a **choirbook** (voices spread across facing pages), in mensural notation with text underlay, set in the [EMS Serenissima](https://www.earlymusicsources.com/) font.

## About

Singers of Renaissance music almost always sing from modern editions: barlines, modern clefs, notes and rests as they are written today. The music was first sung from something quite different. Each singer read only their own part, in white mensural notation, from a partbook or from a large choirbook shared by the whole choir. Learning to read from that notation changes how the music feels: no bars, long phrases, and the text placed by the singer.

Serenissima Press makes such books from the editions people already have. You give it a MusicXML file exported from Finale, Sibelius, MuseScore or Dorico, or downloaded from a site such as CPDL. It sets each voice in mensural notation, in the style of a Renaissance print, ready to print or save as a PDF.

- **For ensembles and teachers:** reading copies for workshops and rehearsals, so singers can learn the notation on music they already know.
- **Period or comfortable:** period clefs as a scribe would have chosen them, or modern clefs while singers learn the shapes of the notes.
- **Private:** everything runs in your browser and the score never leaves your computer.

It is in **beta**: the result is a good starting point, but check ties, perfection, ficta and text underlay against your source.

## Using it

1. Open the [site](https://tghamacher.github.io/serenissima-press/) and choose one or more `.musicxml`, `.xml` or `.mxl` files (one voice per part, lyrics included). Each file is a piece of the book; add more at any time and put them in order.
2. Pick **Partbook** or **Choirbook**, page size, orientation (portrait or landscape) and margins, labels and clefs.
3. Check **Note values**: editions in x/2 time usually keep the original values (whole note = semibreve); editions in x/4 usually halve them (half note = semibreve). The tool guesses; check it.
4. **Print / save as PDF**: choose "Save as PDF", margins "None", and turn on "Background graphics".

The settings are in groups you can open and close; the editor can be light, dark or follow your system (the pages always stay paper-coloured, as they will print).

A link like `index.html?score=examples/o-quam-gloriosum.mxl&format=choirbook` opens a score directly; repeat `score=` to open several.

### What it does

- **Notes and rests:** notes become mensural values (maxima to semifusa); ties merge, triplets become coloration, dotted notes get a dot of addition, and 3-semibreve breves under O are perfect.
- **Accidentals:** worked out from pitch against the key signature; editorial accidentals (ficta) are left out unless you ask for them. Mensural notation has no sharp key signatures, so sharps are printed on their notes; transposing can help.
- **Lines:** each line has a clef, signature and custos; staves are justified to full width.
- **Initials:** in a choirbook, a large decorated initial opens the voice at the top left and smaller ones open the other voices and any sections set to start a new line or page (plain capitals by default, optionally in red); in partbooks each voice opens with the large one. Styles: woodcut (EB Garamond Initials, after Berner's 1592 specimen; it has only A D F G L N O Q T, other letters fall back to a dotted ground), flourished Gothic (Yinit), letter on dotted ground, plain capital, blank frame, your own image, or none.
- **Clefs:** the font reaches one ledger line above and below the staff. With **period** clefs (the default), a part that goes further in the edition's clef gets the clef a scribe would have used: a common one (C1, C3, C4, F4, then G2, C2, F3) that keeps every note within reach. This is listed as a note, not a warning. **Modern** clefs, for singers learning the notation, set sopranos and altos in treble, tenors in treble an octave lower and basses in F4. A note past the font's reach is drawn from the font's own note, with only the extra ledger lines it needs, copied from the font's first one (the option can be turned off).
- **Page turns:** in a choirbook the page is turned only where every singer has reached the same point: each opening ends at the last bar every voice reaches on it, and the music runs on from opening to opening.
- **Choirbook pages are ruled alike:** at a given staff size every page has the same staves at the same places, as in a ruled choirbook. The voices on a page share them, a busier voice taking more, and when one page is full its lowest voice runs on at the foot of the facing page, below that page's lowest part, under its own name.
- **Ruled staves, optionally:** the staves the music leaves empty (at the foot of a choirbook page, or after the end of a piece in a partbook) can be ruled all the same, as in a manuscript, whose pages were ruled before the music was copied. Printed books left the space blank.
- **Sections:** the edition's double and final barlines mark sections (Kyrie I, Christe, …), each ending with a double bar, named from the edition or from their first words. Under **Sections** each can run on (the default), start a new line with its own initial and name, or start a new page (a new opening in a choirbook). A voice silent through a section that starts a new line or page gets a direction such as "Benedictus tacet", as in Morales's *Liber primus missarum* (Rome, 1544).
- **Several pieces:** a book can hold several pieces. Each partbook holds its voice of every piece that has it (a piece without that voice is left out, as with a Quintus book); in printed partbooks a piece follows on below the last, or on a new page if you prefer. In a choirbook each piece starts a new opening, with the piece's title and composer as running heads.
- **Numbering, title page and index:** as in the sources, partbooks are numbered by page in the outer corner (as Gardano numbered his) and choirbooks by leaf, on each right-hand page; in Arabic or Roman numerals, or not at all. An optional title page gives each partbook its own, headed by its voice, as the Venetian printers did, with your imprint at the foot; with several pieces, an index at the back lists them with their pages or folios.
- **Voice names:** at the head of each voice, where a piece begins and on later pages or openings; either can be left off.
- **Staff size:** automatic in a choirbook means the largest staff that keeps each piece (and each section set to start a new opening) on one opening, but never smaller than 56 px, so a long part runs on to more openings rather than shrinking the book. A partbook keeps a comfortable size (56 px, text about 11 pt) and runs on to as many pages as it needs. Either can be set by hand.
- **Page sizes:** small ones as well as the usual: Octavo (about 11 × 17 cm, as the Parisian chanson books of Le Roy & Ballard) and Quarto (about 16 × 22 cm, as the Venetian partbooks of Gardano and Scotto), both usually oblong, so choose Landscape; A5 and Half Letter; Letter, Legal and A4; Tabloid and A3. On a small page an automatic partbook staff shrinks (to no less than 36 px) so a page still holds several lines.
- **Margins:** narrow, normal or wide, a "book" setting after the proportions of printed books (narrowest at the binding, deepest at the foot), or your own top, bottom, inside and outside margins, in inches or, for A4 and A3, millimetres. Inside and outside are mirrored on left- and right-hand pages; in a choirbook the inside is the fold of the opening.
- **Ligature brackets:** optionally, ligature brackets marked in the edition (MusicXML brackets) are printed above the staff. Slurs have no place in mensural notation and are not drawn, but they guide the text given to a voice that has none of its own.
- **Repeats** (with first and second endings) are written out in full by default, or kept as written with the dotted repeat sign.
- **Choral scores** with two singers on a staff (S+A, T+B) are split into separate voices by pitch, so swapped layers and shared chords still come out right; a lower voice without its own words takes the text sung on its staff.

### Not yet

Mensural ligatures, perfection and alteration beyond simple cases, signatures (gathering marks), OMR.

## Feedback

Found something wrong, or have an idea? Use **Feedback** at the top of the site, which opens a [short form](https://docs.google.com/forms/d/e/1FAIpQLSdOzA7OsIG92L_Q-5JG_uj7DHMB-S9Wzs99goDaJxpbmdZs0g/viewform) (no account needed). "Report a problem with this score", under the preview, fills in the version and your settings for you. If you can share the score, add a link to it (Google Drive, Dropbox, CPDL, …).

If you have a GitHub account you can also [open an issue](https://github.com/tghamacher/serenissima-press/issues/new/choose); attach the score there, renamed from `.mxl` to `.zip`, as GitHub doesn't accept `.mxl` files.

## Release notes

Versions are numbered 0.*feature*.*fix* while the tool is in beta: a release with new features raises the middle number, a release of fixes only raises the last.

### 0.11.0 (2026-10-16)

- **Choirbook pages ruled alike:** at a given staff size every page has the same staves at the same places. The voices on a page share them, a busier voice taking more, and when a page is full its lowest voice runs on at the foot of the facing page, below that page's lowest part. Automatic staves are never smaller than 56 px; a part too long for that runs on to more openings.
- **Rule the unused staves** (optional, both formats): the staves the music leaves empty are drawn all the same, as in a manuscript ruled before the music was copied. Printed books left the space blank.
- The title page shrinks its text to fit, so an imprint is no longer cut off on a small landscape page.

### 0.10.0 (2026-10-16)

- **Smaller page sizes:** Octavo (about 11 × 17 cm, as Le Roy & Ballard's chanson books) and Quarto (about 16 × 22 cm, as the Venetian partbooks), with a hint that both were usually oblong; A5 and Half Letter. The page menu is grouped by size.
- On a small page an automatic partbook staff shrinks (to no less than 36 px) so a page still holds several lines.

### 0.9.0 (2026-10-16)

- **Margins:** narrow, normal or wide presets, a "book" preset after the proportions of printed books (narrowest at the binding, deepest at the foot), or custom top, bottom, inside and outside margins, in inches or (for A4 and A3) millimetres. Inside and outside are mirrored on left- and right-hand pages; in a choirbook the inside is the fold of the opening. Each format keeps its own.

### 0.8.1 (2026-10-16)

- The engraved capital initials are withdrawn; the other voices' and sections' initials default to the plain capital. The Libertinus Serif Initials font is no longer shipped.

### 0.8.0 (2026-10-16)

- **Several pieces in one book:** add files at any time, reorder or remove them; each keeps its own title, voices, sections, note values and transposition. Each partbook holds its voice of every piece that has it (a piece without that voice is left out, as with a Quintus book), the pieces following on below each other or on a new page; in a choirbook each piece starts a new opening.
- **Sections in both formats:** each can run on, start a new line with its own initial and name, or start a new page or opening. A voice silent through such a section gets a direction such as "Benedictus tacet", as in Morales's *Liber primus missarum* (1544).
- **Numbering, title page and index,** after the period books: partbooks numbered by page in the outer corner, choirbooks by leaf on the right-hand page, in Arabic or Roman numerals or not at all; an optional title page (one per partbook, headed by its voice) with an imprint; an index of the pieces at the back. Running heads give each piece's title and composer in a choirbook.
- **Voice names** at the head of the music can be left off where a piece begins, on later pages, or both.
- **Editor:** the settings are in groups that open and close; a light, dark or system theme (the pages stay paper-coloured).
- The "ij" option is withdrawn until it has been tested further.
- Fix: a long composer name no longer wraps under the title line.

### 0.7.0 (2026-10-15)

- **Orientation:** partbooks and choirbooks can be set portrait or landscape, each with its own setting; the PDF follows it.

### 0.6.1 (2026-10-15)

- Choirbooks no longer start sections or movements on a new opening by default: the music runs on from opening to opening, still turning only at a bar every voice has reached. Tick a section under **Sections** to start it on a new opening.

### 0.6.0 (2026-10-15)

- **Page turns in choirbooks:** the page is turned only where every singer has reached the same point. Sections are found from the edition's double and final barlines and named from the edition or from their first words. Sections share an opening while every voice has room, and a section too long for one opening is turned at a bar every voice has reached. A new **Sections** list lets you rename them and choose which must start a new opening.
- Each section ends with a double bar and starts with its own initial; a voice that rests through a whole section leaves it out.
- **Partbooks** keep a comfortable staff size and run on to as many pages as they need, instead of shrinking a voice to fit one page. "Fit to page" is now "Automatic".
- **Feedback:** a feedback form, no account needed, linked from the site; "Report a problem with this score" fills in the version and settings. Issue forms on GitHub, and a link to the repository on the site. The version is shown next to the title.
- Fix: in a choirbook, voices could reach the end of a page at different points in the music.

### 0.5.0 (2026-10-15)

- **Clefs:** "Period" (the default) prefers the common period clefs and reports clef changes as one note instead of warnings. "Modern" sets treble, octave treble and bass clefs for learners.
- Notes past the font's one built-in ledger line are drawn from the font's own note signs, with only the extra ledger lines they need.
- Optional ligature brackets from the edition, drawn above the staff; slurs guide text borrowed by untexted voices.
- New example: Victoria's *O quam gloriosum*.

### 0.4.0 (2026-10-15)

- **Choral scores:** a staff shared by two singers (S+A, T+B) is split into two voices by pitch; a lower voice without words takes the staff's text.
- **Repeats** are written out in full, with first and second endings and the right verse on each pass, or kept as written with the dotted repeat sign.
- Notes are placed by time, so gaps in a voice become rests.
- Fix: a stray hyphen after a one-letter first syllable taken by the initial.

### 0.3.0 (2026-10-14)

- **Custom staff size**, from 16 to 160 px.
- **"ij" repeat signs:** text sung again straight away can be written as "ij", as in period sources.

### 0.2.1 (2026-10-14)

- A prefatory incipit staff (original clef and mensuration over an invisible rest) is no longer printed; its clef and signs are used for the voice.
- Repeated warnings are shown once.

### 0.2.0 (2026-10-14)

- **Decorated initials:** woodcut, flourished Gothic and engraved styles. A choirbook opens with a large initial for the first voice and smaller ones, optionally red, for the others.

### 0.1.0 (2026-10-14)

- First beta: MusicXML to mensural partbooks and choirbooks in EMS Serenissima, with text underlay, printing to PDF. Includes the font cheat sheet and the original PowerShell converter.

## Files

- `index.html`, `css/`, `js/` — the web tool (`convert.js`: MusicXML to mensural tokens; `layout.js`: page layout; `app.js`: controls; `zip.js`: `.mxl` reader)
- `cheatsheet.html` — keyboard map of the font
- `fonts/` — EMS Serenissima and the initial fonts, with their licences
- `tools/` — the original Windows PowerShell converter (`ConvertTo-Ems.ps1`), which writes HTML/PDF books locally
- `examples/` — Victoria's *O quam gloriosum*, the sample score

## Credits

- **Music font:** EMS Serenissima by Elam Rotem, Early Music Sources, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See `fonts/LICENSE-EMS_Serenissima.md`.
- **Text fonts:** EB Garamond and IM Fell French Canon (SIL Open Font License), loaded from Google Fonts.
- **Initials:** EB Garamond Initials by Georg Duffner ([SIL Open Font License 1.1](https://openfontlicense.org), see `fonts/OFL-EBGaramond-Initials.txt`); Yinit by Yannis Haralambous (public domain, see `fonts/LICENSE-Yinit.md`). Shipped unmodified from CTAN.
- When you share a book, credit the editor of the MusicXML edition it was made from.
