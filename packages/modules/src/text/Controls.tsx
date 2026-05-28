"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { motion } from "framer-motion";

import type { ControlsProps } from "../types";
import { ROTATION_OPTIONS } from "../_lib/orientation";
import {
  FONT_SIZE_OPTIONS,
  type FontSize,
  type TextModuleConfig,
} from "./config";
import {
  RICH_TEXT_EDITOR_EXTRA_CSS,
  richTextContentCss,
} from "./richTextStyles";

type ToolbarButtonProps = {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
};

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`flex h-8 min-w-8 items-center justify-center rounded px-2 text-xs font-medium transition-colors disabled:opacity-30 ${
        active
          ? "bg-cyan-400 text-zinc-950"
          : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Lightweight popover wrapper - shows children below a trigger button when
 * `open` is true. We deliberately don't close on click-outside (overkill for
 * the panel UX); the user toggles via the trigger.
 */
function Popover({
  open,
  onToggle,
  trigger,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex h-8 items-center justify-center rounded px-2 text-xs font-medium transition-colors ${
          open
            ? "bg-cyan-400 text-zinc-950"
            : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
        }`}
      >
        {trigger}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-20 mt-2 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-2xl">
          {children}
        </div>
      )}
    </div>
  );
}

function EditorToolbar({ editor }: { editor: Editor }) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const colorInputRef = useRef<HTMLInputElement>(null);

  const currentColor =
    (editor.getAttributes("textStyle").color as string | undefined) ?? "";

  function insertImage() {
    const url = imageUrl.trim();
    if (!url) return;
    // Block image + trailing empty paragraph so the user can press Enter or
    // type to add space above/below the GIF.
    editor
      .chain()
      .focus()
      .setImage({ src: url, alt: "" })
      .insertContent("<p></p>")
      .run();
    setImageUrl("");
    setImageOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-2">
      <ToolbarButton
        title="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <span className="font-bold">B</span>
      </ToolbarButton>

      <ToolbarButton
        title="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </ToolbarButton>

      <ToolbarButton
        title="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </ToolbarButton>

      <ToolbarButton
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span className="line-through">S</span>
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-zinc-700" />

      <ToolbarButton
        title="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
      >
        H1
      </ToolbarButton>

      <ToolbarButton
        title="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        H2
      </ToolbarButton>

      <ToolbarButton
        title="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      >
        H3
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-zinc-700" />

      <ToolbarButton
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •
      </ToolbarButton>

      <ToolbarButton
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-zinc-700" />

      <ToolbarButton
        title="Align left"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        ⇤
      </ToolbarButton>

      <ToolbarButton
        title="Align center"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        ↔
      </ToolbarButton>

      <ToolbarButton
        title="Align right"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        ⇥
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-zinc-700" />

      {/* Inline text color — uses a hidden native picker triggered by an icon button. */}
      <label
        title="Text color"
        className="flex h-8 cursor-pointer items-center justify-center rounded bg-zinc-800 px-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
        style={{
          color: currentColor || undefined,
          textShadow: currentColor ? `0 0 6px ${currentColor}` : undefined,
        }}
      >
        A
        <input
          ref={colorInputRef}
          type="color"
          aria-label="Inline text color"
          value={currentColor || "#67e8f9"}
          onChange={(event) => {
            editor.chain().focus().setColor(event.target.value).run();
          }}
          className="sr-only"
        />
      </label>

      <ToolbarButton
        title="Clear inline color"
        onClick={() => editor.chain().focus().unsetColor().run()}
      >
        ⨯
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-zinc-700" />

      <Popover
        open={imageOpen}
        onToggle={() => {
          setImageOpen((v) => !v);
          setEmojiOpen(false);
        }}
        trigger={<span title="Insert image / GIF">🖼</span>}
      >
        <div className="flex flex-col gap-2">
          <span className="text-xs text-zinc-400">Image or GIF URL</span>
          <input
            type="url"
            placeholder="https://media.giphy.com/..."
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                insertImage();
              }
            }}
            className="w-72 rounded bg-zinc-800 px-2 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-cyan-400"
          />
          <button
            type="button"
            onClick={insertImage}
            disabled={!imageUrl.trim()}
            className="rounded bg-cyan-400 px-3 py-1 text-xs font-semibold text-zinc-950 disabled:opacity-40"
          >
            Insert
          </button>
        </div>
      </Popover>

      <Popover
        open={emojiOpen}
        onToggle={() => {
          setEmojiOpen((v) => !v);
          setImageOpen(false);
        }}
        trigger={<span title="Insert emoji">😀</span>}
      >
        <EmojiPicker
          theme={Theme.DARK}
          emojiStyle={EmojiStyle.NATIVE}
          width={320}
          height={360}
          onEmojiClick={(emoji) => {
            editor.chain().focus().insertContent(emoji.emoji).run();
            setEmojiOpen(false);
          }}
        />
      </Popover>

      <span className="mx-1 h-5 w-px bg-zinc-700" />

      <ToolbarButton
        title="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        ↶
      </ToolbarButton>

      <ToolbarButton
        title="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        ↷
      </ToolbarButton>
    </div>
  );
}

export function TextControls({
  config,
  onChange,
}: ControlsProps<TextModuleConfig>) {
  /**
   * Latest config in a ref so the editor's `onUpdate` callback (closed over
   * the very first render's `config`) always sees the freshest other fields
   * when patching. Without this, fast typing would emit stale orientation /
   * color values back to the parent.
   */
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: "cubism-rich-text-img" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph", "image"] }),
    ],
    content: config.html,
    editorProps: {
      attributes: {
        class:
          "min-h-44 max-h-96 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 prose-cubism focus:outline-none focus:ring-1 focus:ring-cyan-400",
      },
    },
    onUpdate: ({ editor }) => {
      onChange({ ...configRef.current, html: editor.getHTML() });
    },
  });

  function patch(next: Partial<TextModuleConfig>) {
    onChange({ ...config, ...next });
  }

  const rotation = config.rotation ?? 0;

  const editorPreviewCss = richTextContentCss(
    ".prose-cubism .ProseMirror",
    "0.875rem",
    config.textColor,
  );

  return (
    <div className="flex flex-col gap-4">
      <style>{`${editorPreviewCss}${RICH_TEXT_EDITOR_EXTRA_CSS}`}</style>
      {editor && <EditorToolbar editor={editor} />}

      <EditorContent editor={editor} />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-32 text-zinc-400">Font size</span>
          <p className="text-xs text-zinc-500">
            Base scale of the entire text block.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FONT_SIZE_OPTIONS.map((option) => {
            const active = config.fontSize === option.value;
            return (
              <motion.button
                key={option.value}
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.04 }}
                onClick={() => patch({ fontSize: option.value as FontSize })}
                aria-pressed={active}
                className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-cyan-400 text-zinc-950"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                }`}
              >
                {option.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-32 text-zinc-400">Colors</span>
          <p className="text-xs text-zinc-500">
            Base text color (fallback when no inline color is set) and
            background tint.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={config.textColor}
              onChange={(event) => patch({ textColor: event.target.value })}
              aria-label="Base text color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Text</span>
            <span className="font-mono text-xs text-zinc-500">
              {config.textColor}
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={config.bgColor || "#000000"}
              onChange={(event) => patch({ bgColor: event.target.value })}
              aria-label="Background tint"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Background</span>
            <span className="font-mono text-xs text-zinc-500">
              {config.bgColor || "transparent"}
            </span>
          </label>

          <button
            type="button"
            onClick={() => patch({ bgColor: "" })}
            className="rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            Clear background
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-32 text-zinc-400">Orientation</span>
          <p className="text-xs text-zinc-500">
            Rotate to compensate for beam-splitter optics.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ROTATION_OPTIONS.map((option) => {
            const active = rotation === option.value;
            return (
              <motion.button
                key={option.value}
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.04 }}
                onClick={() => patch({ rotation: option.value })}
                aria-pressed={active}
                className={`flex min-w-22 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-cyan-400 text-zinc-950"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                }`}
              >
                <span
                  aria-hidden
                  className="inline-block text-base leading-none"
                  style={{ transform: `rotate(${option.value}deg)` }}
                >
                  ↑
                </span>
                <span>{option.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-32 text-zinc-400">Mirror</span>
          <p className="text-xs text-zinc-500">
            Some splitters reflect a single axis instead of rotating.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.04 }}
            onClick={() => patch({ flipHorizontal: !config.flipHorizontal })}
            aria-pressed={config.flipHorizontal ?? false}
            className={`flex min-w-32 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              config.flipHorizontal
                ? "bg-cyan-400 text-zinc-950"
                : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            }`}
          >
            <span aria-hidden className="text-base leading-none">
              ↔
            </span>
            <span>Mirror horizontal</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.04 }}
            onClick={() => patch({ flipVertical: !config.flipVertical })}
            aria-pressed={config.flipVertical ?? false}
            className={`flex min-w-32 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              config.flipVertical
                ? "bg-cyan-400 text-zinc-950"
                : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            }`}
          >
            <span aria-hidden className="text-base leading-none">
              ↕
            </span>
            <span>Mirror vertical</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
