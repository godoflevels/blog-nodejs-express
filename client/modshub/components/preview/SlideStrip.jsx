import { useLayoutEffect, useRef, useState } from 'react';

/** Mounts laid-out slide nodes scaled to the available width. */
export default function SlideStrip({ slides, width, onDownload, busy }) {
  const hostRef = useRef(null);
  const [scale, setScale] = useState(0.3);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const update = () => {
      const avail = el.clientWidth;
      if (avail > 0 && width > 0) setScale(Math.min(1, avail / width));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div className="ms-slides" ref={hostRef}>
      {slides.map((slide, i) => (
        <SlideFrame key={i} slide={slide} scale={scale} index={i} total={slides.length} onDownload={onDownload} busy={busy} />
      ))}
    </div>
  );
}

function SlideFrame({ slide, scale, index, total, onDownload, busy }) {
  const holder = useRef(null);
  const h = parseInt(slide.style.height, 10) || 0;
  const w = parseInt(slide.style.width, 10) || 0;

  useLayoutEffect(() => {
    const el = holder.current;
    el.replaceChildren(slide);
    return () => {
      if (slide.parentNode === el) el.removeChild(slide);
    };
  }, [slide]);

  return (
    <figure className="ms-slides__item">
      <div className="ms-slides__frame" style={{ width: w * scale, height: h * scale }}>
        <div ref={holder} className="ms-slides__scaler" style={{ transform: `scale(${scale})`, width: w, height: h }} />
      </div>
      <figcaption>
        <span>{total > 1 ? `Slide ${index + 1} of ${total}` : 'Image'} · {w} × {h}px</span>
        {total > 1 ? (
          <button type="button" className="ms-linkbtn" disabled={busy} onClick={() => onDownload({ index })}>
            Download PNG
          </button>
        ) : null}
      </figcaption>
    </figure>
  );
}
