import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { unzipSync } from 'fflate';

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

// Date fields are month-grid popovers, not native inputs.
const pickDate = async (page, label, date) => {
  await page.getByRole('button', { name: new RegExp(`^${label}:`) }).click();
  const day = page.locator(`.ms-pop [data-date="${date}"]`);
  for (let i = 0; i < 36 && (await day.count()) === 0; i += 1) await page.getByRole('button', { name: 'Next month' }).click();
  await day.first().click();
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

test('week and day blocks show the full title, not a clipped sliver', async ({ page }) => {
  await login(page, 'tester', 6);
  await page.getByRole('tab', { name: 'Week', exact: true }).click();
  const blocks = page.locator('.ms-block:not(.ms-block--free)');
  await expect(blocks.first()).toBeVisible();
  const count = await blocks.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const block = await blocks.nth(i).boundingBox();
    const title = await blocks.nth(i).locator('.ms-block__title').boundingBox();
    expect(title.height).toBeGreaterThan(8);
    expect(title.y).toBeGreaterThanOrEqual(block.y - 1);
    expect(title.y + title.height).toBeLessThanOrEqual(block.y + block.height + 1);
    await expect(blocks.nth(i).locator('.ms-block__title')).not.toHaveText('');
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

// 1x1 PNG
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('attach several images: gallery in the preview, each downloads in one click, all as a ZIP', async ({ page }) => {
  await login(page);
  await newPost(page);
  await type(page, 'Post with pictures');
  await expect(page.locator('.dc-attachment')).toHaveCount(0);

  const file = (name) => ({ name, mimeType: 'image/png', buffer: PNG_1PX });
  await page.locator('.ms-attachment input[type=file]').setInputFiles([file('one.png'), file('two.png'), file('three.png')]);
  await expect(page.locator('.dc-root .dc-attachment img')).toHaveCount(3, { timeout: 10000 });
  await expect(page.locator('.ms-attach__item')).toHaveCount(3);
  await expect(page.locator('.dc-gallery')).toHaveClass(/dc-gallery--3/);
  for (const img of await page.locator('.dc-root .dc-attachment img').all()) {
    await expect(img).toHaveAttribute('src', /\/modshub\/api\/assets\/[a-f0-9]+$/);
  }

  // one image, from the editor
  const [one] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-image-2').click()]);
  expect(one.suggestedFilename()).toMatch(/-image-2\.png$/);
  expect(fs.readFileSync(await one.path()).equals(PNG_1PX)).toBe(true);

  // one image, from the button over it in the preview
  await page.locator('.dc-attachment').nth(2).hover();
  const [two] = await Promise.all([page.waitForEvent('download'), page.locator('.dc-attachment__dl').nth(2).click()]);
  expect(two.suggestedFilename()).toMatch(/-image-3\.png$/);

  // everything as one ZIP: editor button, header button and export panel
  for (const trigger of [
    () => page.getByTestId('download-attachment').click(),
    () => page.getByTestId('download-image-header').click(),
    () => page.getByTestId('download-attachment-export').click(),
  ]) {
    const [zip] = await Promise.all([page.waitForEvent('download'), trigger()]);
    expect(zip.suggestedFilename()).toMatch(/-images\.zip$/);
    const entries = unzipSync(new Uint8Array(fs.readFileSync(await zip.path())));
    const names = Object.keys(entries).sort();
    expect(names).toHaveLength(3);
    expect(names[0]).toMatch(/-01\.png$/);
    expect(Buffer.from(entries[names[2]]).equals(PNG_1PX)).toBe(true);
  }

  await expect(page.locator('.ms-save')).toContainText('Saved', { timeout: 6000 });
  const saved = (await bootstrap(page)).posts[0];
  expect(saved.images).toHaveLength(3);
  expect(saved.image.src).toBe(saved.images[0].src);

  // reorder, then remove two
  const firstSrc = saved.images[0].src;
  await page.getByRole('button', { name: 'Move image 1 later' }).click();
  await expect.poll(async () => (await bootstrap(page)).posts[0].images[1].src, { timeout: 6000 }).toBe(firstSrc);
  await page.getByRole('button', { name: 'Remove image 3' }).click();
  await page.getByRole('button', { name: 'Remove image 2' }).click();
  await expect(page.locator('.dc-attachment')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove image 1' }).click();
  await expect(page.locator('.dc-attachment')).toHaveCount(0);
  await expect.poll(async () => (await bootstrap(page)).posts[0].images.length, { timeout: 6000 }).toBe(0);
});

test('a single attached image downloads straight away, not as a ZIP', async ({ page }) => {
  await login(page);
  await newPost(page);
  await page.locator('.ms-attachment input[type=file]').setInputFiles({ name: 'cover shot.png', mimeType: 'image/png', buffer: PNG_1PX });
  await expect(page.locator('.dc-root .dc-attachment img')).toHaveCount(1, { timeout: 8000 });
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-attachment').click()]);
  expect(d.suggestedFilename()).toMatch(/-image\.png$/);
  expect(fs.readFileSync(await d.path()).equals(PNG_1PX)).toBe(true);
  const [h] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-image-header').click()]);
  expect(h.suggestedFilename()).toMatch(/\.png$/);
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
  await pickDate(page, 'Post date', '2026-11-05');
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
  await pickDate(page, 'Post date', '2026-11-05');
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

test('sidebar: status and category filters, counts and the mini calendar', async ({ page }) => {
  await login(page, 'tester', 12);
  const side = page.getByRole('complementary', { name: 'Calendar sidebar' });
  await expect(side).toBeVisible();
  await expect(side.getByRole('button', { name: /^All posts\s*12$/ })).toBeVisible();
  await expect(page.locator('.ms-chip').first()).toBeVisible();
  await side.getByRole('button', { name: /^Planned/ }).click();
  await expect(page.locator('.ms-chip').first()).toBeVisible();
  await expect(page.locator('.ms-chip:not(.ms-chip--planned)')).toHaveCount(0);
  await side.getByRole('button', { name: /^Planned/ }).click();
  await expect(page.locator('.ms-chip:not(.ms-chip--planned)').first()).toBeVisible();
  const title = page.getByTestId('month-title');
  const before = await title.innerText();
  await side.getByRole('button', { name: 'Next month' }).click();
  await expect(title).not.toHaveText(before);
});

test('schedule chips: date, time, status and category are set with pickers and persist', async ({ page }) => {
  await login(page);
  await newPost(page);
  await expect(page.getByRole('button', { name: /^Scheduled date:/ })).toBeVisible();
  await page.getByRole('button', { name: /^Scheduled date:/ }).click();
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.locator('.ms-pop [data-date$="-15"]').first().click();
  await expect(page.getByRole('button', { name: /^Scheduled date: .*15/ })).toBeVisible();
  await page.getByRole('button', { name: /^Scheduled time:/ }).click();
  const time = page.getByLabel('Time (HH:MM)');
  await time.fill('09:45');
  await time.press('Enter');
  await expect(page.getByRole('button', { name: 'Scheduled time: 09:45' })).toBeVisible();
  await page.getByRole('button', { name: /^Status:/ }).click();
  await page.getByRole('option', { name: 'Ready' }).click();
  await page.getByRole('button', { name: /^Category:/ }).click();
  await page.getByRole('option', { name: 'Graphics' }).click();
  await expect(page.locator('.ms-save')).toContainText('Saved', { timeout: 6000 });
  const post = (await bootstrap(page)).posts[0];
  expect(post.status).toBe('ready');
  expect(post.category).toBe('graphics');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Scheduled time: 09:45' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Status: Ready/ })).toBeVisible();
});

test('the title is edited right in the editor header', async ({ page }) => {
  await login(page);
  await newPost(page);
  await page.getByLabel('Internal title').fill('Launch day teaser');
  await expect(page.locator('.ms-save')).toContainText('Saved', { timeout: 6000 });
  expect((await bootstrap(page)).posts[0].title).toBe('Launch day teaser');
});

test('phone: tab bar, new-post sheet, editor tabs and back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'tester', 8);
  await expect(page.locator('.ms-rail')).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: 'View' })).toBeVisible();
  await page.getByRole('tab', { name: 'Posts' }).click();
  await expect(page.locator('.ms-card')).toHaveCount(8);
  await page.getByRole('tab', { name: 'Calendar' }).click();
  await page.getByTestId('new-post').click();
  await expect(page.locator('.ms-pop.is-sheet')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Blank draft' }).click();
  await expect(page.locator('.ms-editor')).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Post sections' })).toBeVisible();
  await type(page, 'Typed on a phone **bold**');
  await page.getByRole('tab', { name: 'Preview' }).click();
  await expect(page.locator('.dc-root strong')).toHaveText('bold');
  await page.getByRole('tab', { name: 'Export' }).click();
  await expect(page.getByTestId('download-image')).toBeVisible();
  await page.getByRole('tab', { name: 'Edit' }).click();
  await page.getByTestId('back').click();
  await expect(page.locator('.ms-calendar')).toBeVisible();
  await expect(page.getByTestId('new-post')).toBeVisible();
});

test('phone: the filters sheet narrows the posts list and Reset brings them back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'tester', 12);
  await page.getByRole('tab', { name: 'Posts' }).click();
  await expect(page.locator('.ms-card')).toHaveCount(12);
  await page.getByTestId('filters').click();
  await expect(page.locator('.ms-pop.is-sheet')).toBeVisible();
  await page.getByRole('radio', { name: 'Planned' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.ms-card')).toHaveCount(3);
  await page.getByTestId('filters').click();
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.ms-card')).toHaveCount(12);
});

test('phone: tapping a day in the month shows its posts and swiping pages the month', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, baseURL: 'http://127.0.0.1:4173' });
  const page = await ctx.newPage();
  await login(page, 'tester', 12);
  const title = page.getByTestId('month-title');
  const start = await title.innerText();
  const cells = page.locator('.ms-cell:not(.is-outside)');
  await cells.nth(10).tap();
  await expect(cells.nth(10)).toHaveClass(/is-picked/);
  await expect(page.locator('.ms-agenda')).toBeVisible();
  const box = await page.locator('.ms-month__grid').boundingBox();
  await page.evaluate(({ x, y }) => {
    const target = document.querySelector('.ms-calendar__body');
    const touch = (type, cx) => {
      const t = new Touch({ identifier: 1, target, clientX: cx, clientY: y });
      target.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true }));
    };
    touch('touchstart', x + 250);
    touch('touchend', x + 40);
  }, { x: box.x, y: box.y + 60 });
  await expect(title).not.toHaveText(start);
  await ctx.close();
});

for (const width of [768, 820]) {
  test(`tablet ${width}px: month shows dots and the picked day's posts, not clipped chips`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page, 'tester', 12);
    await expect(page.locator('.ms-cell__dots .ms-dot-s').first()).toBeVisible();
    const cell = page.locator('.ms-cell:not(.is-outside):has(.ms-dot-s)').first();
    await cell.click();
    await expect(cell).toHaveClass(/is-picked/);
    await expect(page.locator('.ms-agenda .ms-row').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Posts' })).toBeVisible();
  });
}

const RIGHT = {
  'What is the tagline': 'Your game. Modded right.',
  'ModsHub used to be': 'Fivemods',
  'Realistic Stars, one': 'Improvements',
  'Which of these mods belongs': 'European Roads',
  'ENB graphics preset': 'Ray Fusion Remastered',
  'car from the Real Cars': 'Pfister Boxster',
  'Which of these is a weapon skin': 'Glock | Tactical Elite',
  'Realistic Weapons Sounds': 'Audio',
  'What does ModsHub+ remove': 'Download queues',
  'one-time purchase': 'ModsHub Infinity',
};
const playQuiz = async (page, wrong) => {
  await page.goto('/quiz');
  await page.getByRole('button', { name: /Start the quiz/ }).click();
  for (let n = 0; n < 10; n += 1) {
    const text = await page.locator('.question').textContent();
    const key = Object.keys(RIGHT).find((k) => text.includes(k));
    const rightLabel = RIGHT[key];
    const labels = await page.locator('.opt .label').allInnerTexts();
    const pick = n < wrong ? labels.find((l) => l !== rightLabel) : rightLabel;
    await page.locator('.opt', { hasText: pick }).first().click();
    await expect(page.locator('.feedback')).toBeVisible();
    await page.locator('.nextbar .btn').click();
  }
};

test('quiz: a perfect run unlocks the 50% promo code, which can be copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/quiz');
  expect(await page.content()).not.toContain('QUIZ50');
  await playQuiz(page, 0);
  await expect(page.getByRole('heading', { name: /perfect score/i })).toBeVisible();
  await expect(page.locator('.score')).toHaveAttribute('aria-label', 'Score 10 out of 10');
  await expect(page.locator('#promo')).toHaveText('QUIZ50');
  await page.getByRole('button', { name: /Copy/ }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('QUIZ50');
});

test('quiz: three wrong answers still pass, four do not and no code is shown', async ({ page }) => {
  await playQuiz(page, 3);
  await expect(page.locator('#promo')).toHaveText('QUIZ50');
  await playQuiz(page, 4);
  await expect(page.locator('#promo')).toHaveCount(0);
  await expect(page.getByText('You need 7 out of 10')).toBeVisible();
  await expect(page.getByRole('button', { name: /Try again/ })).toBeVisible();
});

for (const width of [320, 390, 1440]) {
  test(`quiz: no horizontal overflow at ${width}px on every screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto('/quiz');
    await expect(page.getByRole('button', { name: /Start the quiz/ })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await playQuiz(page, 0);
    await expect(page.locator('#promo')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
}
