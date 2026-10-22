import { base, tests } from './index.js';

export default [{ ignores: ['test/fixtures/violations/**', 'node_modules/**'] }, ...base, ...tests];
