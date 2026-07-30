import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { findMissingTokens, renderTemplate } from '../templateRenderer';

const offerTemplate = {
  subject: 'Congratulations {{candidate_name}} - Offer for {{role_title}}',
  bodyHtml: '<p>Dear {{candidate_name}},</p><p>We are pleased to offer you the role of {{role_title}}.</p>',
  bodyText: 'Dear {{candidate_name}}, We are pleased to offer you the role of {{role_title}}.'
};

const tokens = { candidate_name: 'Jane Smith', role_title: 'Senior Engineer' };

describe('renderTemplate', () => {
  it('replaces all tokens in subject', () => {
    const { subject } = renderTemplate(offerTemplate, tokens);
    expect(subject).toBe('Congratulations Jane Smith - Offer for Senior Engineer');
  });

  it('replaces all tokens in bodyHtml', () => {
    const { bodyHtml } = renderTemplate(offerTemplate, tokens);
    expect(bodyHtml).toContain('Dear Jane Smith');
    expect(bodyHtml).toContain('role of Senior Engineer');
  });

  it('replaces all tokens in bodyText', () => {
    const { bodyText } = renderTemplate(offerTemplate, tokens);
    expect(bodyText).not.toMatch(/\{\{.*?\}\}/);
  });

  it('leaves no raw tokens when all tokens are provided', () => {
    const result = renderTemplate(offerTemplate, tokens);
    const allText = `${result.subject} ${result.bodyHtml} ${result.bodyText}`;
    expect(allText).not.toMatch(/\{\{.*?\}\}/);
  });

  it('substitutes empty string for unknown tokens', () => {
    const { subject } = renderTemplate(
      { subject: 'Hello {{unknown_token}}', bodyHtml: '', bodyText: '' },
      {}
    );
    expect(subject).toBe('Hello ');
    expect(subject).not.toContain('{{');
  });

  it('keeps templates without tokens unchanged', () => {
    const plain = { subject: 'No tokens here', bodyHtml: '<p>Plain</p>', bodyText: 'Plain' };
    const result = renderTemplate(plain, tokens);
    expect(result.subject).toBe('No tokens here');
  });

  it('resolves repeated tokens', () => {
    const template = {
      subject: '{{name}} - re: {{name}}',
      bodyHtml: '{{name}} {{name}}',
      bodyText: '{{name}}'
    };
    const result = renderTemplate(template, { name: 'Alice' });
    expect(result.subject).toBe('Alice - re: Alice');
    expect(result.bodyHtml).toBe('Alice Alice');
  });

  it('treats token names as case-sensitive', () => {
    const template = { subject: '{{Candidate_Name}}', bodyHtml: '', bodyText: '' };
    const { subject } = renderTemplate(template, { candidate_name: 'Bob' });
    expect(subject).toBe('');
  });
});

describe('findMissingTokens', () => {
  it('returns empty list when all tokens are provided', () => {
    expect(findMissingTokens(offerTemplate, tokens)).toEqual([]);
  });

  it('returns sorted list of missing tokens', () => {
    const missing = findMissingTokens(offerTemplate, { candidate_name: 'Alice' });
    expect(missing).toEqual(['role_title']);
  });

  it('returns all missing tokens', () => {
    const missing = findMissingTokens(offerTemplate, {});
    expect(missing).toEqual(['candidate_name', 'role_title']);
  });
});
