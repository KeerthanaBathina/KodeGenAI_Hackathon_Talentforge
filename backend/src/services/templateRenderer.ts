import logger from '../utils/logger';

export type TokenMap = Readonly<Record<string, string>>;

export interface TemplateFields {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export interface RenderedTemplate extends TemplateFields {}

const TOKEN_REGEX = /\{\{(\w+)\}\}/g;

export function renderTemplate(template: TemplateFields, tokens: TokenMap): RenderedTemplate {
  const resolve = (text: string): string =>
    text.replace(TOKEN_REGEX, (_match, key: string) => {
      const value = tokens[key];
      if (value === undefined) {
        logger.warn({ token: key }, 'Template token not provided; substituting empty string');
        return '';
      }

      return value;
    });

  return {
    subject: resolve(template.subject),
    bodyHtml: resolve(template.bodyHtml),
    bodyText: resolve(template.bodyText)
  };
}

export function findMissingTokens(template: TemplateFields, tokens: TokenMap): string[] {
  const missing = new Set<string>();
  const allText = `${template.subject}\n${template.bodyHtml}\n${template.bodyText}`;

  for (const match of allText.matchAll(TOKEN_REGEX)) {
    const key = match[1];
    if (!key) {
      continue;
    }

    if (!(key in tokens)) {
      missing.add(key);
    }
  }

  return Array.from(missing).sort();
}
