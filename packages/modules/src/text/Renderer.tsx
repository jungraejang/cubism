"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import DOMPurify, { type Config } from "isomorphic-dompurify";
import { orientationTransform } from "../_lib/orientation";
import {
  PIXEL_SHIFT_DURATION_S,
  usePixelShift,
} from "../_lib/usePixelShift";
import { fontSizeToVmin, type TextModuleConfig } from "./config";

type Props = {
  config: TextModuleConfig;
};

/**
 * Allow-list of tags / attributes the renderer will accept. Includes the
 * formatting Tiptap emits plus `<img>` (for the GIF / image insert feature).
 * The `src` URI is restricted to http/https/data so a malicious sender can't
 * trigger `javascript:` URIs even if the desktop UI is compromised.
 */
const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "h1",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "img",
    "span",
    "a",
    "code",
    "pre",
    "blockquote",
  ],
  ALLOWED_ATTR: ["src", "alt", "style", "href", "title"],
  ALLOWED_URI_REGEXP: /^(https?:|data:image\/)/i,
};

export function TextRenderer({ config }: Props) {
  const pixelShift = usePixelShift();

  const sanitized = useMemo(
    () => DOMPurify.sanitize(config.html, SANITIZE_CONFIG),
    [config.html],
  );

  const { rotate, scaleX, scaleY } = orientationTransform(config);
  const baseSize = `${fontSizeToVmin(config.fontSize)}vmin`;
  const bg = config.bgColor || "transparent";

  return (
    <div
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black"
      style={{ backgroundColor: bg !== "transparent" ? bg : undefined }}
    >
      {/*
       * Inline scoped styles for tags that Tiptap emits. Using a scope
       * class avoids any cross-module bleed; using `em` units inside the
       * scope makes everything (headings, lists, images) scale with the
       * root font-size set on the wrapper.
       */}
      <style>{`
        .cubism-text-content {
          font-size: ${baseSize};
          color: ${config.textColor};
          line-height: 1.25;
        }
        .cubism-text-content :is(h1, h2, h3) {
          font-weight: 700;
          line-height: 1.1;
          margin: 0.2em 0;
        }
        .cubism-text-content h1 { font-size: 1.8em; }
        .cubism-text-content h2 { font-size: 1.4em; }
        .cubism-text-content h3 { font-size: 1.15em; }
        .cubism-text-content p { margin: 0.25em 0; }
        .cubism-text-content strong { font-weight: 700; }
        .cubism-text-content em { font-style: italic; }
        .cubism-text-content u { text-decoration: underline; }
        .cubism-text-content s { text-decoration: line-through; }
        .cubism-text-content ul { list-style: disc; padding-left: 1.5em; text-align: left; }
        .cubism-text-content ol { list-style: decimal; padding-left: 1.5em; text-align: left; }
        .cubism-text-content li { margin: 0.1em 0; }
        .cubism-text-content blockquote {
          border-left: 0.15em solid currentColor;
          padding-left: 0.6em;
          opacity: 0.85;
          margin: 0.3em 0;
        }
        .cubism-text-content code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          background: rgba(255,255,255,0.08);
          padding: 0.05em 0.3em;
          border-radius: 0.25em;
        }
        .cubism-text-content img {
          max-width: 80%;
          max-height: 50vh;
          display: inline-block;
          vertical-align: middle;
          border-radius: 0.5em;
        }
        .cubism-text-content a {
          color: inherit;
          text-decoration: underline;
        }
      `}</style>

      <motion.div
        animate={{ x: pixelShift.x, y: pixelShift.y }}
        transition={{ duration: PIXEL_SHIFT_DURATION_S, ease: "easeInOut" }}
        className="relative flex h-full w-full items-center justify-center"
      >
        <motion.div
          animate={{ rotate, scaleX, scaleY }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="flex h-full w-full items-center justify-center"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.95, filter: "blur(6px)" }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="cubism-text-content max-w-[80vw] px-8 text-center"
            style={{
              filter: `drop-shadow(0 0 18px ${config.textColor})`,
            }}
            dangerouslySetInnerHTML={{ __html: sanitized }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
