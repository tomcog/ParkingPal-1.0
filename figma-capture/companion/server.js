/**
 * figma-capture companion server
 *
 * Launches a headless Chromium via Puppeteer, navigates to the target URL,
 * waits for the React app to hydrate, then extracts the full rendered DOM
 * (positions, computed styles, text, images) as a JSON layer tree that the
 * Figma plugin can consume to create editable nodes.
 *
 * Start: node server.js
 * Default port: 3333
 */

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3333;

app.use(cors());
app.use(express.json());

// ─── GET /capture ────────────────────────────────────────────────────────────
// Query params:
//   url      – full URL to capture (default: http://localhost:5173/)
//   wait     – extra ms to wait after networkidle / selector (default: 2500)
//   selector – CSS selector to wait for before capturing (optional)
//              e.g. "input[type=email]" to wait for the signin form
//   width    – viewport width   (default: 1440)
//   height   – viewport height  (default: 900)
app.get('/capture', async (req, res) => {
  const url      = req.query.url      || 'http://localhost:5173/';
  const wait     = parseInt(req.query.wait   || '2500', 10);
  const selector = req.query.selector || null;
  const width    = parseInt(req.query.width  || '1440', 10);
  const height   = parseInt(req.query.height || '900',  10);

  console.log(`[capture] ${url}  viewport ${width}×${height}`);

  try {
    const result = await capturePage(url, { wait, selector, width, height });
    res.json(result);
  } catch (err) {
    console.error('[capture] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 figma-capture companion ready at http://localhost:${PORT}`);
  console.log(`   GET /capture?url=http://localhost:5173/signin\n`);
});

// ─── Core capture function ────────────────────────────────────────────────────

async function capturePage(url, { wait, selector, width, height }) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 2 });

    // Navigate and wait for network to settle
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });

    // If a selector is provided, wait for it to appear (e.g. the signin form
    // needs a moment for Supabase auth to check the session and resolve).
    if (selector) {
      try {
        await page.waitForSelector(selector, { timeout: 8_000 });
      } catch (_) {
        console.warn(`[warn] selector "${selector}" not found within 8 s – capturing anyway`);
      }
    }

    // Extra settling time (animations, lazy images, etc.)
    await new Promise(r => setTimeout(r, wait));

    // Full-page screenshot (base64 PNG) for reference in plugin UI
    const screenshot = await page.screenshot({
      encoding: 'base64',
      type: 'png',
      fullPage: false, // viewport only – matches getBoundingClientRect coords
    });

    // Main DOM → layer tree extraction (runs inside the page context)
    const extracted  = await page.evaluate(extractLayerTree);
    const layers     = extracted.root;
    const svgCaptures = extracted.svgCaptures || {};

    // Pre-fetch everything server-side so the sandboxed plugin UI doesn't need
    // to reach any host other than localhost:3333.
    const images = {};

    // 1. Take Puppeteer element screenshots for each SVG icon
    for (const [key, b] of Object.entries(svgCaptures)) {
      if (!b || b.width < 1 || b.height < 1) continue;
      try {
        const b64 = await page.screenshot({
          encoding: 'base64',
          type: 'png',
          clip: { x: Math.round(b.left), y: Math.round(b.top),
                  width: Math.round(b.width), height: Math.round(b.height) },
        });
        if (b64) images[key] = b64;
      } catch (_) {}
    }

    // 2. Collect all other image URLs from the layer tree and fetch them via Node
    function collectFillUrls(layer, set) {
      for (const f of (layer.fills || [])) {
        if (f.type === 'IMAGE' && f.imageUrl && !images[f.imageUrl]) set.add(f.imageUrl);
      }
      for (const child of (layer.children || [])) collectFillUrls(child, set);
    }
    const imgUrls = new Set();
    collectFillUrls(layers, imgUrls);

    const http  = require('http');
    const https = require('https');
    // Only fetch raster images (not .svg — figma.createImage doesn't support SVG)
    const rasterUrls = Array.from(imgUrls).filter(u => !/\.svg(\?|$)/i.test(u));
    await Promise.all(rasterUrls.map(url => new Promise(resolve => {
      try {
        const mod = url.startsWith('https:') ? https : http;
        mod.get(url, res => {
          if (res.statusCode !== 200) { res.resume(); return resolve(); }
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => { images[url] = Buffer.concat(chunks).toString('base64'); resolve(); });
          res.on('error', resolve);
        }).on('error', resolve);
      } catch (_) { resolve(); }
    })));

    return { layers, screenshot, images, viewport: { width, height } };
  } finally {
    await browser.close();
  }
}

// ─── DOM extraction (runs inside Puppeteer page context) ─────────────────────
// This entire function is serialised and sent to the browser, so it must be
// self-contained (no imports, no closures over node.js variables).

function extractLayerTree() {
  // SVG tracking — populated by extractElement, read at the end
  window.__svgCaptures = {};
  window.__svgIdx      = 0;

  // ── helpers ────────────────────────────────────────────────────────────────

  function parseColor(str) {
    if (!str || str === 'transparent') return null;
    const m = str.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)/);
    if (!m) return null;
    const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (a === 0) return null;
    return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a };
  }

  function parseLinearGradient(str, rect) {
    // Matches: linear-gradient(180deg, rgba(...) 0%, rgba(...) 100%)
    const stops = [];
    const stopRe = /(rgba?\([^)]+\)|#[\da-f]+)\s+([\d.]+)%/gi;
    let m;
    while ((m = stopRe.exec(str)) !== null) {
      const color = parseColor(m[1]);
      if (color) stops.push({ color, position: parseFloat(m[2]) / 100 });
    }
    if (stops.length < 2) return null;

    // Determine angle (degrees → figma transform)
    const angleMatch = str.match(/(\d+)deg/);
    const angleDeg = angleMatch ? parseFloat(angleMatch[1]) : 180;
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    return {
      type: 'GRADIENT_LINEAR',
      gradientTransform: [
        [cos, -sin, 0.5 - cos * 0.5 + sin * 0.5],
        [sin,  cos, 0.5 - sin * 0.5 - cos * 0.5],
      ],
      gradientStops: stops,
    };
  }

  function parseBoxShadow(shadow) {
    if (!shadow || shadow === 'none') return [];
    const effects = [];
    // Simple single-shadow parser: "Xpx Ypx Rpx Spx rgba(...)"
    const parts = shadow.split(/(?<=\))\s*,\s*/); // split multiple shadows
    for (const part of parts) {
      const m = part.match(
        /(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?\s+(rgba?\([^)]+\)|#[\da-f]+)/i
      );
      if (!m) continue;
      const color = parseColor(m[5]);
      if (!color) continue;
      effects.push({
        type: 'DROP_SHADOW',
        offset: { x: parseFloat(m[1]), y: parseFloat(m[2]) },
        radius: parseFloat(m[3]),
        spread: m[4] ? parseFloat(m[4]) : 0,
        color,
        visible: true,
      });
    }
    return effects;
  }

  function getFills(style, element) {
    const fills = [];

    // Background color
    const bgColor = parseColor(style.backgroundColor);
    if (bgColor) fills.push({ type: 'SOLID', color: bgColor });

    // Background image: gradient or url()
    const bgImg = style.backgroundImage;
    if (bgImg && bgImg !== 'none') {
      if (bgImg.includes('linear-gradient')) {
        const grad = parseLinearGradient(bgImg, null);
        if (grad) fills.push(grad);
      } else {
        const urlM = bgImg.match(/url\(["']?([^"')]+)["']?\)/);
        if (urlM) fills.push({ type: 'IMAGE', imageUrl: urlM[1], scaleMode: 'FILL' });
      }
    }

    // <img> elements
    if (element.tagName === 'IMG' && element.src) {
      fills.push({ type: 'IMAGE', imageUrl: element.src, scaleMode: 'FIT' });
    }

    return fills;
  }

  function getStrokes(style) {
    const strokes = [];
    const bw = parseFloat(style.borderWidth) || 0;
    if (bw > 0 && style.borderStyle !== 'none') {
      const color = parseColor(style.borderColor);
      if (color) {
        strokes.push({ type: 'SOLID', color });
        return { strokes, strokeWeight: bw, strokeAlign: 'INSIDE' };
      }
    }
    // Outline
    const ow = parseFloat(style.outlineWidth) || 0;
    if (ow > 0 && style.outlineStyle !== 'none') {
      const color = parseColor(style.outlineColor);
      if (color) {
        strokes.push({ type: 'SOLID', color });
        return { strokes, strokeWeight: ow, strokeAlign: 'OUTSIDE' };
      }
    }
    return { strokes: [], strokeWeight: 0, strokeAlign: 'INSIDE' };
  }

  function getCornerRadius(style) {
    const tl = parseFloat(style.borderTopLeftRadius)    || 0;
    const tr = parseFloat(style.borderTopRightRadius)   || 0;
    const bl = parseFloat(style.borderBottomLeftRadius) || 0;
    const br = parseFloat(style.borderBottomRightRadius)|| 0;
    return { cornerRadius: Math.max(tl, tr, bl, br), tl, tr, bl, br };
  }

  function isVisible(el, style) {
    if (style.display === 'none')       return false;
    if (style.visibility === 'hidden')  return false;
    if (parseFloat(style.opacity) <= 0) return false;
    return true;
  }

  function hasVisualContent(style, el) {
    const bg = style.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return true;
    if (style.backgroundImage && style.backgroundImage !== 'none')  return true;
    const bw = parseFloat(style.borderWidth) || 0;
    if (bw > 0 && style.borderStyle !== 'none') return true;
    if (style.boxShadow && style.boxShadow !== 'none') return true;
    const tag = el.tagName;
    if (['IMG', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'SVG', 'svg'].includes(tag)) return true;
    return false;
  }

  function getElementName(el) {
    const tag  = el.tagName.toLowerCase();
    const id   = el.id   ? `#${el.id}`  : '';
    const cls  = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';

    // Meaningful names for semantic elements
    const text = el.textContent.trim().slice(0, 30);
    if (text && ['h1','h2','h3','h4','h5','h6','p','span','label','button','a','li'].includes(tag)) {
      return `${tag}: ${text}`;
    }
    if (el.tagName === 'INPUT') return `input[${el.type || 'text'}]${el.placeholder ? ': ' + el.placeholder : ''}`;
    return (id || cls || tag).slice(0, 50);
  }

  // ── font helpers ──────────────────────────────────────────────────────────

  function fontStyleFromWeight(weight, italic) {
    const w = parseInt(weight, 10) || 400;
    let s = w >= 800 ? 'ExtraBold'
          : w >= 700 ? 'Bold'
          : w >= 600 ? 'SemiBold'
          : w >= 500 ? 'Medium'
          : 'Regular';
    if (italic) s = (s === 'Regular' ? '' : s + ' ') + 'Italic';
    return s.trim() || 'Regular';
  }

  // ── element → layer ───────────────────────────────────────────────────────

  function extractElement(el, parentRect) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

    const tag = el.tagName.toUpperCase();
    if (['SCRIPT','STYLE','NOSCRIPT','META','LINK','HEAD','TITLE','SVG','svg'].includes(tag)) {
      // Treat SVG as opaque rectangle
      if (tag !== 'SVG' && tag !== 'svg') return null;
    }

    const style = window.getComputedStyle(el);
    if (!isVisible(el, style)) return null;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 && rect.height < 1) return null;

    const x = Math.round(rect.left - (parentRect ? parentRect.left : 0));
    const y = Math.round(rect.top  - (parentRect ? parentRect.top  : 0));
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);

    const fills        = getFills(style, el);
    const { strokes, strokeWeight, strokeAlign } = getStrokes(style);
    const { cornerRadius, tl, tr, bl, br }       = getCornerRadius(style);
    const effects      = parseBoxShadow(style.boxShadow);
    const opacity      = parseFloat(style.opacity) ?? 1;
    const isItalic     = style.fontStyle === 'italic';
    const fontFamilyRaw= style.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    const fontFamily   = fontFamilyRaw || 'Inter';
    const fontWeight   = parseInt(style.fontWeight, 10) || 400;
    const fontStyle    = fontStyleFromWeight(fontWeight, isItalic);
    const fontSize     = parseFloat(style.fontSize) || 14;
    const color        = parseColor(style.color);

    // ── SVG: record absolute bounds so Puppeteer can screenshot it server-side ─
    if (tag === 'SVG' || tag === 'svg') {
      const svgKey = '__svg_' + (++window.__svgIdx) + '__';
      window.__svgCaptures[svgKey] = { left: rect.left, top: rect.top, width: w, height: h };
      return {
        type: 'RECTANGLE',
        name: getElementName(el),
        x, y, w, h,
        fills: [{ type: 'IMAGE', imageUrl: svgKey, scaleMode: 'FIT' }],
        strokes: [], strokeWeight: 0, strokeAlign: 'INSIDE',
        cornerRadius: 0, tl: 0, tr: 0, bl: 0, br: 0,
        effects: [], opacity, children: [],
      };
    }

    // ── IMG: screenshot via Puppeteer (handles SVG, PNG, JPEG — figma.createImage
    //        only accepts raster, so we never pass raw SVG bytes) ─────────────
    if (tag === 'IMG') {
      const imgKey = '__img_' + (++window.__svgIdx) + '__';
      window.__svgCaptures[imgKey] = { left: rect.left, top: rect.top, width: w, height: h };
      return {
        type: 'RECTANGLE',
        name: el.alt || 'image',
        x, y, w, h,
        fills: [{ type: 'IMAGE', imageUrl: imgKey, scaleMode: 'FIT' }],
        strokes, strokeWeight, strokeAlign,
        cornerRadius, tl, tr, bl, br,
        effects, opacity, children: [],
      };
    }

    // ── BUTTON / role=button: screenshot for pixel-perfect rendering ──────────
    // Buttons often mix SVG icons with text nodes — reconstructing their layout
    // correctly is unreliable. A Puppeteer screenshot is always faithful.
    if (tag === 'BUTTON' || el.getAttribute('role') === 'button') {
      const btnKey = '__btn_' + (++window.__svgIdx) + '__';
      window.__svgCaptures[btnKey] = { left: rect.left, top: rect.top, width: w, height: h };
      return {
        type: 'RECTANGLE',
        name: el.textContent.trim().slice(0, 40) || 'button',
        x, y, w, h,
        fills: [{ type: 'IMAGE', imageUrl: btnKey, scaleMode: 'FIT' }],
        strokes: [], strokeWeight: 0, strokeAlign: 'INSIDE',
        cornerRadius, tl, tr, bl, br,
        effects, opacity, children: [],
      };
    }

    // ── Pure text leaf node ────────────────────────────────────────────────
    const directText = Array.from(el.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim())
      .map(n => n.textContent.trim())
      .join(' ');

    if (directText && el.children.length === 0) {
      const align = style.textAlign;
      return {
        type: 'TEXT',
        name: directText.slice(0, 40),
        content: el.textContent.trim(),
        x, y, w, h,
        fontFamily, fontStyle, fontWeight, fontSize,
        color: color || { r: 0, g: 0, b: 0, a: 1 },
        textAlignHorizontal: align === 'center' ? 'CENTER'
                           : align === 'right'  ? 'RIGHT'
                           : align === 'justify'? 'JUSTIFIED'
                           : 'LEFT',
        lineHeight: parseFloat(style.lineHeight) || fontSize * 1.4,
        letterSpacing: parseFloat(style.letterSpacing) || 0,
        opacity,
        fills: [], strokes: [], effects: [], children: [],
      };
    }

    // ── INPUT / TEXTAREA: frame + placeholder text ─────────────────────────
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      const placeholder = el.placeholder || '';
      const value       = el.value || '';
      const displayText = value || placeholder;
      const textColor   = value
        ? (color || { r: 0, g: 0, b: 0, a: 1 })
        : { r: 0.6, g: 0.6, b: 0.6, a: 1 }; // placeholder grey

      // Vertically center the text within the input (CSS inputs center text by default)
      const paddingLeft = parseFloat(style.paddingLeft) || 8;
      const textY = tag === 'TEXTAREA' ? (parseFloat(style.paddingTop) || 8)
                                       : Math.max(0, Math.round((h - fontSize * 1.2) / 2));

      const children = displayText ? [{
        type: 'TEXT',
        name: displayText.slice(0, 40),
        content: displayText,
        x: paddingLeft,
        y: textY,
        w: Math.max(w - paddingLeft - (parseFloat(style.paddingRight) || 8), 1),
        h: Math.round(fontSize * 1.2),
        fontFamily, fontStyle, fontWeight, fontSize,
        color: textColor,
        textAlignHorizontal: 'LEFT',
        lineHeight: fontSize * 1.2,
        letterSpacing: 0,
        opacity: 1,
        fills: [], strokes: [], effects: [], children: [],
      }] : [];

      return {
        type: 'FRAME',
        name: getElementName(el),
        x, y, w, h,
        fills, strokes, strokeWeight, strokeAlign,
        cornerRadius, tl, tr, bl, br,
        effects, opacity, children,
        clipsContent: false,
      };
    }

    // ── Generic container: recurse ─────────────────────────────────────────
    const children = [];

    // Capture direct text nodes (e.g. "Sign in" beside an SVG icon in a <button>).
    // Only do this when there ARE element children — otherwise the TEXT leaf branch above handles it.
    const directTextNodes = Array.from(el.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (directTextNodes.length > 0 && el.children.length > 0) {
      const txt   = directTextNodes.map(n => n.textContent.trim()).join(' ');
      const align = style.textAlign;
      children.push({
        type: 'TEXT', name: txt.slice(0, 40), content: txt,
        x: 0, y: 0, w, h,
        fontFamily, fontStyle, fontWeight, fontSize,
        color: color || { r: 0, g: 0, b: 0, a: 1 },
        textAlignHorizontal: align === 'center' ? 'CENTER'
                           : align === 'right'  ? 'RIGHT'
                           : align === 'justify'? 'JUSTIFIED' : 'LEFT',
        lineHeight: parseFloat(style.lineHeight) || fontSize * 1.2,
        letterSpacing: parseFloat(style.letterSpacing) || 0,
        opacity: 1, fills: [], strokes: [], effects: [], children: [],
      });
    }

    for (const child of el.children) {
      const childLayer = extractElement(child, rect);
      if (childLayer) children.push(childLayer);
    }

    const hasVisual = hasVisualContent(style, el);

    // Drop invisible wrapper divs with no visual content and exactly one child
    if (!hasVisual && children.length === 1 && effects.length === 0) {
      // Promote the single child (adjust its coords to be relative to OUR parent)
      const child = children[0];
      child.x += x;
      child.y += y;
      return child;
    }

    if (!hasVisual && children.length === 0) {
      // Check if element itself carries text (e.g. a <p> with text via ::before)
      const txt = el.textContent.trim();
      if (!txt) return null;
      return {
        type: 'TEXT', name: txt.slice(0, 40), content: txt,
        x, y, w, h,
        fontFamily, fontStyle, fontWeight, fontSize,
        color: color || { r: 0, g: 0, b: 0, a: 1 },
        textAlignHorizontal: 'LEFT',
        lineHeight: parseFloat(style.lineHeight) || fontSize * 1.4,
        letterSpacing: 0, opacity,
        fills: [], strokes: [], effects: [], children: [],
      };
    }

    return {
      type: 'FRAME',
      name: getElementName(el),
      x, y, w, h,
      fills, strokes, strokeWeight, strokeAlign,
      cornerRadius, tl, tr, bl, br,
      effects, opacity, children,
      clipsContent: style.overflow === 'hidden' || style.overflow === 'clip',
    };
  }

  // ── Build root layer (viewport) ────────────────────────────────────────────

  const bodyStyle = window.getComputedStyle(document.body);
  const rootFills = [];
  const rootBg = parseColor(bodyStyle.backgroundColor);
  if (rootBg) rootFills.push({ type: 'SOLID', color: rootBg });

  const children = [];
  for (const child of document.body.children) {
    const layer = extractElement(child, { left: 0, top: 0 });
    if (layer) children.push(layer);
  }

  return {
    root: {
      type: 'FRAME',
      name: document.title || 'Captured Page',
      x: 0, y: 0,
      w: window.innerWidth,
      h: window.innerHeight,
      fills: rootFills,
      strokes: [], strokeWeight: 0, strokeAlign: 'INSIDE',
      cornerRadius: 0, tl: 0, tr: 0, bl: 0, br: 0,
      effects: [], opacity: 1,
      children,
      clipsContent: false,
    },
    svgCaptures: window.__svgCaptures,
  };
}
