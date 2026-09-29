/**
 * Keeps UI code on the Stake Wars design tokens (src/ui/tokens.ts).
 *
 * `no-adhoc-styles` rejects class names and inline styles that improvise
 * typography or color: arbitrary Tailwind values such as `text-[9px]`,
 * `tracking-[0.18em]` or `bg-[#ff4a04]`, Tailwind's default palette and size
 * scale (removed from our theme, so they silently render nothing), and raw
 * colors on SVG elements or in style objects.
 */

const GUIDE = 'See AGENTS.md › "UI components and tokens" and /play/ui.';

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILITIES =
  'text|bg|border(?:-[trblxyse])?|divide|outline|ring|ring-offset|fill|stroke|from|via|to|decoration|placeholder|caret|accent|shadow';
const RETIRED_COLORS = 'white|black|grid|dim|bg|alert|primary';

const checks = [
  {
    test: /^text-\[/,
    message: (token) =>
      `\`${token}\` improvises a size or color. Use a type role (text-tag, text-label, text-caption, text-body…) or a color token. ${GUIDE}`,
  },
  {
    test: /^(tracking|leading)-\[/,
    message: (token) =>
      `\`${token}\` improvises spacing. Type roles already set letter spacing and line height; use tracking-caps, tracking-tight or a leading-* step if you must. ${GUIDE}`,
  },
  {
    test: /\[[^\]]*(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()/,
    message: (token) =>
      `\`${token}\` hard-codes a color. Use a color token from src/ui/tokens.ts, or add one. ${GUIDE}`,
  },
  {
    test: new RegExp(`^(${COLOR_UTILITIES})-(${PALETTE})-\\d{2,3}(/|$)`),
    message: (token) =>
      `\`${token}\` uses Tailwind's default palette, which our theme removes. Use a role token such as fg-muted, line-strong or warning. ${GUIDE}`,
  },
  {
    test: new RegExp(`^(${COLOR_UTILITIES})-(${RETIRED_COLORS})(/|$)`),
    message: (token) =>
      `\`${token}\` uses a retired color name. Use fg, surface, line or line-strong. ${GUIDE}`,
  },
  {
    test: /^text-(xs|sm|base|lg|xl|[2-9]xl)$/,
    message: (token) =>
      `\`${token}\` is not in our type scale. Use a type role (text-tag … text-display). ${GUIDE}`,
  },
  {
    test: /^tracking-(tighter|wider|widest)$/,
    message: (token) =>
      `\`${token}\` is not in our spacing scale. Use tracking-tight, tracking-wide or tracking-caps. ${GUIDE}`,
  },
];

/** Strips variants (`sm:`, `hover:`, `[&>*]:`), `!` and `-` from a class. */
function utilityOf(token) {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if (character === '[') depth += 1;
    else if (character === ']') depth -= 1;
    else if (character === ':' && depth === 0) start = index + 1;
  }
  return token.slice(start).replace(/^!?-?/, '');
}

function problemsIn(text) {
  const problems = [];
  for (const token of text.split(/\s+/)) {
    if (!token || token.length > 200) continue;
    const utility = utilityOf(token);
    const check = checks.find(({ test }) => test.test(utility));
    if (check) problems.push(check.message(token));
  }
  return problems;
}

const SVG_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'line',
  'polyline',
  'polygon',
  'rect',
  'circle',
  'ellipse',
  'text',
  'tspan',
  'stop',
  'linearGradient',
  'radialGradient',
]);
const COLOR_ATTRIBUTES = new Set(['fill', 'stroke', 'color', 'stopColor']);
const RAW_COLOR = /^\s*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/;
const TYPE_STYLE_PROPERTIES = new Set(['fontSize', 'letterSpacing']);
const COLOR_STYLE_PROPERTIES = new Set([
  'color',
  'background',
  'backgroundColor',
  'borderColor',
  'fill',
  'stroke',
]);

module.exports = {
  rules: {
    'no-adhoc-styles': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Require design tokens instead of improvised type, spacing and color.',
        },
        schema: [],
      },
      create(context) {
        const report = (node, text) => {
          for (const message of problemsIn(text)) {
            context.report({ node, message });
          }
        };

        return {
          Literal(node) {
            if (typeof node.value === 'string') report(node, node.value);
          },
          TemplateElement(node) {
            report(node, node.value.cooked ?? node.value.raw);
          },
          JSXAttribute(node) {
            const element = node.parent && node.parent.name;
            const attribute = node.name && node.name.name;
            if (
              element &&
              element.type === 'JSXIdentifier' &&
              SVG_ELEMENTS.has(element.name) &&
              COLOR_ATTRIBUTES.has(attribute) &&
              node.value &&
              node.value.type === 'Literal' &&
              RAW_COLOR.test(String(node.value.value))
            ) {
              context.report({
                node,
                message: `SVG ${attribute}="${node.value.value}" hard-codes a color. Use chartColors or colors from src/ui/tokens.ts. ${GUIDE}`,
              });
            }

            if (
              attribute === 'style' &&
              node.value &&
              node.value.type === 'JSXExpressionContainer' &&
              node.value.expression.type === 'ObjectExpression'
            ) {
              for (const property of node.value.expression.properties) {
                if (property.type !== 'Property') continue;
                const key = property.key.name ?? property.key.value;
                const value = property.value;
                if (
                  TYPE_STYLE_PROPERTIES.has(key) &&
                  value.type === 'Literal'
                ) {
                  context.report({
                    node: property,
                    message: `Inline ${key} improvises typography. Use a type role class. ${GUIDE}`,
                  });
                }
                if (
                  COLOR_STYLE_PROPERTIES.has(key) &&
                  value.type === 'Literal' &&
                  RAW_COLOR.test(String(value.value))
                ) {
                  context.report({
                    node: property,
                    message: `Inline ${key} hard-codes a color. Use a token from src/ui/tokens.ts. ${GUIDE}`,
                  });
                }
              }
            }
          },
        };
      },
    },
  },
};

module.exports.problemsIn = problemsIn;
