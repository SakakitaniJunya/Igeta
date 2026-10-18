// 登録の入力欄。送る前に domain の検証を通す。誤りがあれば送らずに全部を出す。通ったら値を onSubmit へ返す (通信は呼び出し元)。
// 入力欄は React の onChange でなく useBindField (input・change の購読) で読む。入力は送っても消さない (失敗したときに残すため)。

import { useState } from 'react';
import { useBindField } from '@/shared/presentation/bind-field';
import { FormErrorBanner } from '@/shared/presentation/ui/FormErrorBanner';
import type { __Feature__Draft } from '@/features/__feature__/domain/__feature__.model';
import { NAME_MAX, validate__Feature__Form } from '@/features/__feature__/domain/__feature__.validation';

export interface __Feature__FormProps {
  readonly saving: boolean;
  readonly onSubmit: (draft: __Feature__Draft) => void;
  readonly onCancel: () => void;
}

export function __Feature__Form({ saving, onSubmit, onCancel }: __Feature__FormProps) {
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<ReadonlyArray<string>>([]);
  const nameRef = useBindField(setName);

  function submit(): void {
    const validated = validate__Feature__Form({ name });
    if (!validated.ok) {
      setErrors(validated.errors);
      return;
    }
    setErrors([]);
    onSubmit(validated.value);
  }

  return (
    <s-section heading="登録">
      <s-stack gap="base">
        <s-text-field label="名称" value={name} maxLength={NAME_MAX} required ref={nameRef} />
        <FormErrorBanner messages={errors} />
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-button variant="primary" loading={saving} disabled={saving} onClick={submit}>
            登録
          </s-button>
          <s-button disabled={saving} onClick={onCancel}>
            やめる
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
