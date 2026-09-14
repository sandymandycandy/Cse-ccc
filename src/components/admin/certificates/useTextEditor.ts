"use client";

import { useEffect, useRef } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { DEFAULT_STYLE, type Paragraph, type TextElement } from "@/lib/certificates/design";
import { docToParagraphs, paragraphsToDoc, primaryStyle, type PMNode } from "@/lib/certificates/rich-text";
import { CertField } from "./cert-field-node";

/**
 * A TipTap editor bound to the text element being edited in place. Recreated
 * whenever a different element opens; every change is reported as paragraphs.
 */
export function useTextEditor(opts: {
  element: TextElement | null;
  pageHeightPx: number;
  fieldLabel: (key: string) => string;
  onChange: (paragraphs: Paragraph[]) => void;
}): Editor | null {
  // The change handler is read only from TipTap's own event handler, never
  // during render, so the editor need not be rebuilt when the parent re-renders.
  const onChange = useRef(opts.onChange);
  useEffect(() => {
    onChange.current = opts.onChange;
  });
  // fieldLabel, by contrast, is handed to an extension at construction time, so
  // it is a real dependency: the caller memoises it on the field catalogue.
  const { element, pageHeightPx, fieldLabel } = opts;

  return useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: true,
      editable: !!element,
      autofocus: element ? "end" : false,
      extensions: [
        StarterKit.configure({
          blockquote: false,
          bulletList: false,
          code: false,
          codeBlock: false,
          dropcursor: false,
          gapcursor: false,
          hardBreak: false,
          heading: false,
          horizontalRule: false,
          link: false,
          listItem: false,
          listKeymap: false,
          orderedList: false,
          strike: false,
          trailingNode: false,
        }),
        TextStyle,
        Color,
        FontFamily,
        FontSize,
        CertField.configure({ labelFor: fieldLabel }),
      ],
      content: element ? paragraphsToDoc(element.paragraphs, pageHeightPx) : { type: "doc", content: [{ type: "paragraph" }] },
      onUpdate: ({ editor }) => {
        if (!element) return;
        const fallback = primaryStyle(element.paragraphs, DEFAULT_STYLE);
        onChange.current(docToParagraphs(editor.getJSON() as PMNode, pageHeightPx, fallback));
      },
    },
    [element?.id, pageHeightPx, fieldLabel],
  );
}
