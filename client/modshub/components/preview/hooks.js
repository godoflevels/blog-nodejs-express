import { useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { renderMarkdown } from '../../core/markdown.js';
import { sanitizeHtml } from '../../core/sanitize.js';
import { toPlainText } from '../../core/plaintext.js';
import { layoutSlides, normalizeOptions, renderSlideBlob, zipBlobs } from '../../core/image-export.js';
import { downloadBlob, fileStem } from '../../core/filenames.js';

/** Markdown options derived from settings, with a stable identity. */
export function useMdOptions() {
  const { settings } = useStudio();
  return useMemo(
    () => ({ breaks: settings.preserveLineBreaks !== false, preserveBlankLines: settings.preserveBlankLines !== false }),
    [settings.preserveLineBreaks, settings.preserveBlankLines]
  );
}

export function useRendered(markdown) {
  const mdOptions = useMdOptions();
  return useMemo(() => {
    let html = '';
    let plain = '';
    try {
      html = sanitizeHtml(renderMarkdown(markdown, mdOptions));
      plain = toPlainText(markdown, mdOptions);
    } catch (error) {
      html = '<p>Preview failed to render this text.</p>';
      plain = markdown;
      console.error('[modshub] render failed', error);
    }
    return { html, plain, mdOptions };
  }, [markdown, mdOptions]);
}

/**
 * Lays out the slides for the current post/options (debounced) and exposes
 * download helpers. The slide nodes are what the Export Preview displays.
 */
export function useImageExport(post, html) {
  const { settings, categoryById, toast } = useStudio();
  const stored = settings.imageExport || {};
  const options = useMemo(() => normalizeOptions(stored), [stored]);
  const [state, setState] = useState({ loading: true, slides: [], warnings: [], width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const category = categoryById(post.category);

  const key = JSON.stringify([html, options, post.image, category.name, category.color, post.title]);
  useEffect(() => {
    const id = request.current + 1;
    request.current = id;
    setState((s) => ({ ...s, loading: true }));
    const timer = window.setTimeout(async () => {
      try {
        const out = await layoutSlides({
          html,
          options,
          image: post.image,
          title: post.title,
          category: { name: category.name, color: category.color },
        });
        if (request.current === id) setState({ loading: false, ...out });
      } catch (error) {
        console.error('[modshub] layout failed', error);
        if (request.current === id) setState({ loading: false, slides: [], warnings: [`Could not lay out the image: ${error.message}`], width: 0, height: 0 });
      }
    }, 280);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const download = async ({ index = null } = {}) => {
    if (busy || state.slides.length === 0) return false;
    setBusy(true);
    try {
      const stem = fileStem(post.title, 'post');
      const targets = index === null ? state.slides : [state.slides[index]];
      const blobs = [];
      for (const slide of targets) {
        // Always rasterise at the real size, whatever the preview scale is.
        blobs.push(await renderSlideBlob(slide, { width: state.width, height: parseInt(slide.style.height, 10) || state.height }));
      }
      if (blobs.length === 1) {
        const n = index === null ? '' : `-${index + 1}`;
        downloadBlob(blobs[0], `${stem}${n}.png`);
        toast('Image downloaded');
      } else {
        const zip = await zipBlobs(blobs.map((blob, i) => ({ name: `${stem}-${String(i + 1).padStart(2, '0')}.png`, blob })));
        downloadBlob(zip, `${stem}-slides.zip`);
        toast(`${blobs.length} slides downloaded as a ZIP`);
      }
      return true;
    } catch (error) {
      console.error('[modshub] image export failed', error);
      toast(`Could not create the image: ${error.message || error}`, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { options, state, busy, download };
}
