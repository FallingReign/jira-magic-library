/**
 * ADF (Atlassian Document Format) Converter
 *
 * Converts plain text and basic markdown to ADF for Jira Cloud v3 API,
 * and converts ADF back to plain text for display.
 */

export interface AdfDocument {
  version: 1;
  type: 'doc';
  content: AdfNode[];
}

export interface AdfNode {
  type: string;
  content?: AdfNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
}

export class AdfConverter {
  /** Convert plain text / basic markdown to ADF */
  static toAdf(text: string): AdfDocument {
    if (!text || text.trim() === '') {
      return { version: 1, type: 'doc', content: [AdfConverter.paragraph([])] };
    }

    const content: AdfNode[] = [];
    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i]!;

      // Code block (triple backticks)
      if (line.startsWith('```')) {
        const lang = line.slice(3).trim() || undefined;
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i]!.startsWith('```')) {
          codeLines.push(lines[i]!);
          i++;
        }
        // Skip closing ```
        if (i < lines.length) i++;
        content.push(AdfConverter.codeBlock(codeLines.join('\n'), lang));
        continue;
      }

      // Heading (# to ######)
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1]!.length;
        content.push(AdfConverter.heading(level, headingMatch[2]!));
        i++;
        continue;
      }

      // Unordered list (- item or * item)
      if (/^[\-\*]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^[\-\*]\s+/.test(lines[i]!)) {
          items.push(lines[i]!.replace(/^[\-\*]\s+/, ''));
          i++;
        }
        content.push(AdfConverter.bulletList(items));
        continue;
      }

      // Ordered list (1. item)
      if (/^\d+\.\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
          items.push(lines[i]!.replace(/^\d+\.\s+/, ''));
          i++;
        }
        content.push(AdfConverter.orderedList(items));
        continue;
      }

      // Empty line — skip (paragraph boundaries)
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Paragraph: collect consecutive non-special lines
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i]!.trim() !== '' &&
        !lines[i]!.startsWith('```') &&
        !lines[i]!.match(/^#{1,6}\s+/) &&
        !lines[i]!.match(/^[\-\*]\s+/) &&
        !lines[i]!.match(/^\d+\.\s+/)
      ) {
        paraLines.push(lines[i]!);
        i++;
      }

      content.push(AdfConverter.paragraphFromText(paraLines));
    }

    if (content.length === 0) {
      content.push(AdfConverter.paragraph([]));
    }

    return { version: 1, type: 'doc', content };
  }

  /** Convert ADF back to plain text (for display) */
  static toPlainText(adf: AdfDocument): string {
    if (!adf || !adf.content) return '';
    return adf.content.map(node => AdfConverter.nodeToText(node)).join('\n\n');
  }

  /** Check if value is already ADF */
  static isAdf(value: unknown): value is AdfDocument {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    return obj.version === 1 && obj.type === 'doc' && Array.isArray(obj.content);
  }

  // --- Private helpers ---

  private static paragraph(content: AdfNode[]): AdfNode {
    return { type: 'paragraph', content };
  }

  private static paragraphFromText(lines: string[]): AdfNode {
    const content: AdfNode[] = [];
    lines.forEach((line, idx) => {
      content.push(...AdfConverter.parseInlineMarkdown(line));
      if (idx < lines.length - 1) {
        content.push({ type: 'hardBreak' });
      }
    });
    return { type: 'paragraph', content };
  }

  private static heading(level: number, text: string): AdfNode {
    return {
      type: 'heading',
      attrs: { level },
      content: AdfConverter.parseInlineMarkdown(text),
    };
  }

  private static bulletList(items: string[]): AdfNode {
    return {
      type: 'bulletList',
      content: items.map(item => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: AdfConverter.parseInlineMarkdown(item) }],
      })),
    };
  }

  private static orderedList(items: string[]): AdfNode {
    return {
      type: 'orderedList',
      content: items.map(item => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: AdfConverter.parseInlineMarkdown(item) }],
      })),
    };
  }

  private static codeBlock(text: string, language?: string): AdfNode {
    const node: AdfNode = {
      type: 'codeBlock',
      content: [{ type: 'text', text }],
    };
    if (language) {
      node.attrs = { language };
    }
    return node;
  }

  /**
   * Parse inline markdown (bold, italic, code, links) into ADF text nodes with marks.
   */
  private static parseInlineMarkdown(text: string): AdfNode[] {
    const nodes: AdfNode[] = [];
    // Regex for inline patterns: code, bold, italic, links
    // Order matters: code first (literal), then bold (** or __), then italic (* or _), then links
    const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*]+\*|_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        nodes.push({ type: 'text', text: text.slice(lastIndex, match.index) });
      }

      if (match[1]) {
        // Inline code: `code`
        const code = match[1].slice(1, -1);
        nodes.push({ type: 'text', text: code, marks: [{ type: 'code' }] });
      } else if (match[2]) {
        // Bold: **text** or __text__
        const bold = match[2].startsWith('**')
          ? match[2].slice(2, -2)
          : match[2].slice(2, -2);
        nodes.push({ type: 'text', text: bold, marks: [{ type: 'strong' }] });
      } else if (match[3]) {
        // Italic: *text* or _text_
        const italic = match[3].slice(1, -1);
        nodes.push({ type: 'text', text: italic, marks: [{ type: 'em' }] });
      } else if (match[4]) {
        // Link: [text](url)
        const linkMatch = match[4].match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          nodes.push({
            type: 'text',
            text: linkMatch[1],
            marks: [{ type: 'link', attrs: { href: linkMatch[2] } }],
          });
        }
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      nodes.push({ type: 'text', text: text.slice(lastIndex) });
    }

    // If no nodes generated, add empty text
    if (nodes.length === 0 && text.length > 0) {
      nodes.push({ type: 'text', text });
    }

    return nodes;
  }

  private static nodeToText(node: AdfNode): string {
    switch (node.type) {
      case 'text':
        return node.text ?? '';
      case 'hardBreak':
        return '\n';
      case 'paragraph':
        return (node.content ?? []).map(n => AdfConverter.nodeToText(n)).join('');
      case 'heading':
        return (node.content ?? []).map(n => AdfConverter.nodeToText(n)).join('');
      case 'bulletList':
        return (node.content ?? []).map(item => {
          const itemContent = (item.content ?? []).map(n => AdfConverter.nodeToText(n)).join('');
          return `- ${itemContent}`;
        }).join('\n');
      case 'orderedList':
        return (node.content ?? []).map((item, idx) => {
          const itemContent = (item.content ?? []).map(n => AdfConverter.nodeToText(n)).join('');
          return `${idx + 1}. ${itemContent}`;
        }).join('\n');
      case 'codeBlock':
        return (node.content ?? []).map(n => AdfConverter.nodeToText(n)).join('');
      case 'listItem':
        return (node.content ?? []).map(n => AdfConverter.nodeToText(n)).join('');
      default:
        return (node.content ?? []).map(n => AdfConverter.nodeToText(n)).join('');
    }
  }
}
