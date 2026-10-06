import { z } from "zod";
import { EXPLANATIONS, SYSTEMS, explanation, type Atlas, type Concept, type SceneState, type SystemId } from "@/vendor/human-atlas/anatomy";
import { ATLAS_MODELS, atlasChunkUrl, type AtlasModelId } from "./atlas-models";

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

const femaleTopics: StudyTopic[] = [
  { ...ATLAS_TOPICS[0], systems: ["integumentary", "skeletal", "cardiac", "respiratory", "digestive", "urinary", "nervous", "reproductive"], landmarks: ["heart", "lungs", "kidney", "uterus"] },
  { ...ATLAS_TOPICS[1], landmarks: ["heart", "arteries of heart", "veins of heart"] },
  { ...ATLAS_TOPICS[2], landmarks: ["trachea", "lungs"], questions: ["How do the airways branch as they enter the lungs?", "Which gas-exchange features require microscopic images rather than this organ reference?"] },
  { ...ATLAS_TOPICS[3], landmarks: ["liver", "pancreas", "small intestine"] },
  { ...ATLAS_TOPICS[4] },
  { ...ATLAS_TOPICS[5], landmarks: ["Allen brain", "spinal cord", "eyes"] },
  { ...ATLAS_TOPICS[6], systems: ["reproductive", "digestive"], landmarks: ["ovary", "pancreas"] },
  { ...ATLAS_TOPICS[7], landmarks: ["Left femur", "Right femur"], questions: ["What features can you identify in the femur and its surrounding structures?", "Which parts of the skeleton and musculature need another reference because this model's coverage is partial?"] },
  { id: "reproduction", label: "Female reproduction", systems: ["reproductive", "urinary"], landmarks: ["uterus", "ovary", "vagina"], questions: ["How are the ovaries, uterine tubes, uterus and vagina positioned relative to one another?", "What roles do these organs play in reproduction, according to your course sources?"] },
  { id: "pregnancy", label: "Pregnancy reference", systems: ["pregnancy"], landmarks: ["placenta"], questions: ["How do the placenta and umbilical cord support exchange during pregnancy?", "Why must these reference structures be distinguished from the non-pregnant adult model?"] },
];

const femaleOrganDescriptions: Record<string, string> = {
  uterus: "A hollow muscular organ in the pelvis. Its lining changes through the menstrual cycle and can support implantation and development during pregnancy.",
  vagina: "A muscular canal connecting the cervix of the uterus to the outside of the body. It provides a passage for menstrual flow and forms part of the birth canal.",
  ovary: "An organ that contains developing oocytes and produces hormones including estrogen and progesterone.",
};

export function atlasTopics(model: AtlasModelId): StudyTopic[] {
  return model === "female" ? femaleTopics : ATLAS_TOPICS;
}

export function atlasSystems(atlas: Atlas) {
  return SYSTEMS.filter((system) => atlas.parts.some((part) => part.system === system.id));
}

export function atlasSelectionKey(model: AtlasModelId, concept: Concept) {
  return `${model}:${concept.id}:${concept.elements.join(",")}`;
}

const coordinate = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const nonnegativeInteger = z.number().int().nonnegative();
const manifestSchema = z.object({
  version: z.string(),
  sex: z.enum(["male", "female"]).optional(),
  source: z.string().optional(),
  scope: z.string().optional(),
  parts: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), conceptId: z.string().min(1),
    system: z.enum(SYSTEMS.map((system) => system.id) as [SystemId, ...SystemId[]]),
    chunk: nonnegativeInteger, positions: nonnegativeInteger, normals: nonnegativeInteger, indices: nonnegativeInteger,
    vertexCount: z.number().int().positive(), indexCount: z.number().int().positive(), bounds: z.tuple([coordinate, coordinate]),
  })).min(1).max(5000),
  concepts: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), elements: z.array(z.string()).min(1) })).min(1).max(10000),
  chunks: z.array(z.object({ url: z.string(), bytes: z.number().int().positive(), gzip: z.string().optional(), gzipBytes: z.number().int().positive().optional() })).min(1).max(100),
  triangles: z.number().int().positive(),
});

export function parseAtlas(input: unknown, model: AtlasModelId = "male"): Atlas {
  const atlas = manifestSchema.parse(input);
  if ((atlas.sex || "male") !== model) throw new Error("The anatomy catalog does not match the selected reference.");
  const ids = new Set(atlas.parts.map((part) => part.id));
  if (ids.size !== atlas.parts.length || new Set(atlas.concepts.map((concept) => concept.id)).size !== atlas.concepts.length || atlas.concepts.some((concept) => concept.elements.some((id) => !ids.has(id)))) throw new Error("The anatomy catalog contains invalid structure references.");
  for (const part of atlas.parts) {
    const chunk = atlas.chunks[part.chunk];
    if (!chunk || part.positions % 4 || part.normals % 2 || part.indices % 4 || part.indexCount % 3 || part.positions + part.vertexCount * 12 > chunk.bytes || part.normals + part.vertexCount * 6 > chunk.bytes || part.indices + part.indexCount * 4 > chunk.bytes || part.bounds[0].some((minimum, index) => minimum > part.bounds[1][index])) throw new Error("The anatomy catalog contains invalid geometry ranges.");
  }
  return { ...atlas, sex: model, chunks: atlas.chunks.map((chunk) => ({ ...chunk, url: atlasChunkUrl(model, chunk.url), gzip: chunk.gzip ? atlasChunkUrl(model, chunk.gzip, true) : undefined })) };
}

export function initialAtlasState(topic = ATLAS_TOPICS[0]): SceneState {
  return { visible: [...topic.systems], selected: [], explode: 0, isolate: false, view: "front", rotate: false, reset: 0, zoom: 0 };
}

export function searchAnatomy(atlas: Atlas, query: string): Concept[] {
  const aliases: Record<string, string> = { oesophagus: "esophagus", windpipe: "trachea", "voice box": "larynx", kneecap: "patella" };
  const term = query.trim().toLowerCase().slice(0, 160);
  if (!term) return atlasTopics(atlas.sex || "male")[0].landmarks.flatMap((name) => atlas.concepts.filter((concept) => concept.name.toLowerCase() === name.toLowerCase()));
  const normalized = aliases[term] || term;
  return atlas.concepts.filter((concept) => concept.name.toLowerCase().includes(normalized) || concept.id.toLowerCase().includes(normalized))
    .sort((first, second) => Number(second.name.toLowerCase() === normalized) - Number(first.name.toLowerCase() === normalized) || first.name.length - second.name.length || first.name.localeCompare(second.name)).slice(0, 80);
}

export function describeAnatomy(atlas: Atlas, concept: Concept) {
  const selected = new Set(concept.elements);
  const parts = atlas.parts.filter((part) => selected.has(part.id));
  const systems = atlasSystems(atlas).filter((system) => parts.some((part) => part.system === system.id));
  const primary = [...systems].sort((first, second) => parts.filter((part) => part.system === second.id).length - parts.filter((part) => part.system === first.id).length)[0];
  if (!primary) throw new Error("This structure is not included in the atlas.");
  const name = concept.name.trim().toLowerCase();
  const femaleDescription = atlas.sex === "female" ? femaleOrganDescriptions[name.replace(/^(left|right) /, "")] : undefined;
  const organDescription = femaleDescription || EXPLANATIONS[name];
  const systemDescription = atlas.sex === "female" && primary.id === "reproductive"
    ? "The female reproductive structures represented here include ovaries, uterine tubes, the uterus and vagina. They contribute to oocyte development, hormone production and reproduction. Pregnancy references are separate from the default adult anatomy."
    : explanation(concept.name, primary.id);
  return { parts, systems, description: organDescription || systemDescription, descriptionKind: organDescription ? "Organ overview" : "System overview" };
}

export function anatomyQuestion(concept: Concept, model: AtlasModelId = "male") {
  return `Using only my selected Life Sciences sources, explain the structure and function of ${concept.name}, selected in the ${model} anatomy reference. How does it work with other body structures? If my sources do not cover it, say so.`;
}

export function anatomyNote(atlas: Atlas, concept: Concept, observation: string) {
  const details = describeAnatomy(atlas, concept);
  const reference = ATLAS_MODELS[atlas.sex || "male"];
  return {
    title: `Human Atlas (${reference.label}): ${concept.name}`.slice(0, 160),
    content: [
      `Human Atlas reference: ${concept.name} (${concept.id})`,
      `Systems: ${details.systems.map((system) => system.name).join(", ")}`,
      `${details.descriptionKind}: ${details.description}`,
      observation.trim() ? `My observation:\n${observation.trim().slice(0, 6000)}` : "",
      `Reference: ${atlas.version}, ${reference.reference.toLowerCase()}. ${concept.elements.length} modeled pieces. Not an assessed mastery record or a verified syllabus source.`,
      reference.scope,
      `${reference.attribution} (CC BY 4.0). ${reference.sourceUrl}`,
      "Human Atlas viewer by ashemag (MIT), adapted for Bokamoso. https://github.com/ashemag/human-atlas",
    ].filter(Boolean).join("\n\n"),
  };
}