/** 検査・生成の終了コード。全コマンドがこの 3 値のみを返す。 */
export const ExitCode = {
  Ok: 0,
  Violation: 1,
  CannotCheck: 2,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
