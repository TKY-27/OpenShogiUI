declare module "virtual:shogi-runtime" {
  export const assetPrefix: string;
  export const releaseControllerEnabled: boolean;
  export const releaseModels: {
    manifest: import("./core-prototype-protocol").PrototypeManifest;
    label: string;
    generation: number;
  }[];
  export const releaseManifest:
    | import("./core-prototype-protocol").PrototypeManifest
    | null;
}
