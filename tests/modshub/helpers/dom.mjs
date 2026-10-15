import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { setPurifier } from '../../../client/modshub/core/sanitize.js';

/** One jsdom window + DOMPurify for every test file that renders HTML. */
export const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://studio.test/' });
setPurifier(createDOMPurify(dom.window));
export const { window, document } = dom.window;
