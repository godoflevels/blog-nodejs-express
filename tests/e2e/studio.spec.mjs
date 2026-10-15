import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const login = async (page, user = 'tester', seed = 0) => {
  await page.request.get('/__reset');
  await page.goto(`/__login?user=${user}${seed ? `&seed=${seed}` : ''}`);
  await expect(page.locator('.ms-app')).toBeVisible();
};

const newPost = async (page) => {
  await page.getByTestId('new-post').click();
  await page.getByRole('menuitem', { name: 'Blank draft' }).click();
  await expect(page.locator('.ms-editor')).toBeVisible();
};

const MAIN = '.ms-composer__text textarea.ms-source';
const type = async (page, text) => {
  const ta = page.locator(MAIN);
  await ta.click();
  await ta.fill(text);
};
const bootstrap = async (page) => (await page.request.get('/modshub/api/bootstrap')).json();

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

test('Discord message: formatting renders like Discord and autosave says Saved', async ({ page }) => {
  await login(page);
  await newPost(page);
  await type(page, '# Hello\n\n**bold** *italic* ***both*** __underline__ ~~strike~~ ||secret||\n\n> quote\n-# small\n\n- a\n  - b\n\n<@123456789012345678> @everyone');
  const dc = page.locator('.dc-root');
  await expect(dc.locator('h1')).toHaveText('Hello');
  await expect(dc.locator('strong').first()).toHaveText('bold');
  await expect(dc.locator('u')).toHaveText('underline');
  await expect(dc.locator('s')).toHaveText('strike');
  await expect(dc.locator('blockquote')).toContainText('quote');
  await expect(dc.locator('small.dc-subtext')).toHaveText('small');
  await expect(dc.locator('li li')).toHaveText('b');
  await expect(dc.locator('.dc-mention--user')).toBeVisible();
  const spoiler = dc.locator('.dc-spoiler');
  await expect(spoiler).not.toHaveClass(/is-revealed/);
  await spoiler.click();
  await expect(spoiler).toHaveClass(/is-revealed/);
  await expect(page.locator('.ms-save')).toContainText('Saved', { timeout: 6000 });
  const data = await bootstrap(page);
  expect(data.posts[0].content).toContain('__underline__');
  expect(data.posts[0].updatedBy).toBe('tester');
});

test('toolbar: bold, underline and spoiler wrap the selection and undo works', async ({ page }) => {
  await login(page);
  await newPost(page);
  await type(page, 'make this special');
  const ta = page.locator(MAIN);
  await ta.evaluate((el) => el.setSelectionRange(5, 9));
  await page.getByRole('button', { name: /^Bold/ }).click();
  await expect(ta).toHaveValue('make **this** special');
  await ta.evaluate((el) => el.setSelectionRange(0, 4));
  await page.getByRole('button', { name: /^Underline/ }).click();
  await expect(ta).toHaveValue('__make__ **this** special');
  await ta.evaluate((el) => el.setSelectionRange(el.value.length - 7, el.value.length));
  await page.getByRole('button', { name: /^Spoiler/ }).click();
  await expect(ta).toHaveValue('__make__ **this** ||special||');
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(ta).toHaveValue('__make__ **this** special');
});

test('keyboard shortcuts: Ctrl/Cmd+U underlines, Enter continues a list', async ({ page }) => {
  await login(page);
  await newPost(page);
  const ta = page.locator(MAIN);
  await ta.click();
  await ta.fill('word');
  await ta.evaluate((el) => el.setSelectionRange(0, 4));
  await page.keyboard.press('ControlOrMeta+u');
  await expect(ta).toHaveValue('__word__');
  await ta.fill('- one');
  await ta.evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
  await page.keyboard.press('Enter');
  await page.keyboard.type('two');
  await expect(ta).toHaveValue('- one\n- two');
});

test('one click copies the exact message text; webhook JSON and plain text are separate', async ({ page }) => {
  await login(page);
  await newPost(page);
  const src = '# Title\n\nSome **bold**, __under__ and ||spoiler||';
  await type(page, src);
  // the header button
  await page.getByTestId('copy-text').first().click();
  await expect(page.locator('.ms-toast').last()).toContainText('Copied successfully');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(src);

  await page.getByRole('button', { name: 'Copy webhook JSON' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('"content"');
  const json = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(json.content).toBe(src);

  await page.getByRole('button', { name: 'Copy Plain Text' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Title\n\nSome bold, under and spoiler');

  await page.getByRole('button', { name: 'Copy Rich Text' }).click();
  const readHtml = () => page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return item.types.includes('text/html') ? (await item.getType('text/html')).text() : '';
  });
  await expect.poll(readHtml).toContain('<h1>Title</h1>');
  expect(await readHtml()).toContain('<strong>bold</strong>');
});

test('copying works straight from the list row', async ({ page }) => {
  await login(page, 'tester', 3);
  await page.getByRole('tab', { name: 'List', exact: true }).click();
  await page.getByTestId('row-copy').first().click();
  await expect(page.locator('.ms-toast').last()).toContainText('Copied successfully');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('This is **bold**');
});

test('embeds: add one, preview shows it and webhook JSON carries it', async ({ page }) => {
  await login(page);
  await newPost(page);
  await type(page, 'Message above the embed');
  await page.getByTestId('add-embed').click();
  await page.getByLabel(/^Title\d/).fill('New Graphics Pack');
  await page.locator('.ms-embedcard textarea.ms-source').first().fill('Description with **bold** and ||spoiler||');
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel(/^Field 1 name/).fill('Version');
  const embed = page.locator('.dc-embed');
  await expect(embed.locator('.dc-embed__title')).toHaveText('New Graphics Pack');
  await expect(embed.locator('.dc-embed__desc strong')).toHaveText('bold');
  await expect(embed.locator('.dc-field__name')).toHaveText('Version');
  await expect(page.locator('.ms-save')).toContainText('Saved', { timeout: 6000 });
  const data = await bootstrap(page);
  expect(data.posts[0].discord.embeds[0].title).toBe('New Graphics Pack');
  await page.getByRole('tab', { name: 'JSON' }).click();
  await expect(page.getByLabel('Message JSON')).toHaveValue(/"title": "New Graphics Pack"/);
});

test('JSON tab: pasting a Discohook message replaces the content', async ({ page }) => {
  await login(page);
  await newPost(page);
  await page.getByRole('tab', { name: 'JSON' }).click();
  const area = page.getByLabel('Message JSON');
  await area.fill(JSON.stringify({ content: 'From Discohook **yes**', username: 'Bot', embeds: [{ title: 'T', color: 5814783 }] }));
  await page.getByRole('button', { name: 'Apply JSON' }).click();
  await page.getByRole('tab', { name: 'Message' }).click();
  await expect(page.locator(MAIN)).toHaveValue('From Discohook **yes**');
  await expect(page.locator('.dc-username')).toHaveText('Bot');
  await expect(page.locator('.dc-embed__title')).toHaveText('T');
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
  const bytes = fs.readFileSync(await download.path());
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

test('unsaved edits survive a page reload (draft recovery)', async ({ page }) => {
  await login(page);
  await newPost(page);
  await type(page, 'saved text');
  await expect(page.locator('.ms-save')).toContainText('Saved', { timeout: 6000 });

  await page.route('**/modshub/api/posts/**', (route) => route.abort());
  await type(page, 'text typed while offline ✍️');
  await expect(page.locator('.ms-save')).not.toContainText('Saved', { timeout: 4000 });

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
  await expect(page.locator(MAIN)).toHaveValue('text typed while offline ✍️');
  await expect(page.locator('.ms-save')).toContainText('Saved', { timeout: 8000 });
  const server = await bootstrap(page);
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
  const data = await bootstrap(page);
  const p = data.posts.find((x) => x.id === 'imp-1');
  expect(p.scheduledAt).toBe('2026-10-20T15:00:00.000Z');
  expect(p.timezone).toBe('Europe/Moscow');
  expect(p.content).toBe('# Hi\n\n***Available now*** Привет');
});

test('import a Discohook / webhook JSON as a draft with its embeds', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Import' }).first().click();
  const webhook = { content: 'Hello from **Discohook**', embeds: [{ title: 'Embed title', description: 'desc', color: 5814783 }] };
  await page.getByTestId('import-file').setInputFiles({ name: 'message.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(webhook)) });
  await page.locator('.ms-import__fields input[type=date]').fill('2026-11-05');
  await page.getByRole('button', { name: 'Import 1 post' }).click();
  await expect(page.getByText('Import finished')).toBeVisible();
  const data = await bootstrap(page);
  expect(data.posts[0].content).toBe('Hello from **Discohook**');
  expect(data.posts[0].discord.embeds[0].title).toBe('Embed title');
});

test('import a markdown file as a draft and pick its date', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Import' }).first().click();
  await page.getByTestId('import-file').setInputFiles({ name: 'my_new-post.md', mimeType: 'text/markdown', buffer: Buffer.from('# From file\n\n**ok**') });
  await expect(page.locator('input[type=text]').first()).toHaveValue('my new-post');
  await page.locator('.ms-import__fields input[type=date]').fill('2026-11-05');
  await page.getByRole('button', { name: 'Import 1 post' }).click();
  await expect(page.getByText('Import finished')).toBeVisible();
  const data = await bootstrap(page);
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

test('moving a post by dragging keeps its time of day', async ({ page }) => {
  await login(page, 'tester', 4);
  const chip = page.locator('.ms-chip').first();
  const before = (await bootstrap(page)).posts[0];
  const cells = page.locator('.ms-cell:not(.is-outside)');
  await chip.dragTo(cells.nth(20));
  await expect(page.locator('.ms-save')).toContainText('Saved', { timeout: 6000 });
  const after = await bootstrap(page);
  const moved = after.posts.find((p) => p.id === before.id);
  expect(new Date(moved.scheduledAt).toISOString().slice(11, 16)).toBe(new Date(before.scheduledAt).toISOString().slice(11, 16));
  expect(moved.scheduledAt).not.toBe(before.scheduledAt);
});

test('free places: mark days, see them in the list, use one for a post', async ({ page }) => {
  await login(page);
  await page.getByTestId('mark-free').click();
  await expect(page.getByText('Marking free places')).toBeVisible();
  const cells = page.locator('.ms-cell:not(.is-outside)');
  await cells.nth(9).click();
  await cells.nth(10).click();
  await expect(page.locator('.ms-free')).toHaveCount(2);
  await cells.nth(10).click(); // toggles off
  await expect(page.locator('.ms-free')).toHaveCount(1);
  await page.getByTestId('mark-free').click();

  const data = await bootstrap(page);
  expect(data.slots).toHaveLength(1);
  expect(data.slots[0].createdBy).toBe('tester');

  await page.locator('.ms-free').click();
  await page.getByLabel('Note (visible to everyone)').fill('keep for Friday');
  await page.getByTestId('use-slot').click();
  await expect(page.locator('.ms-editor')).toBeVisible();
  await expect.poll(async () => (await bootstrap(page)).slots.length).toBe(0);
  await expect.poll(async () => (await bootstrap(page)).posts.length, { timeout: 8000 }).toBe(1);
});

test('two people share one calendar: changes and free places show up for both', async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await owner.request.get('http://127.0.0.1:4173/__reset');
  await owner.goto('http://127.0.0.1:4173/__login?user=owner');
  await expect(owner.locator('.ms-app')).toBeVisible();

  const jixoCtx = await browser.newContext();
  const jixo = await jixoCtx.newPage();
  await jixo.goto('http://127.0.0.1:4173/__login?user=jixo');
  await expect(jixo.locator('.ms-app')).toBeVisible();
  await expect(jixo.locator('.ms-who')).toContainText('jixo');

  // owner writes a post and marks a day
  await owner.getByTestId('new-post').click();
  await owner.getByRole('menuitem', { name: 'Blank draft' }).click();
  await owner.locator(MAIN).fill('Written by the owner');
  await expect(owner.locator('.ms-save')).toContainText('Saved', { timeout: 6000 });
  await owner.getByRole('button', { name: 'Close editor' }).click();
  await owner.getByTestId('mark-free').click();
  await owner.locator('.ms-cell:not(.is-outside)').nth(20).click();
  await expect(owner.locator('.ms-free')).toHaveCount(1);

  // jixo sees both without any manual action (focus triggers a refresh)
  await jixo.evaluate(() => window.dispatchEvent(new Event('focus')));
  await jixo.getByRole('tab', { name: 'Posts' }).click();
  await expect(jixo.locator('.ms-card')).toHaveCount(1, { timeout: 8000 });
  await expect(jixo.locator('.ms-card')).toContainText('Untitled post');
  await jixo.getByRole('tab', { name: 'Calendar' }).click();
  await expect(jixo.locator('.ms-free')).toHaveCount(1, { timeout: 8000 });

  // jixo edits, the owner is told who edited
  await jixo.getByRole('tab', { name: 'Posts' }).click();
  await jixo.locator('.ms-card__main').first().click();
  await jixo.locator(MAIN).fill('Edited by jixo');
  await expect(jixo.locator('.ms-save')).toContainText('Saved', { timeout: 6000 });
  const data = await (await owner.request.get('http://127.0.0.1:4173/modshub/api/bootstrap')).json();
  expect(data.posts[0].content).toBe('Edited by jixo');
  expect(data.posts[0].createdBy).toBe('owner');
  expect(data.posts[0].updatedBy).toBe('jixo');
  await ownerCtx.close();
  await jixoCtx.close();
});

test('month picker jumps to any month and arrows page through months', async ({ page }) => {
  await login(page, 'tester', 4);
  const title = page.getByTestId('month-title');
  const start = await title.innerText();
  await page.getByTestId('next').click();
  await expect(title).not.toHaveText(start);
  await page.getByTestId('prev').click();
  await expect(title).toHaveText(start);
  await title.click();
  await page.getByRole('button', { name: 'Previous year' }).click();
  await page.getByRole('button', { name: /^Mar \d{4}$/ }).click();
  await expect(title).toContainText('March');
  await expect(title).toContainText(String(new Date().getFullYear() - 1));
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
    await page.getByTestId('add-embed').click();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
}
