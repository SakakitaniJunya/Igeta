// 各テストの後に、描いた画面を片付ける (vitest は globals を使わないので、Testing Library の自動の片付けが効かない)。

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
