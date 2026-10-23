// 入力の誤りを、送らずに止めたことと合わせて出す。誤りが無ければ何も出さない。

export function FormErrorBanner({ messages }: { readonly messages: ReadonlyArray<string> }) {
  if (messages.length === 0) return null;
  return (
    <s-banner tone="critical" heading="入力に誤りがあります。保存していません">
      <s-unordered-list>
        {messages.map((message) => (
          <s-list-item key={message}>{message}</s-list-item>
        ))}
      </s-unordered-list>
    </s-banner>
  );
}
