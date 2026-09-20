# Contributing

Corrections to the transcription of the method, bug reports, and teaching
examples are all welcome. The project is small and has no dependencies; nothing
here should take more than a few minutes to set up.

## Running it

```bash
git clone https://github.com/gcastellazzi/rapidMQI.git
cd rapidMQI
npm start
```

Then open <http://localhost:8000/app/>. There is nothing to install and nothing
to build: `docs/app/` is plain ES modules, served as they are, so the source you
read is the source that runs. A server is needed only because browsers refuse
ES modules over `file://`.

## Running the tests

```bash
npm test
```

The Node test runner, no framework, Node >= 18. They are expected to pass before
anything is merged, and CI runs them on Linux, macOS and Windows against Node
18, 20 and 22.

## Where things are

| | |
|---|---|
| `docs/app/js/core/tables.js` | The paper, transcribed. Criteria, weights, thresholds. No arithmetic. |
| `docs/app/js/core/mqi.js` | Eq. (1), the categories, and the interval an incomplete survey leaves. |
| `docs/app/js/core/correlate.js` | The six correlation curves of Fig. 10, and the comparison with the code table. |
| `docs/app/js/core/reference.js` | The code table and its multiplication factors. |
| `docs/app/js/core/project.js` | What a survey is made of. Plain data, no DOM. |
| `docs/app/js/app.js` | The interface, and nothing but the interface. |
| `tests/paper.test.js` | The published worked examples. Start here if you doubt a number. |

## If you are correcting a number

Please say which table and which edition of which document it comes from, and
add or amend a test that would have caught it. A wrong digit in `tables.js`
leaves the application working perfectly and answering wrongly, which is the
failure this project most needs to be protected from.

Two deliberate departures from the literal text of the paper are documented in
`tables.js`, in `correlate.js` and in the user guide: the direction of the
category labels of Table 9, and the index at which the shear strength curve is
read. If you disagree with either, the argument belongs in an issue rather than
a silent change.

## Style

- No dependencies, no build step, no framework. This is not austerity for its
  own sake: it is what lets a student read the source that is running.
- Comments explain *why*, and particularly why something is not what a reader
  would expect. The tables are the exception: there, the comment says where the
  number came from.
