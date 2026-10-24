/** One plain-text line for cards and list rows: Markdown and Discord syntax stripped. */
export function snippet(content, max = 160) {
  const text = String(content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<a?:\w+:\d+>/g, ' ')
    .replace(/<t:\d+(?::[a-zA-Z])?>/g, ' ')
    .replace(/<(?:@[!&]?|#)\d+>/g, ' ')
    .replace(/^\s*(?:#{1,3}|-#|>>>|>)\s*/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|~~|\|\||[*`])/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
