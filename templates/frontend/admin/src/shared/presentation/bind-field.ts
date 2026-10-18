// Polaris の入力欄 (s-*) の値の変化を購読する ref。React の onChange は使わない (1 回の確定で 2 回呼ばれる)。

import { useCallback, useEffect, useRef, type RefCallback } from 'react';

/**
 * s-text-field・s-number-field・s-date-field・s-text-area の値の変化を購読する ref。
 * 打つたび (input) と確定 (change) の両方で、host の value (プロパティ) を文字で渡す。
 * 購読は ref の cleanup で外す。
 */
export function bindField(onValue: (value: string) => void): RefCallback<HTMLElement> {
  return (element) => {
    if (element === null) return undefined;
    const read = (): void => onValue(String((element as unknown as { value?: unknown }).value ?? ''));
    element.addEventListener('input', read);
    element.addEventListener('change', read);
    return () => {
      element.removeEventListener('input', read);
      element.removeEventListener('change', read);
    };
  };
}

/**
 * bindField の hook 版。返す ref は描画をまたいで同じ関数なので、購読は要素ごとに 1 回だけ (打つたびに外して付け直さない)。
 * onValue は最新のものを呼ぶ。
 */
export function useBindField(onValue: (value: string) => void): RefCallback<HTMLElement> {
  const latest = useRef(onValue);
  useEffect(() => {
    latest.current = onValue;
  }, [onValue]);
  return useCallback(bindField((value) => latest.current(value)), []);
}
