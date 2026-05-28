/**
 * Shared CSS for rich-text content in the desktop editor and hologram renderer.
 * Keeps image and paragraph spacing consistent in both places.
 */
export function richTextContentCss(scope: string, baseSize: string, textColor: string): string {
  return `
    ${scope} {
      font-size: ${baseSize};
      color: ${textColor};
      line-height: 1.35;
    }
    ${scope} :is(h1, h2, h3) {
      font-weight: 700;
      line-height: 1.1;
      margin: 0.35em 0;
    }
    ${scope} h1 { font-size: 1.8em; }
    ${scope} h2 { font-size: 1.4em; }
    ${scope} h3 { font-size: 1.15em; }
    ${scope} p {
      margin: 0.65em 0;
    }
    ${scope} p:empty {
      min-height: 1em;
    }
    ${scope} strong { font-weight: 700; }
    ${scope} em { font-style: italic; }
    ${scope} u { text-decoration: underline; }
    ${scope} s { text-decoration: line-through; }
    ${scope} ul {
      list-style: disc;
      padding-left: 1.5em;
      text-align: left;
      margin: 0.5em 0;
    }
    ${scope} ol {
      list-style: decimal;
      padding-left: 1.5em;
      text-align: left;
      margin: 0.5em 0;
    }
    ${scope} li { margin: 0.2em 0; }
    ${scope} blockquote {
      border-left: 0.15em solid currentColor;
      padding-left: 0.6em;
      opacity: 0.85;
      margin: 0.5em 0;
    }
    ${scope} code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: rgba(255,255,255,0.08);
      padding: 0.05em 0.3em;
      border-radius: 0.25em;
    }
    ${scope} img {
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      max-width: 80%;
      max-height: 50vh;
      height: auto;
      display: block;
      margin: 1em auto;
    }
    ${scope} a {
      color: inherit;
      text-decoration: underline;
    }
  `;
}

/** Editor-only overrides (Tiptap / ProseMirror selection chrome). */
export const RICH_TEXT_EDITOR_EXTRA_CSS = `
  .prose-cubism .ProseMirror img {
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
  }
  .prose-cubism .ProseMirror img.ProseMirror-selectednode {
    outline: none !important;
    border: none !important;
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.45) !important;
  }
  .prose-cubism .ProseMirror:focus {
    outline: none;
  }
`;
