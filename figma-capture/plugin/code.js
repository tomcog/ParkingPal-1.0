/**
 * Figma plugin main thread (code.js)
 *
 * Receives a layer tree from ui.html (produced by the companion Puppeteer
 * server) and creates editable Figma nodes on the target page/frame.
 *
 * Target node: 153:2590  ("From Cursor" canvas in ParkingPal-design)
 *
 * NOTE: written without ??, ?., or other ES2020+ syntax — Figma's plugin
 * sandbox runs an older JS engine (roughly ES2017).
 */

var TARGET_NODE_ID = '153:2590';

figma.showUI(__html__, { width: 420, height: 560, title: 'Dev Server \u2192 Figma' });

// ─── Message handler ──────────────────────────────────────────────────────────

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'CREATE_LAYERS') {
    try {
      await importLayers(msg.layerData, msg.images || {});
      figma.ui.postMessage({ type: 'DONE' });
    } catch (err) {
      // Include stack so we can see the exact line
      var detail = err.message + (err.stack ? ' | ' + err.stack.split('\n')[1] : '');
      figma.ui.postMessage({ type: 'ERROR', message: detail });
      figma.notify('Import failed: ' + err.message, { error: true });
      console.error('Import error:', err);
    }
  }

  if (msg.type === 'CANCEL') {
    figma.closePlugin();
  }
};

// ─── Main import function ─────────────────────────────────────────────────────

async function importLayers(layerData, imagesB64) {
  console.log('[import] v2 — layerData type:', layerData && layerData.type, 'images count:', Object.keys(imagesB64).length);
  var step = 'init';
  try {
    // 1. Switch to the target page and find the anchor node
    step = 'find anchor node';
    var anchorNode = figma.getNodeById(TARGET_NODE_ID);
    var targetPage = figma.currentPage;
    var dropX      = figma.viewport.center.x;
    var dropY      = figma.viewport.center.y;

    if (anchorNode) {
      var n = anchorNode;
      while (n && n.type !== 'PAGE') n = n.parent;
      if (n && n.type === 'PAGE') {
        figma.currentPage = n;
        targetPage = n;
      }
      var tf = anchorNode.absoluteTransform;
      if (tf && tf[0] && tf[1]) {
        dropX = tf[0][2] + (anchorNode.width || 0) + 80;
        dropY = tf[1][2];
      }
    }

    // 2. Pre-load all fonts found in the layer tree
    step = 'collect fonts';
    var fonts = new Set();
    collectFonts(layerData, fonts);
    fonts.add('Inter|Regular');

    step = 'load fonts';
    var fontKeys = Array.from(fonts);
    var loadResults = await Promise.allSettled(
      fontKeys.map(function(key) {
        var parts  = key.split('|');
        return figma.loadFontAsync({ family: parts[0], style: parts[1] });
      })
    );

    var loadedFonts = new Set();
    fontKeys.forEach(function(key, i) {
      if (loadResults[i].status === 'fulfilled') loadedFonts.add(key);
    });

    // 3. Register images
    step = 'register images';
    var imageMap = {};
    var imageEntries = Object.keys(imagesB64);
    console.log('[import] images received:', imageEntries.length, imageEntries.join(', '));
    for (var ei = 0; ei < imageEntries.length; ei++) {
      var url = imageEntries[ei];
      var b64 = imagesB64[url];
      try {
        var bytes = Uint8Array.from(atob(b64), function(c) { return c.charCodeAt(0); });
        var img   = figma.createImage(bytes);
        imageMap[url] = img.hash;
        console.log('[import] registered image:', url, '→', img.hash.slice(0, 12) + '…');
      } catch (e) {
        console.error('[import] createImage FAILED for', url, ':', e && e.message ? e.message : String(e));
      }
    }

    // 4. Build the node tree
    step = 'build node tree';
    var rootNode = createNode(layerData, imageMap, loadedFonts);
    if (!rootNode) {
      figma.notify('Nothing to import - layer tree was empty.', { error: true });
      return;
    }

    // 5. Place on page
    step = 'place on page';
    rootNode.x = dropX;
    rootNode.y = dropY;
    targetPage.appendChild(rootNode);

    // 6. Focus viewport
    step = 'focus viewport';
    figma.viewport.scrollAndZoomIntoView([rootNode]);
    figma.notify('Imported "' + rootNode.name + '" as ' + countNodes(rootNode) + ' layers');

  } catch (err) {
    throw new Error('[step: ' + step + '] ' + err.message);
  }
}

// ─── Font collection ──────────────────────────────────────────────────────────

function collectFonts(layer, out) {
  if (layer.type === 'TEXT') {
    out.add((layer.fontFamily || 'Inter') + '|' + (layer.fontStyle || 'Regular'));
  }
  var children = layer.children || [];
  for (var i = 0; i < children.length; i++) collectFonts(children[i], out);
}

// ─── Node factory ─────────────────────────────────────────────────────────────

function createNode(layer, imageMap, loadedFonts) {
  if (!layer || layer.visible === false) return null;
  try {
    if (layer.type === 'TEXT')      return createTextNode(layer, loadedFonts);
    if (layer.type === 'RECTANGLE') return createRectNode(layer, imageMap);
    return createFrameNode(layer, imageMap, loadedFonts);
  } catch (err) {
    throw new Error('[node "' + (layer.name || '?') + '" type=' + layer.type + '] ' + err.message);
  }
}

// ── Frame ─────────────────────────────────────────────────────────────────────

function createFrameNode(layer, imageMap, loadedFonts) {
  var frame = figma.createFrame();
  frame.name         = layer.name || 'Frame';
  frame.x            = layer.x !== undefined ? layer.x : 0;
  frame.y            = layer.y !== undefined ? layer.y : 0;
  frame.resize(Math.max(layer.w || 1, 1), Math.max(layer.h || 1, 1));
  frame.opacity      = layer.opacity !== undefined ? layer.opacity : 1;
  frame.clipsContent = layer.clipsContent ? true : false;

  applyFills(frame, layer.fills, imageMap);
  applyStrokes(frame, layer);
  applyCornerRadius(frame, layer);
  applyEffects(frame, layer.effects);

  var children = layer.children || [];
  for (var i = 0; i < children.length; i++) {
    if (!children[i]) continue;
    try {
      var childNode = createNode(children[i], imageMap, loadedFonts);
      if (childNode) frame.appendChild(childNode);
    } catch (childErr) {
      // skip one bad child rather than aborting the whole frame
    }
  }

  return frame;
}

// ── Rectangle ─────────────────────────────────────────────────────────────────

function createRectNode(layer, imageMap) {
  var rect = figma.createRectangle();
  rect.name    = layer.name || 'Rectangle';
  rect.x       = layer.x !== undefined ? layer.x : 0;
  rect.y       = layer.y !== undefined ? layer.y : 0;
  rect.resize(Math.max(layer.w || 1, 1), Math.max(layer.h || 1, 1));
  rect.opacity = layer.opacity !== undefined ? layer.opacity : 1;

  applyFills(rect, layer.fills, imageMap);
  applyStrokes(rect, layer);
  applyCornerRadius(rect, layer);
  applyEffects(rect, layer.effects);

  return rect;
}

// ── Text ──────────────────────────────────────────────────────────────────────

function createTextNode(layer, loadedFonts) {
  var text = figma.createText();
  text.name    = layer.name || 'Text';
  text.x       = layer.x !== undefined ? layer.x : 0;
  text.y       = layer.y !== undefined ? layer.y : 0;
  text.opacity = layer.opacity !== undefined ? layer.opacity : 1;

  var wantedKey = (layer.fontFamily || 'Inter') + '|' + (layer.fontStyle || 'Regular');
  var useKey    = loadedFonts.has(wantedKey) ? wantedKey : 'Inter|Regular';
  var parts     = useKey.split('|');
  text.fontName = { family: parts[0], style: parts[1] };

  text.fontSize = layer.fontSize || 14;

  if (layer.letterSpacing) {
    text.letterSpacing = { value: layer.letterSpacing, unit: 'PIXELS' };
  }

  if (layer.lineHeight && layer.lineHeight > 0) {
    text.lineHeight = { value: layer.lineHeight, unit: 'PIXELS' };
  }

  text.textAlignHorizontal = layer.textAlignHorizontal || 'LEFT';

  try {
    text.characters = layer.content || '';
  } catch (e) {
    text.characters = '';
  }

  if (layer.color) {
    var r = layer.color.r, g = layer.color.g, b = layer.color.b;
    var a = layer.color.a !== undefined ? layer.color.a : 1;
    text.fills = [{ type: 'SOLID', color: { r: r, g: g, b: b }, opacity: a }];
  }

  text.textAutoResize = 'HEIGHT';
  try {
    text.resize(Math.max(layer.w || 1, 1), text.height);
  } catch (e) {}

  return text;
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function applyFills(node, fills, imageMap) {
  if (!fills || fills.length === 0) { node.fills = []; return; }

  var out = [];
  for (var i = 0; i < fills.length; i++) {
    var f = fills[i];
    if (f.type === 'SOLID' && f.color) {
      var a = f.color.a !== undefined ? f.color.a : 1;
      out.push({ type: 'SOLID', color: { r: f.color.r, g: f.color.g, b: f.color.b }, opacity: a });

    } else if (f.type === 'IMAGE' && f.imageUrl) {
      var hash = imageMap[f.imageUrl];
      if (hash) out.push({ type: 'IMAGE', imageHash: hash, scaleMode: f.scaleMode || 'FILL' });

    } else if (f.type === 'GRADIENT_LINEAR' && f.gradientStops) {
      var validStops = f.gradientStops.filter(function(s) { return s && s.color; });
      if (validStops.length >= 2) {
        out.push({
          type: 'GRADIENT_LINEAR',
          gradientTransform: f.gradientTransform || [[1, 0, 0], [0, 1, 0]],
          gradientStops: validStops.map(function(s) {
            var sa = s.color.a !== undefined ? s.color.a : 1;
            return { position: s.position, color: { r: s.color.r, g: s.color.g, b: s.color.b, a: sa } };
          }),
        });
      }
    }
  }
  node.fills = out;
}

function applyStrokes(node, layer) {
  if (!layer.strokes || layer.strokes.length === 0) return;
  var out = [];
  for (var i = 0; i < layer.strokes.length; i++) {
    var s = layer.strokes[i];
    if (!s || !s.color) continue; // skip malformed strokes
    var a = s.color.a !== undefined ? s.color.a : 1;
    out.push({ type: 'SOLID', color: { r: s.color.r, g: s.color.g, b: s.color.b }, opacity: a });
  }
  node.strokes = out;
  if (layer.strokeWeight) node.strokeWeight = layer.strokeWeight;
  if (layer.strokeAlign)  node.strokeAlign  = layer.strokeAlign;
}

function applyCornerRadius(node, layer) {
  if (!layer.cornerRadius) return;
  var tl = layer.tl || 0, tr = layer.tr || 0, bl = layer.bl || 0, br = layer.br || 0;
  if (tl === tr && tl === bl && tl === br) {
    node.cornerRadius = layer.cornerRadius;
  } else {
    node.topLeftRadius     = tl;
    node.topRightRadius    = tr;
    node.bottomLeftRadius  = bl;
    node.bottomRightRadius = br;
  }
}

function applyEffects(node, effects) {
  if (!effects || effects.length === 0) return;
  var out = [];
  for (var i = 0; i < effects.length; i++) {
    var e = effects[i];
    if (!e || e.type !== 'DROP_SHADOW' || !e.color) continue; // skip if no color
    var ea = e.color.a !== undefined ? e.color.a : 0.2;
    var ox = e.offset ? e.offset.x : 0;
    var oy = e.offset ? e.offset.y : 4;
    out.push({
      type: 'DROP_SHADOW',
      color: { r: e.color.r, g: e.color.g, b: e.color.b, a: ea },
      offset: { x: ox, y: oy },
      radius: e.radius || 8,
      spread: e.spread || 0,
      visible: true,
      blendMode: 'NORMAL',
    });
  }
  node.effects = out;
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function countNodes(node) {
  var count = 1;
  var children = node.children || [];
  for (var i = 0; i < children.length; i++) count += countNodes(children[i]);
  return count;
}
