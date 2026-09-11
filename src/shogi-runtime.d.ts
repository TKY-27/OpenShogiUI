declare module "virtual:shogi-runtime" {
  export const assetPrefix: string;
  export const releaseControllerEnabled: boolean;
  export const releaseManifest:
    | import("./core-prototype-protocol").PrototypeManifest
    | null;
}
