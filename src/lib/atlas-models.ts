export type AtlasModelId = "male" | "female";

export const ATLAS_MODELS = {
  male: {
    id: "male",
    label: "Male",
    reference: "Adult male reference",
    version: "BodyParts3D 4.0",
    assetPath: "/atlas/bodyparts3d-v4",
    catalog: "atlas.json",
    chunkPrefix: "body",
    sourceUrl: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html",
    attribution: "BodyParts3D, \u00a9 The Database Center for Life Science licensed under CC Attribution 4.0 International",
    scope: "Adult male reference anatomy. It does not represent every structure, microscopic detail or human variation.",
  },
  female: {
    id: "female",
    label: "Female",
    reference: "Adult female reference",
    version: "HRA Female v1.5",
    assetPath: "/atlas/hra-female-v1.5",
    catalog: "atlas-female.json",
    chunkPrefix: "female",
    sourceUrl: "https://doi.org/10.48539/HBM352.BTSQ.586",
    attribution: "Kristen Browne and Heidi Schlehlein (2023), 3D Reference Organ Set for Female v1.5, Human Reference Atlas / HuBMAP, CC BY 4.0",
    scope: "Adult female organ reference with partial skeleton and muscle coverage. It is not a complete body model. Pregnancy references are separate from the default anatomy.",
  },
} as const;

export function atlasModelId(value: string | null | undefined): AtlasModelId {
  return value === "female" ? "female" : "male";
}

export function atlasChunkUrl(model: AtlasModelId, sourcePath: string, compressed = false) {
  const selected = ATLAS_MODELS[model];
  const expected = new RegExp(`^/models/${selected.chunkPrefix}-\\d+\\.bin${compressed ? "\\.gz" : ""}$`);
  if (!expected.test(sourcePath)) throw new Error("An anatomy asset does not belong to the selected reference.");
  return `${selected.assetPath}/${sourcePath.split("/").at(-1)}`;
}