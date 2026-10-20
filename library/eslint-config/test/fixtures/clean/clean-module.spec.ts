import { isRetryable } from './clean-module';

describe('isRetryable', () => {
  describe('上限の手前', () => {
    it('R-01 回数が上限未満のとき true を返す', () => {
      const retryable = isRetryable(2);

      expect(retryable).toBe(true);
    });
  });
});
