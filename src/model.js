// Fetches a property page and decodes the data model embedded in it (photos, floorplans,
// location, prices…). Results are cached per property for the life of the page.
(() => {
  'use strict';

  const cache = new Map();

  function fetchProperty(id) {
    id = String(id);
    if (!cache.has(id)) {
      const pending = readThisPage(id).catch(() =>
        fetch(`/properties/${id}`, { credentials: 'include' })
          .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.text();
          })
          .then(parsePageModel));
      pending.catch(() => cache.delete(id));
      cache.set(id, pending);
    }
    return cache.get(id);
  }

  // On the property's own page the model is already in the document.
  async function readThisPage(id) {
    if (/^\/properties\/(\d+)/.exec(location.pathname)?.[1] !== id) throw new Error('not this property’s page');
    const script = [...document.scripts].find(s => /PAGE_MODEL\s*=/.test(s.textContent));
    if (!script) throw new Error('page model not found');
    return parsePageModel(script.textContent);
  }

  function parsePageModel(html) {
    const m = /window\.(?:__)?PAGE_MODEL\s*=\s*/.exec(html);
    if (!m) throw new Error('page model not found');
    const outer = JSON.parse(objectLiteralAt(html, m.index + m[0].length));
    const model = typeof outer.data === 'string' ? unflatten(JSON.parse(outer.data)) : outer;
    if (!model || !model.propertyData) throw new Error('page model has no propertyData');
    return model.propertyData;
  }

  // The `{…}` starting at `start`, found by matching braces outside of strings.
  function objectLiteralAt(src, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error('unterminated page model');
  }

  // The model is serialised as one flat array: objects and arrays hold indices into it,
  // index 0 is the root and negative indices stand for null/undefined.
  function unflatten(arr) {
    const built = new Map();
    const at = i => {
      if (i < 0) return null;
      if (built.has(i)) return built.get(i);
      const v = arr[i];
      if (v === null || typeof v !== 'object') return v;
      const out = Array.isArray(v) ? [] : {};
      built.set(i, out);
      if (Array.isArray(v)) for (const x of v) out.push(typeof x === 'number' ? at(x) : x);
      else for (const k of Object.keys(v)) out[k] = typeof v[k] === 'number' ? at(v[k]) : v[k];
      return out;
    };
    return at(0);
  }

  globalThis.RMX = { fetchProperty };
})();
