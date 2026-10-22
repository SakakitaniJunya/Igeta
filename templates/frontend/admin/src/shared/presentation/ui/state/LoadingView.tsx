/** 読み込み中。骨組みの行と、読み上げに載る「読み込んでいます」。空の文言は読み込みが終わってから出す。 */
export function LoadingView({ subject }: { readonly subject?: string }) {
  return (
    <s-page>
      <s-section>
        <div className="loading" role="status" aria-live="polite">
          <s-text color="subdued">{`${subject ?? ''}読み込んでいます`}</s-text>
          <div className="skeleton short" />
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      </s-section>
    </s-page>
  );
}
