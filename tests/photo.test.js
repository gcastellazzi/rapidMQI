/**
 * Screen-only helpers for the photograph view.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { formatScaleLength, scaleBarSpec } from '../docs/app/js/render/photo.js';

test('scale bar uses practical units', () => {
  assert.equal(formatScaleLength(2), '2 m');
  assert.equal(formatScaleLength(0.2), '20 cm');
  assert.equal(formatScaleLength(0.005), '5 mm');
  assert.equal(formatScaleLength(2000), '2 km');
});

test('scale bar switches to a shorter real length when zoomed in', () => {
  const fit = scaleBarSpec({ perMetre: 100, zoom: 1, width: 500 });
  const zoomed = scaleBarSpec({ perMetre: 100, zoom: 20, width: 500 });

  assert.equal(fit.label, '2 m');
  assert.equal(zoomed.label, '20 cm');
  assert.ok(zoomed.width < 500);
});

test('scale bar accounts for its label before choosing a length', () => {
  const spec = scaleBarSpec({
    perMetre: 100,
    zoom: 1,
    width: 120,
    labelWidth: (label) => label.length * 8,
  });

  assert.equal(spec.label, '20 cm');
  assert.ok(spec.width + 6 + spec.label.length * 8 <= 120 - 32);
});
