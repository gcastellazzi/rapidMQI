# rapidMQI

**[Open the application →](https://gcastellazzi.github.io/rapidMQI/app/)**  ·  **[User guide →](https://gcastellazzi.github.io/rapidMQI/)**

The **Masonry Quality Index** of Borri and De Maria, read off a photograph of the wall. Load or
take a picture, give it a scale from one known distance, and answer seven questions about how the
wall was built. The software returns the index for vertical, in-plane and out-of-plane actions,
the category A / B / C for each, and the mechanical properties the published correlation curves
give — with the estimate checked against the row of the code table the wall is declared to be.

Written for the master's courses **MHMS** (Mechanics of Historical Masonry Structures) and **HMWS**
(Historical Masonry and Wooden Structures) at the University of Bologna.

There is **nothing to install and no licence to buy**: it is a static web page, plain ES modules
with no build step and no dependencies, so the source a student reads is exactly the source that
runs. It works on a phone held up against the wall, and keeps working with no network.

## The method

> A. Borri, M. Corradi, G. Castori, A. De Maria (2015). *A method for the analysis and
> classification of historic masonry.* Bulletin of Earthquake Engineering 13:2647–2665.
> DOI [10.1007/s10518-015-9731-4](https://doi.org/10.1007/s10518-015-9731-4)

Seven parameters, each judged Fulfilled, Partially fulfilled or Not fulfilled; six of them added,
the seventh a multiplier:

```
MQI = SM (SD + SS + WC + HJ + VJ + MM)
```

evaluated three times, because the weights of Table 8 differ for vertical, in-plane and
out-of-plane actions. The index runs from 0 to 10 in every case.

| | | V | I | O |
|---|---|---:|---:|---:|
| **SM** | Mechanical properties and conservation state of the elements | ×1 | ×1 | ×1 |
| **SD** | Dimensions of the elements | 1 | 1 | 1 |
| **SS** | Shape of the elements | 3 | 2 | 2 |
| **WC** | Wall leaf connections | 1 | 2 | 3 |
| **HJ** | Horizontality of bed joints | 2 | 1 | 2 |
| **VJ** | Staggering of vertical joints | 1 | 2 | 1 |
| **MM** | Mortar properties | 2 | 2 | 1 |

## What it does

- **The seven parameters, one at a time**, each with the criteria of the paper in front of you,
  filtered to stone or brick masonry, and with what each answer is worth in all three loading
  conditions shown beside it.
- **Three views of the wall.** The face, a section through the thickness, and a typical block,
  each with its own photograph, its own scale and its own marks -- because a section is
  photographed from a different distance than a face, and measuring one with the other's scale
  would be nonsense. M<sub>l</sub> for the leaf connection is measured on the section, where the
  paper says it is measured.
- **A drawing when there is nothing to photograph.** Most walls expose no section at all. For the
  section and for the block, the application offers three diagrams -- one for each outcome -- and
  picking the one the wall is understood to be assesses the parameter and records the drawing.
  It is an inference rather than an observation, and it is labelled as one everywhere it appears.
- **Measurement on the photograph.** One known distance sets the scale. The ruler measures blocks
  and reports the **median** against the 20 cm and 40 cm thresholds, because Table 2 asks about
  more than half of the elements. The path tool traces the shortest route through the mortar
  joints and divides it by the straight distance, which is the **minimum length ratio M<sub>l</sub>**
  that decides WC on a visible section and VJ on the wall face.
- **Not determinable is an answer.** A parameter that cannot be seen can be left open, and the
  index is then reported as the interval it is known to lie in, with the category as an interval
  too when the unknown reaches that far. The application says which missing observation would
  close the widest part of it.
- **Classification** A / B / C for each loading condition, against the thresholds of Table 9.
- **Mechanical properties** f<sub>m</sub>, τ<sub>0</sub>, E and G from the correlation curves of
  Fig. 10, drawn as bands with this wall marked on them, never as a single number.
- **Comparison with the code table** by overlap of the two bands, so that a disagreement between
  the declared typology and the survey is visible instead of averaged away.
- **A building, not a wall.** Several panels in one survey, with a comparative table.
- **One file.** The survey is JSON with the photographs inside it; the report prints two sheets
  per wall -- the data sheet of the paper's own worked examples, with the photographs carrying the
  marks that were made on them, and then the results: the indices, the category bars, the
  breakdown, the properties and the comparison with the code table.

## Checked against the paper

The three worked data sheets of the paper are in the test suite:

- **Fig. 12**, the perfectly cut stone wall, is reproduced exactly: 8.5 / 9.0 / 9.5, A / A / A,
  f<sub>m</sub> 6.25–9.15 MPa, τ<sub>0</sub> 0.133–0.182 MPa, E 2400–3290 MPa.
- **Fig. 14**, the un-coursed random stone wall, is reproduced exactly: 2.5 / 2.5 / 2.0, B / C / C,
  and its properties.
- **Table 12**, fourteen rows of published shear strength bounds, is reproduced to the last
  decimal printed.
- **Fig. 13**, the header-bond brick wall, is reproduced for out-of-plane actions only. Its
  printed outcomes give 6.5 and 5.5 through Eq. (1) for the other two, where the sheet prints 1.3
  and 0.55. The disagreement is recorded in `tests/paper.test.js` and nothing in the application
  bends to make it come out.

## Two places where this application does not follow the paper literally

Both are argued in the code and in the [user guide](https://gcastellazzi.github.io/rapidMQI/#decisions).

1. **Table 9 is printed with its column headers in the order A, B, C above ranges that run the
   other way.** Read literally, MQI = 8.5 would be category C, which contradicts the text and the
   paper's own Fig. 12. rapidMQI classifies C low and A high.
2. **The shear strength is read at the in-plane index.** The axis of Fig. 10b says vertical, but
   all three data sheets read τ<sub>0</sub> at the in-plane index. The application follows the
   data sheets and offers a switch for the other reading.

## Running it

Nothing is needed to *use* it — open the link. To run it locally, or to work on it:

```bash
npm start
```

then open <http://localhost:8000/app/>. That is `node:http` and forty lines; there are no
dependencies to install. The tests are the Node test runner:

```bash
npm test
```

## Repository

```
docs/            what GitHub Pages serves
  index.html     the user guide
  css/ui-kit.css the house style, vendored from aLOTofImaginArches
  app/           the application
    js/core/     the method: tables, the index, the correlations, the survey model
    js/render/   the photograph, the charts and the hypothesis drawings
tests/           the Node test suite, including the paper's worked examples
tools/serve.js   a static server, standard library only
```

`docs/app/js/core/tables.js` is the paper, transcribed and nothing else: a reader with the article
open can check it line by line against Tables 1 to 9. The arithmetic is in `mqi.js`, the
correlation curves in `correlate.js`, the code table in `reference.js`.

## Citing

The method is not ours — cite Borri et al. (2015), above. For the software there is a
`CITATION.cff` in this repository.

## Licence

MIT. The interface kit is shared, byte for byte, with
[aLOTofImaginArches](https://github.com/gcastellazzi/aLoTiA).
