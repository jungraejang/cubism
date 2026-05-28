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
import { richTextContentCss } from "./richTextStyles";

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
  ALLOWED_ATTR: ["src", "alt", "style", "href", "title", "class"],
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
      <style>
        {richTextContentCss(
          ".cubism-text-content",
          baseSize,
          config.textColor,
        )}
      </style>

      {/*
       * initial={false} on the pixel-shift and orientation wrappers stops them
       * animating from their defaults on mount (the carousel transition in the
       * renderer page handles entrance). They still animate when their target
       * values change later - i.e. when the user adjusts orientation, the
       * text rotates smoothly to the new angle.
       */}
      <motion.div
        initial={false}
        animate={{ x: pixelShift.x, y: pixelShift.y }}
        transition={{ duration: PIXEL_SHIFT_DURATION_S, ease: "easeInOut" }}
        className="relative flex h-full w-full items-center justify-center"
      >
        <motion.div
          initial={false}
          animate={{ rotate, scaleX, scaleY }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="flex h-full w-full items-center justify-center"
        >
          <div
            className="cubism-text-content max-w-[80vw] px-8 text-center"
            dangerouslySetInnerHTML={{ __html: sanitized }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
