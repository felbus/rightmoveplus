// Finds the land a listing's text mentions in acres: "about 2.65 acres", "a two-acre plot",
// "half an acre", "1½ acres", "1-2 acres". Rightmove's own size in acres is the floor area
// converted, so the text is the only place the land is given.
(() => {
  'use strict';

  const VALUES = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50,
    half: 0.5, quarter: 0.25, '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3,
  };

  const NUMBER = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+`;
  const FRACTION = String.raw`[½¼¾⅓⅔]|\d\/\d`;
  const WORD = String.raw`three[\s-]quarters?|eleven|twelve|fifteen|twenty|thirty|forty|fifty|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|an|a`;
  const QUANTITY = String.raw`(?:(?:${NUMBER})(?:\s*[½¼¾⅓⅔]|\s+\d\/\d)?|${FRACTION}|${WORD})(?:\s+and\s+a\s+(?:half|quarter))?`;
  // A quantity (or range) at the end of the text before the word "acre": "2.1-", "half an ",
  // "quarter of an ", "1 to 2 ". Not part of a price or a longer number.
  const AMOUNT = new RegExp(
    String.raw`(?<![\w.,/£$€])(${QUANTITY})(?:\s*(?:-|–|to)\s*(${QUANTITY}))?\s*-?\s*(?:(?:of\s+)?an?\s+)?$`, 'i');
  const ACRE = /\bacre(?:s|age)?\b/gi;
  const SENTENCE = /\n+|(?<=[.!?])\s+(?=[A-Z])/;

  function toNumber(quantity) {
    return quantity.toLowerCase().replace(/,/g, '').replace(/three[\s-]quarters?/, '¾')
      .split(/\s+and\s+a\s+|\s+|(?=[½¼¾⅓⅔])/)
      .reduce((sum, part) => {
        const fraction = /^(\d)\/(\d)$/.exec(part);
        return sum + (fraction ? fraction[1] / fraction[2] : part in VALUES ? VALUES[part] : Number(part));
      }, 0);
  }

  function amountLabel([, low, high]) {
    const lo = toNumber(low);
    const hi = high && toNumber(high);
    const n = v => v.toLocaleString('en-GB', { maximumFractionDigits: 2 });
    if (!(lo > 0)) return null;
    if (hi > lo) return `${n(lo)}–${n(hi)} acres`;
    return `${n(lo)} ${lo === 1 ? 'acre' : 'acres'}`;
  }

  // The sentence around a mention, cut down to about 160 characters.
  function excerpt(sentence, start, end) {
    sentence = sentence.trim().replace(/\s+/g, ' ');
    if (sentence.length <= 160) return sentence;
    const from = Math.max(0, sentence.lastIndexOf(' ', Math.max(0, start - 70)));
    const to = sentence.indexOf(' ', end + 70);
    return (from > 0 ? '…' : '') + sentence.slice(from, to < 0 ? undefined : to).trim() + (to < 0 ? '' : '…');
  }

  // Every distinct amount in acres in `texts` (plain text, in the order given), each with the
  // sentence it came from. A mention with no amount ("acres of woodland", "Acre Lane") is
  // returned once, with `amount: null`.
  function findAcres(texts) {
    const found = new Map();
    for (const text of texts) {
      if (!text) continue;
      for (const sentence of text.split(SENTENCE)) {
        for (const m of sentence.matchAll(ACRE)) {
          const quantity = AMOUNT.exec(sentence.slice(0, m.index));
          const amount = quantity ? amountLabel(quantity) : null;
          if (!found.has(amount)) found.set(amount, excerpt(sentence, m.index, m.index + m[0].length));
        }
      }
    }
    return [...found].map(([amount, context]) => ({ amount, context }));
  }

  // The acres in a property's key features, search summary and description. `pd` is the
  // property page's data and `listing` its search result; either may be missing.
  function propertyAcres(pd, listing) {
    return findAcres([
      ...(pd?.keyFeatures || listing?.keyFeatures?.map(f => f.description) || []),
      listing?.summary, // can differ from the page's description
      pd?.text?.description && htmlText(pd.text.description),
    ]);
  }

  // A listing description's HTML as plain text, a line per paragraph or line break.
  function htmlText(html) {
    return new DOMParser().parseFromString(html.replace(/<(br|\/p|\/li|\/h\d)\b/gi, '\n$&'), 'text/html').body.textContent;
  }

  Object.assign(globalThis.RMX, { propertyAcres });
})();
