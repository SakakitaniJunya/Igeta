// この feature の公開面。app と他の feature はここだけを import する (中の層は外から import しない)。
// 画面 (Screen) は app/routes.ts の表に載せる。他の画面に読みを見せる hook と型だけをここから出す。

export { __Feature__Screen } from '@/features/__feature__/presentation/screen/__Feature__Screen';
export { use__Feature__ } from '@/features/__feature__/application/use-__feature__';
export type { __Feature__ListModel, __Feature__Model } from '@/features/__feature__/domain/model';
