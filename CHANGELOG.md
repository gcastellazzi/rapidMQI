# Changelog

All notable changes to rapidMQI are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] -- unreleased

The first working version: a survey can be taken, saved, reopened and printed.

### Added

- **The method**, transcribed from Borri, Corradi, Castori and De Maria (2015):
  the criteria of Tables 1 to 7, the numerical values of Table 8, the category
  thresholds of Table 9, the code reference values of Table 10 and the
  multiplication factors of Table 11, in `docs/app/js/core/tables.js` and
  `reference.js`, separate from any arithmetic.
- **The index**, Eq. (1), for the three loading conditions, with the category
  of each.
- **The interval.** A parameter may be left not determinable, and the index is
  then reported as the interval it is known to lie in, with the category as an
  interval where the unknown reaches that far, and with the leverage of each
  missing observation.
- **Mechanical properties** from the six correlation curves of Fig. 10, drawn
  as bands, with the comparison against a declared row of the code table done
  by overlap.
- **The photograph**: zoom, pan and pinch; a scale from one known distance; a
  ruler that reports the median block dimension against the thresholds of
  Table 2; a path tool that computes the minimum length ratio M_l and says
  which outcome it implies; marks tied to the parameter they justify.
- **Projects** of several panels, with a comparative table.
- **Files**: one JSON survey with the photographs inside it, a working copy
  kept in the browser, and a printed data sheet in the form of the paper's own
  worked examples.
- **Tests**, including the three published data sheets and the fourteen rows of
  Table 12.

### Decided

- **The labels of Table 9 are used the right way round.** As printed, the table
  carries A, B, C above ranges running from the lowest index to the highest,
  which would make the paper's own Fig. 12 a category C masonry. C is the
  lowest band here and A the highest.
- **The shear strength is read at the in-plane index**, as all three data
  sheets of the paper do, rather than at the vertical one the axis of Fig. 10b
  names. A switch offers the other reading.
- **Fig. 13 is not reproduced for vertical and in-plane actions**, and is not
  worked around. Eq. (1) on its printed outcomes gives 6.5 and 5.5 where the
  sheet prints 1.3 and 0.55; the disagreement is recorded in the test suite.

### Known gaps

- The reference table is the 2009 edition of the Italian code commentary, which
  is the one the correlation curves were fitted on. The 2019 edition is not
  transcribed yet.
- There are no example surveys shipped with the application.
