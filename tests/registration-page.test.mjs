import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

await import('../src/content/registration-adapter.js');

const fixture = readFileSync(new URL('./fixtures/registration-page.html', import.meta.url), 'utf8');

test('maps CT112 to its enclosing group selector without a generated id', () => {
  const document = new JSDOM(fixture).window.document;
  const result = globalThis.CtuRegistrationAdapter.inspectPage(document);

  assert.equal(result.ok, true);
  assert.equal(result.rows.get('CT112').selector.hasAttribute('data-course-selector'), true);
});

test('rejects a table with duplicate course codes', () => {
  const document = new JSDOM(fixture.replace('CT179', 'CT112')).window.document;
  assert.deepEqual(globalThis.CtuRegistrationAdapter.inspectPage(document), {
    ok: false,
    error: 'DUPLICATE_COURSE_CODE',
  });
});

test('classifies only explicit full-capacity and success outcomes', () => {
  const fullDocument = new JSDOM(fixture.replace('<div data-registration-outcome></div>', '<div data-registration-outcome>Lop hoc phan da day</div>')).window.document;
  const successDocument = new JSDOM(fixture.replace('<div data-registration-outcome></div>', '<div data-registration-outcome>Dang ky hoc phan thanh cong</div>')).window.document;
  const unknownDocument = new JSDOM(fixture.replace('<div data-registration-outcome></div>', '<div data-registration-outcome>Loi may chu</div>')).window.document;

  assert.equal(globalThis.CtuRegistrationAdapter.classifyOutcome(fullDocument), 'full');
  assert.equal(globalThis.CtuRegistrationAdapter.classifyOutcome(successDocument), 'success');
  assert.equal(globalThis.CtuRegistrationAdapter.classifyOutcome(unknownDocument), 'ambiguous');
});

test('finds one exact Ant Design group option', () => {
  const document = new JSDOM(fixture).window.document;
  const option = globalThis.CtuRegistrationAdapter.findGroupOption(document, '02');

  assert.equal(option.textContent.trim(), '02');
  assert.equal(globalThis.CtuRegistrationAdapter.findGroupOption(document, '03'), null);
});
