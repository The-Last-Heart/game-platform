import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DocumentLocaleAttributes } from './document-locale';

describe('DocumentLocaleAttributes', () => {
  it('sets html lang and dir for Arabic', () => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    const { rerender, unmount } = render(
      <DocumentLocaleAttributes locale="ar" />,
    );
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');

    rerender(<DocumentLocaleAttributes locale="en" />);
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    unmount();
  });
});
