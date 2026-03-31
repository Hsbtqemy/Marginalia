import {
  $applyNodeReplacement,
  $createParagraphNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type ElementDOMSlot,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type RangeSelection,
  type SerializedElementNode,
  type Spread,
  ElementNode,
} from "lexical";
import { newUuid } from "../../../utils/uuid";

export type MarginKind = "left" | "right";

export interface SerializedMarginaliaBlockNode extends Spread<
  {
    type: "marginalia-block";
    version: 1;
    marginBlockId: string;
    linkedManuscriptBlockId: string | null;
    kind: MarginKind;
  },
  SerializedElementNode
> {}

const MARGINALIA_HANDLE_SELECTOR = '[data-marginalia-handle="true"]';
const MARGINALIA_CONTENT_SLOT_SELECTOR = '[data-marginalia-content-slot="true"]';
const MARGINALIA_META_SELECTOR = '[data-marginalia-meta="true"]';
const MARGINALIA_PREVIEW_SELECTOR = '[data-marginalia-preview="true"]';

function createBlockHandle(marginBlockId: string): HTMLButtonElement {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "marginalia-block-handle";
  handle.tabIndex = 0;
  handle.contentEditable = "false";
  handle.draggable = false;
  handle.dataset.marginaliaHandle = "true";
  handle.dataset.marginBlockId = marginBlockId;
  handle.dataset.grabbed = "false";
  handle.setAttribute("aria-label", "Reorder block");
  handle.setAttribute("aria-grabbed", "false");
  handle.textContent = "Move";
  return handle;
}

function createBlockHeader(marginBlockId: string): HTMLDivElement {
  const header = document.createElement("div");
  header.className = "marginalia-block-header";
  header.contentEditable = "false";
  const meta = document.createElement("span");
  meta.className = "marginalia-block-meta";
  meta.dataset.marginaliaMeta = "true";
  meta.textContent = "Free note";
  header.append(createBlockHandle(marginBlockId));
  header.append(meta);
  return header;
}

function createBlockContentSlot(): HTMLDivElement {
  const contentSlot = document.createElement("div");
  contentSlot.className = "marginalia-block-content-slot";
  contentSlot.dataset.marginaliaContentSlot = "true";
  return contentSlot;
}

function createBlockPreview(): HTMLDivElement {
  const preview = document.createElement("div");
  preview.className = "marginalia-block-preview";
  preview.dataset.marginaliaPreview = "true";
  preview.hidden = true;
  return preview;
}

function convertMarginaliaBlockElement(domNode: HTMLElement): DOMConversionOutput {
  const marginBlockId = domNode.dataset.marginBlockId ?? newUuid();
  const linkedManuscriptBlockId = domNode.dataset.linkedManuscriptBlockId ?? null;
  const kind = domNode.dataset.kind === "right" ? "right" : "left";
  const node = $createMarginaliaBlockNode({
    marginBlockId,
    linkedManuscriptBlockId,
    kind,
  });
  return { node };
}

export class MarginaliaBlockNode extends ElementNode {
  __marginBlockId: string;
  __linkedManuscriptBlockId: string | null;
  __kind: MarginKind;

  static getType(): string {
    return "marginalia-block";
  }

  static clone(node: MarginaliaBlockNode): MarginaliaBlockNode {
    const cloned = new MarginaliaBlockNode(
      node.__marginBlockId,
      node.__linkedManuscriptBlockId,
      node.__kind,
      node.__key,
    );
    cloned.__format = node.__format;
    cloned.__indent = node.__indent;
    cloned.__dir = node.__dir;
    return cloned;
  }

  static importJSON(serializedNode: SerializedMarginaliaBlockNode): MarginaliaBlockNode {
    const node = $createMarginaliaBlockNode({
      marginBlockId: serializedNode.marginBlockId,
      linkedManuscriptBlockId: serializedNode.linkedManuscriptBlockId,
      kind: serializedNode.kind,
    });
    node.setFormat(serializedNode.format);
    node.setIndent(serializedNode.indent);
    node.setDirection(serializedNode.direction);
    return node;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      section: (domNode: Node) => {
        if (domNode instanceof HTMLElement && domNode.dataset.lexicalMarginaliaBlock === "true") {
          return {
            conversion: convertMarginaliaBlockElement,
            priority: 2,
          };
        }
        return null;
      },
    };
  }

  constructor(
    marginBlockId?: string,
    linkedManuscriptBlockId?: string | null,
    kind: MarginKind = "left",
    key?: NodeKey,
  ) {
    super(key);
    this.__marginBlockId = marginBlockId ?? newUuid();
    this.__linkedManuscriptBlockId = linkedManuscriptBlockId ?? null;
    this.__kind = kind;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("section");
    element.dataset.lexicalMarginaliaBlock = "true";
    element.dataset.marginBlockId = this.getMarginBlockId();
    element.dataset.kind = this.getKind();
    if (this.getLinkedManuscriptBlockId()) {
      element.dataset.linkedManuscriptBlockId = this.getLinkedManuscriptBlockId() ?? "";
    }
    return { element };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("section");
    element.className = "marginalia-block";
    element.dataset.lexicalMarginaliaBlock = "true";
    element.dataset.marginBlockId = this.__marginBlockId;
    element.dataset.kind = this.__kind;
    element.dataset.linked = this.__linkedManuscriptBlockId ? "true" : "false";
    if (this.__linkedManuscriptBlockId) {
      element.dataset.linkedManuscriptBlockId = this.__linkedManuscriptBlockId;
    }
    element.append(createBlockHeader(this.__marginBlockId), createBlockPreview(), createBlockContentSlot());
    const meta = element.querySelector<HTMLElement>(MARGINALIA_META_SELECTOR);
    if (meta) {
      meta.textContent = this.__linkedManuscriptBlockId
        ? `Linked passage ${this.__linkedManuscriptBlockId.slice(0, 8)}`
        : "Free note";
    }
    const preview = element.querySelector<HTMLElement>(MARGINALIA_PREVIEW_SELECTOR);
    if (preview) {
      preview.hidden = !this.__linkedManuscriptBlockId;
    }
    return element;
  }

  getDOMSlot(element: HTMLElement): ElementDOMSlot<HTMLElement> {
    const slotElement = element.querySelector<HTMLElement>(MARGINALIA_CONTENT_SLOT_SELECTOR);
    if (!slotElement) {
      return super.getDOMSlot(element);
    }
    return super.getDOMSlot(element).withElement(slotElement);
  }

  updateDOM(prevNode: MarginaliaBlockNode, dom: HTMLElement): boolean {
    if (prevNode.__marginBlockId !== this.__marginBlockId) {
      dom.dataset.marginBlockId = this.__marginBlockId;
      const handle = dom.querySelector<HTMLElement>(MARGINALIA_HANDLE_SELECTOR);
      if (handle) {
        handle.dataset.marginBlockId = this.__marginBlockId;
      }
    }
    if (prevNode.__kind !== this.__kind) {
      dom.dataset.kind = this.__kind;
    }

    if (prevNode.__linkedManuscriptBlockId !== this.__linkedManuscriptBlockId) {
      dom.dataset.linked = this.__linkedManuscriptBlockId ? "true" : "false";
      if (this.__linkedManuscriptBlockId) {
        dom.dataset.linkedManuscriptBlockId = this.__linkedManuscriptBlockId;
      } else {
        delete dom.dataset.linkedManuscriptBlockId;
      }
    }

    const meta = dom.querySelector<HTMLElement>(MARGINALIA_META_SELECTOR);
    if (meta) {
      meta.textContent = this.__linkedManuscriptBlockId
        ? `Linked passage ${this.__linkedManuscriptBlockId.slice(0, 8)}`
        : "Free note";
    }
    const preview = dom.querySelector<HTMLElement>(MARGINALIA_PREVIEW_SELECTOR);
    if (preview) {
      preview.hidden = !this.__linkedManuscriptBlockId;
    }

    return false;
  }

  exportJSON(): SerializedMarginaliaBlockNode {
    return {
      ...super.exportJSON(),
      type: "marginalia-block",
      version: 1,
      marginBlockId: this.getMarginBlockId(),
      linkedManuscriptBlockId: this.getLinkedManuscriptBlockId(),
      kind: this.getKind(),
    };
  }

  canInsertTab(): boolean {
    return false;
  }

  canBeEmpty(): boolean {
    return false;
  }

  collapseAtStart(_selection: RangeSelection): boolean {
    return true;
  }

  getMarginBlockId(): string {
    return this.getLatest().__marginBlockId;
  }

  setMarginBlockId(value: string): this {
    const writable = this.getWritable();
    writable.__marginBlockId = value;
    return writable;
  }

  getLinkedManuscriptBlockId(): string | null {
    return this.getLatest().__linkedManuscriptBlockId;
  }

  setLinkedManuscriptBlockId(value: string | null): this {
    const writable = this.getWritable();
    writable.__linkedManuscriptBlockId = value;
    return writable;
  }

  getKind(): MarginKind {
    return this.getLatest().__kind;
  }

  setKind(value: MarginKind): this {
    const writable = this.getWritable();
    writable.__kind = value;
    return writable;
  }

  insertNewAfter(_selection: RangeSelection, restoreSelection = true): LexicalNode {
    const newBlock = $createMarginaliaBlockNode({ kind: this.__kind });
    newBlock.append($createParagraphNode());
    this.insertAfter(newBlock, restoreSelection);
    return newBlock;
  }
}

export function $createMarginaliaBlockNode(options?: {
  marginBlockId?: string;
  linkedManuscriptBlockId?: string | null;
  kind?: MarginKind;
}): MarginaliaBlockNode {
  const node = new MarginaliaBlockNode(
    options?.marginBlockId,
    options?.linkedManuscriptBlockId,
    options?.kind ?? "left",
  );
  return $applyNodeReplacement(node);
}

export function $isMarginaliaBlockNode(node: LexicalNode | null | undefined): node is MarginaliaBlockNode {
  return node instanceof MarginaliaBlockNode;
}
