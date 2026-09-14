import { Node, mergeAttributes } from "@tiptap/core";
import { FIELD_NODE } from "@/lib/certificates/rich-text";

/**
 * The inline field chip inside the in-place text editor — an atom node that
 * reads as {Name}. Its attributes map 1:1 onto a `field` run (rich-text.ts).
 */
export interface CertFieldOptions {
  labelFor: (key: string) => string;
}

export const CertField = Node.create<CertFieldOptions>({
  name: FIELD_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { labelFor: (key: string) => key };
  },

  addAttributes() {
    return {
      field: { default: "person.name", rendered: false },
      transform: { default: "none", rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-cert-field]",
        getAttrs: (el) => ({
          field: (el as HTMLElement).dataset.certField ?? "person.name",
          transform: (el as HTMLElement).dataset.transform ?? "none",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-cert-field": node.attrs.field,
        "data-transform": node.attrs.transform,
        class: "cd-chip",
        contenteditable: "false",
      }),
      `{${this.options.labelFor(String(node.attrs.field))}}`,
    ];
  },

  renderText({ node }) {
    return `{${this.options.labelFor(String(node.attrs.field))}}`;
  },
});
