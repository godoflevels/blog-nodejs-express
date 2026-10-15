import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/dom.mjs';
import { renderDiscord, toWebhookPayload, fromWebhookPayload, discordIssues, emptyEmbed, DISCORD_LIMITS } from '../../client/modshub/core/discord.js';
import { sanitizeHtml } from '../../client/modshub/core/sanitize.js';

const html = (src, env) => renderDiscord(src, env).trim();

test('Discord emphasis: bold, italic, underline, strikethrough and combinations', () => {
  assert.match(html('**b**'), /<strong>b<\/strong>/);
  assert.match(html('*i* and _i_'), /<em>i<\/em> and <em>i<\/em>/);
  assert.match(html('__u__'), /<u>u<\/u>/);
  assert.doesNotMatch(html('__u__'), /strong/);
  assert.match(html('~~s~~'), /<s>s<\/s>/);
  assert.match(html('***bi***'), /<em><strong>bi<\/strong><\/em>/);
  assert.match(html('__*ui*__'), /<u><em>ui<\/em><\/u>/);
  assert.match(html('**bold with *italic* inside**'), /<strong>bold with <em>italic<\/em> inside<\/strong>/);
});

test('spoilers, also nested and not inside code', () => {
  assert.match(html('hello ||secret|| world'), /hello <span class="dc-spoiler">secret<\/span> world/);
  assert.match(html('||a **b** c||'), /<span class="dc-spoiler">a <strong>b<\/strong> c<\/span>/);
  assert.match(html('`||x||`'), /<code>\|\|x\|\|<\/code>/);
  assert.doesNotMatch(html('||'), /dc-spoiler/);
});

test('headings only up to level 3, subtext, quotes', () => {
  assert.match(html('# A\n## B\n### C'), /<h1>A<\/h1>\s*<h2>B<\/h2>\s*<h3>C<\/h3>/);
  assert.doesNotMatch(html('#### D'), /<h4>/);
  assert.match(html('#### D'), /<p>#### D<\/p>/);
  assert.match(html('-# tiny text'), /<small class="dc-subtext">tiny text<\/small>/);
  assert.match(html('> one'), /<blockquote>\s*<p>one<\/p>\s*<\/blockquote>/);
});

test('>>> quotes the rest of the message but not code fences', () => {
  const out = html('before\n>>> a\nb\n\nc');
  assert.match(out, /<p>before<\/p>/);
  assert.match(out, /<blockquote>[\s\S]*a<br>\s*b[\s\S]*c[\s\S]*<\/blockquote>/);
  const fenced = html('```\n>>> not a quote\n```');
  assert.doesNotMatch(fenced, /blockquote/);
});

test('code, code blocks, lists and links', () => {
  assert.match(html('`x`'), /<code>x<\/code>/);
  assert.match(html('```js\nconst a = 1;\n```'), /<pre class="dc-codeblock"><code class="language-js">const a = 1;\n<\/code><\/pre>/);
  assert.match(html('- a\n  - b\n- c'), /<ul>\s*<li>a\s*<ul>\s*<li>b<\/li>/);
  assert.match(html('1. x\n2. y'), /<ol>/);
  assert.match(html('[ModsHub](https://modshub.io/)'), /<a href="https:\/\/modshub\.io\/" target="_blank" rel="noopener noreferrer">ModsHub<\/a>/);
  assert.match(html('see https://modshub.io now'), /<a href="https:\/\/modshub\.io"/);
  assert.doesNotMatch(html('visit modshub.io'), /<a /);
  assert.doesNotMatch(html('[x](javascript:alert(1))'), /<a /);
});

test('not Discord syntax: tables, rules, images and html stay plain text', () => {
  assert.doesNotMatch(html('| a | b |\n|---|---|\n| 1 | 2 |'), /<table/);
  assert.doesNotMatch(html('---'), /<hr/);
  assert.doesNotMatch(html('![x](https://a.b/c.png)'), /<img/);
  assert.doesNotMatch(html('Title\n---'), /<h2/);
  const evil = sanitizeHtml(renderDiscord('<script>alert(1)</script> <img src=x onerror=alert(1)>'));
  assert.doesNotMatch(evil, /<script|<img/);
});

test('mentions, custom emoji and timestamps', () => {
  const out = html('<@123456789012345678> <@&42> <#99> @everyone @here');
  assert.match(out, /dc-mention--user">@user</);
  assert.match(out, /dc-mention--role">@role</);
  assert.match(out, /dc-mention--channel">#channel</);
  assert.equal((out.match(/dc-mention--broadcast/g) || []).length, 2);
  assert.match(html('<:party:123456789>'), /<img class="dc-emoji" src="https:\/\/cdn\.discordapp\.com\/emojis\/123456789\.webp\?size=48"/);
  assert.match(html('<a:dance:55>'), /55\.gif/);
  const env = { locale: 'en-US', timeZone: 'UTC', now: Date.UTC(2026, 9, 15, 12) };
  assert.match(html('<t:1792065600:F>', env), /Thursday, October 15, 2026/);
  assert.match(html('<t:1792065600:t>', env), /12:00 PM/);
  assert.match(html('<t:1792152000:R>', env), /tomorrow|in 1 day/);
  assert.match(html('mail me@example.com @everyonex'), /@everyonex/);
});

test('emoji and unicode are untouched', () => {
  assert.match(html('Привет 🚗 **мир**'), /Привет 🚗 <strong>мир<\/strong>/);
});

test('webhook payload: build, parse and round trip', () => {
  const post = {
    content: 'Hello **world**',
    discord: {
      username: 'ModsHub',
      avatarUrl: 'https://example.com/a.png',
      embeds: [{
        ...emptyEmbed(), color: '#5865f2', title: 'Title', url: 'https://modshub.io/', description: 'Desc', authorName: 'Author',
        fields: [{ name: 'A', value: 'B', inline: true }], footerText: 'Foot', imageUrl: 'https://example.com/i.png', timestamp: '2026-10-20T15:00:00.000Z',
      }],
    },
  };
  const payload = toWebhookPayload(post);
  assert.equal(payload.content, 'Hello **world**');
  assert.equal(payload.username, 'ModsHub');
  assert.equal(payload.avatar_url, 'https://example.com/a.png');
  assert.equal(payload.embeds[0].color, 0x5865f2);
  assert.deepEqual(payload.embeds[0].fields, [{ name: 'A', value: 'B', inline: true }]);
  assert.deepEqual(payload.embeds[0].footer, { text: 'Foot' });
  assert.deepEqual(payload.embeds[0].image, { url: 'https://example.com/i.png' });

  const back = fromWebhookPayload(JSON.parse(JSON.stringify(payload)));
  assert.equal(back.content, post.content);
  assert.equal(back.discord.username, 'ModsHub');
  assert.equal(back.discord.embeds[0].title, 'Title');
  assert.equal(back.discord.embeds[0].color, '#5865f2');
  assert.deepEqual(back.discord.embeds[0].fields, [{ name: 'A', value: 'B', inline: true }]);

  const backup = fromWebhookPayload({ messages: [{ data: { content: 'one' } }, { data: { content: 'two' } }] });
  assert.equal(backup.content, 'one');
  assert.match(backup.notes[0], /only the first/);
  assert.throws(() => fromWebhookPayload([1, 2]));
});

test('limits are reported like Discord enforces them', () => {
  assert.deepEqual(discordIssues({ content: 'ok', discord: null }), []);
  const long = discordIssues({ content: 'x'.repeat(DISCORD_LIMITS.content + 1), discord: null });
  assert.equal(long[0].level, 'error');
  assert.match(long[0].message, /2000/);
  const empty = discordIssues({ content: '', discord: { embeds: [] } });
  assert.match(empty[0].message, /empty/);
  const embeds = discordIssues({ content: 'x', discord: { embeds: [{ ...emptyEmbed(), description: 'y'.repeat(4097) }] } });
  assert.match(embeds[0].message, /4096/);
});
