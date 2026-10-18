// Polaris の部品の見出し (heading 属性) はテストでは文字として描かれない (部品の中身は Shopify の CDN が描く)。
// 属性で探す道具。

import { waitFor } from '@testing-library/react';

/** heading が一致するバナーが出るまで待って返す。 */
export async function findBanner(heading: string): Promise<Element> {
  return waitFor(() => {
    const found = [...document.querySelectorAll('s-banner')].find((el) => el.getAttribute('heading') === heading);
    if (found === undefined) throw new Error(`no s-banner with heading: ${heading}`);
    return found;
  });
}
