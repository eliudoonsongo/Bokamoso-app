import { z } from "zod";
import { EXPLANATIONS, SYSTEMS, explanation, type Atlas, type Concept, type SceneState, type SystemId } from "@/vendor/human-atlas/anatomy";

export const ATLAS_ASSET_PATH = "/atlas/bodyparts3d-v4";
export const ATLAS_SOURCE_URL = "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html";
export const ATLAS_ATTRIBUTION = "BodyParts3D, \u00a9 The Database Center for Life Science licensed under CC Attribution 4.0 International";

type StudyTopic = { id: string; label: string; systems: SystemId[]; landmarks: string[]; questions: string[] };

export const ATLAS_TOPICS: StudyTopic[] = [
  { id: "overview", label: "Human body", systems: ["skeletal", "cardiac", "respiratory", "digestive", "urinary", "nervous"], landmarks: ["heart", "brain", "left lung", "kidney"], questions: ["How does the position of each organ relate to its function?", "Which body systems work together to keep the internal environment stable?"] },
  { id: "circulation", label: "Transport & circulation", systems: ["cardiac", "arterial", "venous"], landmarks: ["heart", "right side of heart", "left side of heart"], questions: ["Where does blood travel after leaving each side of the heart?", "How are the pulmonary and systemic circuits connected?"] },
  { id: "breathing", label: "Gaseous exchange", systems: ["respiratory", "skeletal"], landmarks: ["trachea", "left lung", "right lung", "diaphragm"], questions: ["What route does air follow from the trachea into the lungs?", "How does a change in diaphragm position affect the volume of the chest?"] },
  { id: "nutrition", label: "Human nutrition", systems: ["digestive"], landmarks: ["stomach", "liver", "pancreas", "small intestine"], questions: ["Which structures move food and which contribute digestive secretions?", "Where do digestion and absorption occur in the digestive tract?"] },
  { id: "excretion", label: "Excretion", systems: ["urinary", "arterial", "venous"], landmarks: ["left kidney", "right kidney", "urinary bladder"], questions: ["How does urine travel from a kidney to the bladder?", "How is removing a waste product different from regulating water balance?"] },
  { id: "coordination", label: "Nervous coordination", systems: ["nervous", "sensory"], landmarks: ["brain", "spinal cord", "left eye"], questions: ["How are the central and peripheral nervous systems connected?", "Which structures detect a stimulus, and which coordinate a response?"] },
  { id: "hormones", label: "Hormonal control", systems: ["endocrine", "digestive"], landmarks: ["pituitary gland", "pancreas"], questions: ["How does an endocrine signal reach its target tissue?", "Why can an organ belong to more than one functional system?"] },
  { id: "movement", label: "Support & movement", systems: ["skeletal", "muscular", "connective"], landmarks: ["femur", "diaphragm"], questions: ["How do muscle attachments help produce movement?", "What is the relationship between support, protection and movement?"] },
  { id: "reproduction", label: "Male reproduction", systems: ["reproductive", "urinary"], landmarks: ["testis", "prostate"], questions: ["Which structures contribute to the production and transport of sperm?", "Which questions require a different reference, such as female reproductive anatomy?"] },
];

const coordinate = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const nonnegativeInteger = z.number().int().nonnegative();
const manifestSchema = z.object({
  version: z.string(),
  parts: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), conceptId: z.string().min(1),
    system: z.enum(SYSTEMS.map((system) => system.id) as [SystemId, ...SystemId[]]),
    chunk: nonnegativeInteger, positions: nonnegativeInteger, normals: nonnegativeInteger, indices: nonnegativeInteger,
    vertexCount: z.number().int().positive(), indexCount: z.number().int().positive(), bounds: z.tuple([coordinate, coordinate]),
  })).min(1).max(5000),
  concepts: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), elements: z.array(z.string()).min(1) })).min(1).max(10000),
  chunks: z.array(z.object({ url: z.string().regex(/^\/models\/body-\d+\.bin$/), bytes: z.number().int().positive(), gzip: z.string().regex(/^\/models\/body-\d+\.bin\.gz$/).optional(), gzipBytes: z.number().int().positive().optional() })).min(1).max(100),
  triangles: z.number().int().positive(),
});

export function parseAtlas(input: unknown): Atlas {
  const atlas = manifestSchema.parse(input);
  const ids = new Set(atlas.parts.map((part) => part.id));
  if (ids.size !== atlas.parts.length || atlas.concepts.some((concept) => concept.elements.some((id) => !ids.has(id)))) throw new Error("The anatomy catalog contains invalid structure references.");
  for (const part of atlas.parts) {
    const chunk = atlas.chunks[part.chunk];
    if (!chunk || part.positions % 4 || part.normals % 2 || part.indices % 4 || part.indexCount % 3 || part.positions + part.vertexCount * 12 > chunk.bytes || part.normals + part.vertexCount * 6 > chunk.bytes || part.indices + part.indexCount * 4 > chunk.bytes || part.bounds[0].some((minimum, index) => minimum > part.bounds[1][index])) throw new Error("The anatomy catalog contains invalid geometry ranges.");
  }
  return { ...atlas, chunks: atlas.chunks.map((chunk) => ({ ...chunk, url: `${ATLAS_ASSET_PATH}/${chunk.url.split("/").at(-1)}`, gzip: chunk.gzip ? `${ATLAS_ASSET_PATH}/${chunk.gzip.split("/").at(-1)}` : undefined })) };
}

export function initialAtlasState(topic = ATLAS_TOPICS[0]): SceneState {
  return { visible: [...topic.systems], selected: [], explode: 0, isolate: false, view: "front", rotate: false, reset: 0, zoom: 0 };
}

export function searchAnatomy(atlas: Atlas, query: string): Concept[] {
  const aliases: Record<string, string> = { oesophagus: "esophagus", windpipe: "trachea", "voice box": "larynx", kneecap: "patella" };
  const term = query.trim().toLowerCase().slice(0, 160);
  if (!term) return ATLAS_TOPICS[0].landmarks.flatMap((name) => atlas.concepts.filter((concept) => concept.name.toLowerCase() === name));
  const normalized = aliases[term] || term;
  return atlas.concepts.filter((concept) => concept.name.toLowerCase().includes(normalized) || concept.id.toLowerCase().includes(normalized))
    .sort((first, second) => Number(second.name.toLowerCase() === normalized) - Number(first.name.toLowerCase() === normalized) || first.name.length - second.name.length || first.name.localeCompare(second.name)).slice(0, 80);
}

export function describeAnatomy(atlas: Atlas, concept: Concept) {
  const selected = new Set(concept.elements);
  const parts = atlas.parts.filter((part) => selected.has(part.id));
  const systems = SYSTEMS.filter((system) => parts.some((part) => part.system === system.id));
  const primary = [...systems].sort((first, second) => parts.filter((part) => part.system === second.id).length - parts.filter((part) => part.system === first.id).length)[0];
  if (!primary) throw new Error("This structure is not included in the atlas.");
  return { parts, systems, description: explanation(concept.name, primary.id), descriptionKind: EXPLANATIONS[concept.name.toLowerCase()] ? "Organ overview" : "System overview" };
}

export function anatomyQuestion(concept: Concept) {
  return `Using only my selected Life Sciences sources, explain the structure and function of ${concept.name}. How does it work with other body structures? If my sources do not cover it, say so.`;
}

export function anatomyNote(atlas: Atlas, concept: Concept, observation: string) {
  const details = describeAnatomy(atlas, concept);
  return {
    title: `Human Atlas: ${concept.name}`.slice(0, 160),
    content: [
      `Human Atlas reference: ${concept.name} (${concept.id})`,
      `Systems: ${details.systems.map((system) => system.name).join(", ")}`,
      `${details.descriptionKind}: ${details.description}`,
      observation.trim() ? `My observation:\n${observation.trim().slice(0, 6000)}` : "",
      `Reference: ${atlas.version}, adult male anatomy. ${concept.elements.length} modeled pieces. Not an assessed mastery record or a verified syllabus source.`,
      `${ATLAS_ATTRIBUTION} (CC BY 4.0). ${ATLAS_SOURCE_URL}`,
      "Human Atlas viewer by ashemag (MIT), adapted for Bokamoso. https://github.com/ashemag/human-atlas",
    ].filter(Boolean).join("\n\n"),
  };
}