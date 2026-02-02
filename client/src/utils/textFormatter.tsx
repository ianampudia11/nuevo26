import React from 'react';

/**
 * Text formatting utility for parsing Markdown-style formatting in messages
 */

interface FormattingRule {
  pattern: RegExp;
  replacement: (match: string, content: string, index: number) => React.ReactNode;
}

/**
 * Parses text content and applies rich text formatting
 * Supports: *bold*, _italic_, ~strikethrough~, `inline code`, and URLs
 *
 * @param text - The text content to format
 * @returns Array of React nodes with applied formatting
 */
export const parseFormattedText = (text: string): React.ReactNode[] => {
  if (!text) return [];

  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  urlPattern.lastIndex = 0;

  while ((match = urlPattern.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = urlPattern.lastIndex;

    if (matchStart > lastIndex) {
      const beforeText = text.substring(lastIndex, matchStart);
      parts.push(...parseFormattingOnly(beforeText));
    }

    const url = match[1];
    const isImageUrl = /\.(jpeg|jpg|gif|png)$/i.test(url);

    if (isImageUrl) {
      parts.push(
        <div key={`img-${parts.length}`} className="mb-2">
          <img
            src={url}
            alt="Link preview"
            className="max-w-full rounded-md object-contain"
            style={{ maxHeight: '240px' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      );
    } else {
      parts.push(
        <a
          key={`url-${parts.length}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline break-all dark:text-blue-400"
        >
          {url}
        </a>
      );
    }

    lastIndex = matchEnd;
  }

  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    parts.push(...parseFormattingOnly(remainingText));
  }

  if (parts.length === 0) {
    return parseFormattingOnly(text);
  }

  return parts;
};

/**
 * Parses text with formatting rules only (no URL handling)
 */
function parseFormattingOnly(text: string): React.ReactNode[] {
  if (!text) return [];

  const formattingRules: FormattingRule[] = [
    {
      pattern: /`([^`]+)`/g,
      replacement: (match, content, index) => (
        <code
          key={`code-${index}`}
          className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded text-sm font-mono border border-border"
        >
          {content}
        </code>
      )
    },

    {
      pattern: /\*([^*]+)\*/g,
      replacement: (match, content, index) => (
        <strong key={`bold-${index}`} className="font-bold">
          {content}
        </strong>
      )
    },

    {
      pattern: /_([^_]+)_/g,
      replacement: (match, content, index) => (
        <em key={`italic-${index}`} className="italic">
          {content}
        </em>
      )
    },

    {
      pattern: /~([^~]+)~/g,
      replacement: (match, content, index) => (
        <del key={`strike-${index}`} className="line-through">
          {content}
        </del>
      )
    }
  ];

  return parseTextWithFormatting(text, formattingRules);
}

/**
 * Recursively parses text with formatting rules
 */
function parseTextWithFormatting(
  text: string, 
  rules: FormattingRule[], 
  ruleIndex: number = 0
): React.ReactNode[] {
  if (ruleIndex >= rules.length) {

    return text ? [text] : [];
  }

  const rule = rules[ruleIndex];
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;


  rule.pattern.lastIndex = 0;

  while ((match = rule.pattern.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = rule.pattern.lastIndex;


    if (matchStart > lastIndex) {
      const beforeText = text.substring(lastIndex, matchStart);
      parts.push(...parseTextWithFormatting(beforeText, rules, ruleIndex + 1));
    }


    const formattedElement = rule.replacement(match[0], match[1], parts.length);
    parts.push(formattedElement);

    lastIndex = matchEnd;


    if (matchStart === matchEnd) {
      rule.pattern.lastIndex++;
    }
  }


  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    parts.push(...parseTextWithFormatting(remainingText, rules, ruleIndex + 1));
  }

  return parts;
}

/**
 * Checks if text contains any formatting patterns or URLs
 *
 * @param text - The text to check
 * @returns True if formatting patterns or URLs are found
 */
export const hasFormatting = (text: string): boolean => {
  if (!text) return false;

  const patterns = [
    /\*[^*]+\*/,              // Bold
    /_[^_]+_/,                // Italic
    /~[^~]+~/,                // Strikethrough
    /`[^`]+`/,
    /(https?:\/\/[^\s]+)/
  ];

  return patterns.some(pattern => pattern.test(text));
};

/**
 * Strips all formatting from text, leaving only plain text
 * 
 * @param text - The formatted text
 * @returns Plain text without formatting
 */
export const stripFormatting = (text: string): string => {
  if (!text) return text;

  return text
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~([^~]+)~/g, '$1')
    .replace(/`([^`]+)`/g, '$1');   // Remove inline code
};

/**
 * Extracts all non-image URLs from text
 * 
 * @param text - The text content to extract URLs from
 * @returns Array of unique URLs found in the text (excluding image URLs)
 */
export const extractUrls = (text: string): string[] => {
  if (!text) return [];

  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const imagePattern = /\.(jpeg|jpg|gif|png)$/i;
  const urls: string[] = [];
  const urlSet = new Set<string>();
  let match;

  urlPattern.lastIndex = 0;

  while ((match = urlPattern.exec(text)) !== null) {
    const url = match[1];

    if (!imagePattern.test(url)) {
      if (!urlSet.has(url)) {
        urlSet.add(url);
        urls.push(url);
      }
    }
  }

  return urls;
};

/**
 * Component for rendering formatted text content
 */
interface FormattedTextProps {
  content: string;
  className?: string;
}

export const FormattedText: React.FC<FormattedTextProps> = ({ content, className = '' }) => {
  const formattedNodes = parseFormattedText(content);

  return (
    <span className={className}>
      {formattedNodes.map((node, index) => (
        <React.Fragment key={index}>{node}</React.Fragment>
      ))}
    </span>
  );
};
