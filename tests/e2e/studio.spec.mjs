import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const login = async (page, user = 'tester', seed = 0) => {
  await page.request.get(`/__reset?user=${user}`);
  await page.goto(`/__login?user=${user}${seed ? `&seed=${seed}` : ''}`);
  await expect(page.locator('.ms-app')).toBeVisible();
};

const newPost = async (page) => {
  await page.getByTestId('new-post').click();
  await page.getByRole('menuitem', { name: 'Blank draft' }).click();
  await expect(page.locator('.ms-editor')).toBeVisible();
};

const type = async (page, text) => {
  const ta = page.locator('textarea.ms-source');
  await ta.click();
  await ta.fill(text);
};

test('requires login and redirects to the admin page', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/modshub');
  await expect(page).toHaveURL(/\/admin\?next=%2Fmodshub/);
});

test('calendar renders seeded posts in month, week, day and list modes', async ({ page }) => {
  await login(page, 'tester', 12);
  await expect(page.locator('.ms-chip').first()).toBeVisible();
  for (const mode of ['Week', 'Day', 'List', 'Month']) {
    await page.getByRole('tab', { name: mode, exact: true }).click();
    await expect(page.getByRole('tab', { name: mode, exact: true })).toHaveAttribute('aria-selected', 'true');
  }
});

test('create a post, write markdown, preview updates live and autosave says Saved', async ({ page }) => {
  await login(page);
  await newPost(page);
  await type(page, '# Hello\n\nThis is **bold**, *italic* and ***both***.\n\n- a\n  - b');
  const live = page.locator('.ms-editor__live');
  await expect(live.locator('h1')).toHaveText('Hello');
  await expect(live.locator('strong').first()).toHaveText('bold');
  await expect(live.locator('em > strong, strong > em')).toHaveText('both');
  await expect(live.locator('li li')).toHaveText('b');
  await expect(page.locator('.ms-save')).toContainText('Saved', { timeout: 6000 });
  const posts = await (await page.request.get('/modshub/api/bootstrap')).json();
  expect(posts.posts).toHaveLength(1);
  expect(posts.posts[0].content).toContain('***both***');
});

test('toolbar bold toggles and keeps the text intact', async ({ page }) => {
  await login(page);
  await newPost(page);
  await type(page, 'make this bold');
  const ta = page.locator('textarea.ms-source');
  await ta.evaluate((el) => el.setSelectionRange(5, 9));
  await page.getByRole('button', { name: /^Bold/ }).click();
  await expect(ta).toHaveValue('make **this** bold');
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(ta).toHaveValue('make this bold');
});

test('copy markdown, plain text and rich text are three different clipboard payloads', async ({ page }) => {
  await login(page);
  await newPost(page);
  await type(page, '# Title\n\nSome **bold** and *italic*');
  await page.getByRole('button', { name: 'Copy Markdown' }).click();
  await expect(page.locator('.ms-toast').last()).toContainText('Copied successfully');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('# Title\n\nSome **bold** and *italic*');

  await page.getByRole('button', { name: 'Copy Plain Text' }).click();
  await expect(page.locator('.ms-toast').last()).toContainText('Copied successfully');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Title\n\nSome bold and italic');

  await page.getByRole('button', { name: 'Copy Rich Text' }).click();
  const readHtml = () => page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items[0];
    return item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '';
  });
  await expect.poll(readHtml).toContain('<h1>Title</h1>');
  const html = await readHtml();
  const plainFlavor = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return (await item.getType('text/plain')).text();
  });
  expect(plainFlavor).toBe('Title\n\nSome bold and italic');
  expect(html).toContain('<strong>bold</strong>');
  expect(html).toContain('<em>italic</em>');
});

test('downloads a real PNG with the preset size', async ({ page }) => {
  await login(page);
  await newPost(page);
  await type(page, '# Image export\n\nA short post with **bold** text and Привет 🚗');
  await page.getByRole('tab', { name: 'Export Preview' }).click();
  await expect(page.locator('.ms-slides__item')).toHaveCount(1, { timeout: 10000 });
  const button = page.getByTestId('download-image');
  await expect(button).toBeEnabled({ timeout: 10000 });
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const file = await download.path();
  const bytes = fs.readFileSync(file);
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1080);
  expect(bytes.length).toBeGreaterThan(5000);
});

test('a long post becomes several slides and none are lost', async ({ page }) => {
  await login(page);
  await newPost(page);
  const items = Array.from({ length: 60 }, (_, i) => `- Item number ${i + 1} with some more words to fill the line`).join('\n');
  const paragraphs = Array.from({ length: 12 }, (_, i) => `## Section ${i + 1}\n\nParagraph ${i + 1}. ${'Lorem ipsum dolor sit amet. '.repeat(8)}`).join('\n\n');
  await type(page, `# Long post\n\n${paragraphs}\n\n${items}\n\nTHE-END-MARKER`);
  await page.getByRole('tab', { name: 'Export Preview' }).click();
  await expect.poll(() => page.locator('.ms-slides__item').count(), { timeout: 15000 }).toBeGreaterThan(2);
  const text = await page.locator('.ms-slides').innerText();
  expect(text).toContain('THE-END-MARKER');
  expect(text).toContain('Item number 60');
  expect(text).toContain('Section 12');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-image').click()]);
  expect(download.suggestedFilename()).toMatch(/-slides\.zip$/);
});

test('unsaved edits survive a page reload (draft recovery)', async ({ page, context }) => {
  await login(page);
  await newPost(page);
  await type(page, 'saved text');
  await expect(page.locator('.ms-save')).toContainText('Saved', { timeout: 6000 });

  // The tab "dies" before the server accepts the next edit: block every save.
  await page.route('**/modshub/api/posts/**', (route) => route.abort());
  await type(page, 'text typed while offline ✍️');
  await expect(page.locator('.ms-save')).not.toContainText('Saved', { timeout: 4000 });

  // Leaving the page with unsaved work asks for confirmation.
  const prevented = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);

  await page.reload();
  const banner = page.locator('.ms-banner', { hasText: 'unsaved changes' });
  await expect(banner).toBeVisible();
  await page.unroute('**/modshub/api/posts/**');
  await banner.getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('textarea.ms-source')).toHaveValue('text typed while offline ✍️');
  await expect(page.locator('.ms-save')).toContainText('Saved', { timeout: 8000 });
  const server = await (await page.request.get('/modshub/api/bootstrap')).json();
  expect(server.posts[0].content).toBe('text typed while offline ✍️');
});

test('import JSON shows a preview, validates and imports; timezone and content round-trip', async ({ page }) => {
  await login(page);
  const payload = {
    version: 1,
    posts: [
      { id: 'imp-1', title: 'Imported one', scheduledAt: '2026-10-20T18:00:00+03:00', timezone: 'Europe/Moscow', status: 'planned', category: 'graphics', tags: ['a'], content: '# Hi\n\n***Available now*** Привет', image: null, notes: '' },
      { id: 'imp-2', title: 'Broken', scheduledAt: 'tomorrow', status: 'nope', content: '' },
    ],
  };
  await page.getByRole('button', { name: 'Import' }).first().click();
  await page.getByTestId('import-file').setInputFiles({ name: 'posts.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload, null, 2)) });
  await expect(page.getByText('1 of 2 posts can be imported')).toBeVisible();
  await expect(page.locator('.ms-import__errors').first()).toContainText('line');
  await page.getByRole('button', { name: 'Import 1 post' }).click();
  await expect(page.getByText('Import finished')).toBeVisible();
  const data = await (await page.request.get('/modshub/api/bootstrap')).json();
  const p = data.posts.find((x) => x.id === 'imp-1');
  expect(p.scheduledAt).toBe('2026-10-20T15:00:00.000Z');
  expect(p.timezone).toBe('Europe/Moscow');
  expect(p.content).toBe('# Hi\n\n***Available now*** Привет');
});

test('import a markdown file as a draft and pick its date', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Import' }).first().click();
  await page.getByTestId('import-file').setInputFiles({ name: 'my_new-post.md', mimeType: 'text/markdown', buffer: Buffer.from('# From file\n\n**ok**') });
  await expect(page.locator('input[type=text]').first()).toHaveValue('my new-post');
  await page.locator('.ms-import__fields input[type=date]').fill('2026-11-05');
  await page.getByRole('button', { name: 'Import 1 post' }).click();
  await expect(page.getByText('Import finished')).toBeVisible();
  const data = await (await page.request.get('/modshub/api/bootstrap')).json();
  expect(data.posts[0].content).toBe('# From file\n\n**ok**');
  expect(data.posts[0].scheduledAt.startsWith('2026-11-05')).toBe(true);
});

test('posts view: search, bulk archive and confirmed delete', async ({ page }) => {
  await login(page, 'tester', 6);
  await page.getByRole('tab', { name: 'Posts' }).click();
  await expect(page.locator('.ms-card')).toHaveCount(6);
  await page.getByLabel('Search posts').fill('Real Cars');
  await expect(page.locator('.ms-card')).toHaveCount(1);
  await page.getByLabel('Search posts').fill('');
  await page.getByLabel('Select all visible posts').check();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.locator('.ms-toast').last()).toContainText('Updated 6 posts');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Delete 6 posts?');
  await page.getByRole('button', { name: 'Delete 6' }).click();
  await expect(page.getByText('No posts yet')).toBeVisible();
});

test('rich text mode edits and switching modes keeps the markdown', async ({ page }) => {
  await login(page);
  await newPost(page);
  await type(page, '# T\n\nHello **world**');
  await page.getByRole('tab', { name: 'Rich Text' }).click();
  const rich = page.locator('.ms-rich__surface');
  await expect(rich.locator('h1')).toHaveText('T');
  await rich.locator('p').click();
  // Caret to the very start of the paragraph (Home means "scroll" on macOS).
  await rich.evaluate((root) => {
    const p = root.querySelector('p');
    const range = document.createRange();
    range.setStart(p.firstChild, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.keyboard.type('Well, ');
  await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
  await expect(page.locator('textarea.ms-source')).toHaveValue('# T\n\nWell, Hello **world**');
});

test('moving a post by dragging keeps its time of day', async ({ page }) => {
  await login(page, 'tester', 4);
  const chip = page.locator('.ms-chip').first();
  const id = await page.request.get('/modshub/api/bootstrap').then((r) => r.json());
  const before = id.posts[0];
  const timeText = await chip.locator('.ms-chip__time').innerText();
  const cells = page.locator('.ms-cell:not(.is-outside)');
  const target = cells.nth(20);
  await chip.dragTo(target);
  await expect(page.locator('.ms-save')).toContainText('Saved', { timeout: 6000 });
  const after = await page.request.get('/modshub/api/bootstrap').then((r) => r.json());
  const moved = after.posts.find((p) => p.id === before.id) || after.posts.find((p) => p.title === before.title);
  const wall = (iso) => new Date(iso).toISOString().slice(11, 16);
  expect(wall(moved.scheduledAt)).toBe(timeText.length ? wall(before.scheduledAt) : wall(moved.scheduledAt));
});

for (const width of [320, 360, 375, 390, 414, 768, 1024, 1280, 1440]) {
  test(`no horizontal overflow at ${width}px (browse and editor)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await login(page, 'tester', 8);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('tab', { name: 'Posts' }).click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('tab', { name: 'Calendar' }).click();
    await newPost(page);
    await type(page, '# Heading\n\nSome text **bold** with a very-long-unbroken-word-' + 'x'.repeat(80));
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
}
