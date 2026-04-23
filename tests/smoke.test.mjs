import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.match(source, /not a medical device/i);
assert.equal(existsSync(new URL('../public/placement-guide_0.jpg', import.meta.url)), true);
