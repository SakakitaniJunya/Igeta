// port のシグネチャに Firestore の型 (Transaction) を出さないための不透明な印。
// infrastructure 層が実際の Firestore Transaction との相互変換 (型アサーション) を行う。
// domain / port はこの中身を一切知らない。

declare const transactionScopeBrand: unique symbol;

export interface TransactionScope {
  readonly [transactionScopeBrand]: true;
}
