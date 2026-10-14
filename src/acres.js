// Finds the land a listing's text mentions in acres: "about 2.65 acres", "a two-acre plot",
// "half an acre", "1½ acres", "1-2 acres". Rightmove's own size in acres is the floor area
// converted, so the text is the only place the land is given. Also finds the sentences that
// call a property open plan or modern, and services that need doing by hand (oil, septic tank).
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

  // An amount as a label ("2.5 acres", "1–2 acres") and its value in acres (the larger end of
  // a range).
  function amountOf([, low, high]) {
    const lo = toNumber(low);
    const hi = high && toNumber(high);
    const n = v => v.toLocaleString('en-GB', { maximumFractionDigits: 2 });
    if (!(lo > 0)) return null;
    if (hi > lo) return { label: `${n(lo)}–${n(hi)} acres`, value: hi };
    return { label: `${n(lo)} ${lo === 1 ? 'acre' : 'acres'}`, value: lo };
  }

  // The sentence around a mention, cut down to about 160 characters.
  function excerpt(sentence, start, end) {
    sentence = sentence.trim().replace(/\s+/g, ' ');
    if (sentence.length <= 160) return sentence;
    const from = Math.max(0, sentence.lastIndexOf(' ', Math.max(0, start - 70)));
    const to = sentence.indexOf(' ', end + 70);
    return (from > 0 ? '…' : '') + sentence.slice(from, to < 0 ? undefined : to).trim() + (to < 0 ? '' : '…');
  }

  // Every distinct amount in acres in `texts` (plain text, in the order given), as its label
  // and value, with the sentence it came from. A mention with no amount ("acres of woodland",
  // "Acre Lane") is returned once, with `amount: null`.
  function findAcres(texts) {
    const found = new Map();
    for (const text of texts) {
      if (!text) continue;
      for (const sentence of text.split(SENTENCE)) {
        for (const m of sentence.matchAll(ACRE)) {
          const quantity = AMOUNT.exec(sentence.slice(0, m.index));
          const { label = null, value = 0 } = (quantity && amountOf(quantity)) || {};
          if (!found.has(label)) found.set(label, { amount: label, value, context: excerpt(sentence, m.index, m.index + m[0].length) });
        }
      }
    }
    return [...found.values()];
  }

  // Every distinct sentence in `texts` that matches `pattern`, cut down around the match.
  function findMentions(texts, pattern) {
    const found = new Set();
    for (const text of texts) {
      if (!text) continue;
      for (const sentence of text.split(SENTENCE)) {
        const m = pattern.exec(sentence);
        if (m) found.add(excerpt(sentence, m.index, m.index + m[0].length));
      }
    }
    return [...found];
  }

  // A property's key features, search summary and description. `pd` is the property page's
  // data and `listing` its search result; either may be missing.
  function propertyTexts(pd, listing) {
    return [
      ...(pd?.keyFeatures || listing?.keyFeatures?.map(f => f.description) || []),
      listing?.summary, // can differ from the page's description
      pd?.text?.description && htmlText(pd.text.description),
    ];
  }

  const propertyAcres = (pd, listing) => findAcres(propertyTexts(pd, listing));

  // "Open plan", "open-plan", "openplan"; "modern" but not "modernised" or "modernisation".
  const FEATURES = [
    ['Open plan', /\bopen[\s\-–]?plan\b/i],
    ['Modern', /\bmodern\b/i],
  ];

  // Each feature with the sentences that mention it (none if it isn't mentioned).
  function propertyFeatures(pd, listing) {
    const texts = propertyTexts(pd, listing);
    return FEATURES.map(([name, pattern]) => ({ name, mentions: findMentions(texts, pattern) }));
  }

  // Services that need doing by hand: oil or LPG to order in, a septic tank, cesspit or
  // treatment plant to have emptied, a private water supply to look after. Each is found in
  // the listing's text (`text`) or in the utilities on its page (`value`, matched against an
  // entry of `features[field]` such as { alias: 'private_sewerage', displayText: 'Private supply' }).
  // "Oil" needs a heating word next to it, so "oiled oak floors" doesn't count.
  const MANUAL = [
    { name: 'Oil', field: 'heating', value: /\boil\b/i,
      text: /\boil[\s\-–]*(?:fired|central|heating|boiler|tank|range|aga|rayburn|stove|supply)|\b(?:heat\w*|boiler|aga|rayburn)\b[^.]{0,40}?\boil\b/i },
    { name: 'LPG', field: 'heating', value: /\b(?:lpg|calor|propane|bottled)\b/i,
      text: /\b(?:lpg|calor|propane)\b|\bbottled gas\b/i },
    { name: 'Septic tank', field: 'sewerage', value: /sc?eptic/i, text: /\bsc?eptic\b/i },
    { name: 'Cesspit', field: 'sewerage', value: /cess/i, text: /\bcess[\s-]?(?:pit|pool)s?\b/i },
    { name: 'Treatment plant', field: 'sewerage', value: /treatment/i, text: /\btreatment plants?\b/i },
    // Left out when the kind of drainage is named.
    { name: 'Private drainage', field: 'sewerage', value: /private/i, vague: true,
      text: /\bprivate (?:drainage|drains|sewerage|sewage)\b|\bnon[\s-]mains (?:drainage|sewerage)\b|\bklargester\b/i },
    { name: 'Private water', field: 'water', value: /private|bore|spring|well/i,
      text: /\bprivate water\b|\bbore[\s-]?holes?\b|\b(?:spring|well)(?:[\s-]fed)? water\b/i },
  ];

  // Each manual service the listing mentions, with where it's mentioned: a sentence, or the
  // utilities entry ("Heating: Oil, in the listing’s utilities").
  function propertyManual(pd, listing) {
    const texts = propertyTexts(pd, listing);
    const found = MANUAL.map(({ name, field, value, text, vague }) => ({
      name, field, vague,
      mentions: [
        ...(pd?.features?.[field] || []).filter(f => value.test(`${f.alias} ${f.displayText}`))
          .map(f => `${field[0].toUpperCase()}${field.slice(1)}: ${f.displayText}, in the listing’s utilities`),
        ...findMentions(texts, text),
      ],
    })).filter(m => m.mentions.length);
    return found.filter(m => !m.vague || !found.some(o => o.field === m.field && !o.vague));
  }

  // A listing description's HTML as plain text, a line per paragraph or line break.
  function htmlText(html) {
    return new DOMParser().parseFromString(html.replace(/<(br|\/p|\/li|\/h\d)\b/gi, '\n$&'), 'text/html').body.textContent;
  }

  Object.assign(globalThis.RMX, { propertyAcres, propertyFeatures, propertyManual });
})();
