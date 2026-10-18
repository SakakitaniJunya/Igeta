// 要求の本文を生のバイト列で読む (webhook の HMAC は生の本文で確かめるため、JSON にする前の形で持つ)。
// limit を渡すと、超えた時点で読むのをやめて undefined を返す。content-length が上限を超えていれば読まずに返す。

export async function readBody(request: Request, limit?: number): Promise<Buffer | undefined> {
  const declared = Number(request.headers.get('content-length'));
  if (limit !== undefined && Number.isFinite(declared) && declared > limit) return undefined;
  if (request.body === null) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (limit !== undefined && size > limit) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** 本文が空なら undefined。JSON として読めなければ INVALID_JSON (印)。入口はこれを 400 MALFORMED_REQUEST にする。 */
export function parseJsonBody(raw: Buffer): unknown {
  if (raw.length === 0) return undefined;
  try {
    return JSON.parse(raw.toString('utf8')) as unknown;
  } catch {
    return INVALID_JSON;
  }
}

export const INVALID_JSON: unique symbol = Symbol('invalid-json');
