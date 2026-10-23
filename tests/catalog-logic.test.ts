import { describe, expect, it } from "vitest";
import { planDiscovery, type CatalogHit } from "@/lib/catalog/plan";
import { sanitizeBranches, sanitizeInterpretation, sanitizeProposal, type Interpretation, type TopicProposal } from "@/lib/catalog/schemas";
import { extractTopicPhrase, findDuplicate, nameSimilarity, possibleDuplicates, requestKey } from "@/lib/catalog/text";
import { InvalidAIOutputError } from "@/lib/ai/schemas";
// @ts-expect-error — plain .mjs build script without type declarations
import { buildSeedSql, nameKey } from "../scripts/generate-catalog-seed.mjs";
// @ts-expect-error — plain .mjs data module without type declarations
import { DOMAINS } from "../scripts/catalog-seed-data.mjs";
import { topicKey } from "@/lib/utils";

const interp = (over: Partial<Interpretation> = {}): Interpretation => ({
  intent: "learn",
  topic: "Personal finance",
  goalSummary: "Manage money",
  scope: "focused",
  learningPattern: "conceptual",
  domain: "Finance, Economics and Commerce",
  relatedDomains: [],
  alternativeNames: [],
  clarifyingQuestion: null,
  clarifyingOptions: [],
  ...over,
});

const hit = (over: Partial<CatalogHit>): CatalogHit => ({
  id: "id",
  parent_id: null,
  domain_id: null,
  path: "p",
  name: "X",
  aliases: [],
  description: null,
  kind: "topic",
  difficulty: null,
  origin: "curated",
  status: "verified",
  request_count: 0,
  rank: 0.3,
  ...over,
});

describe("duplicate detection", () => {
  const catalog = [
    { id: "1", name: "Personal finance", aliases: ["Money management"] },
    { id: "2", name: "Photography", aliases: [] },
    { id: "3", name: "Machine learning", aliases: ["ML"] },
  ];

  it("matches exact names regardless of case and punctuation", () => {
    expect(findDuplicate("personal-finance!", [], catalog)?.match.id).toBe("1");
  });
  it("matches aliases in both directions", () => {
    expect(findDuplicate("Money Management", [], catalog)?.reason).toBe("alias");
    expect(findDuplicate("Statistical learning", ["ML"], catalog)?.match.id).toBe("3");
  });
  it("treats spacing and British/American spelling as the same topic", () => {
    const more = [...catalog, { id: "4", name: "Behavioral science" }, { id: "5", name: "Cybersecurity" }, { id: "6", name: "Color theory" }];
    expect(findDuplicate("Behavioural science", [], more)).toMatchObject({ reason: "variant", match: { id: "4" } });
    expect(findDuplicate("Cyber security", [], more)?.match.id).toBe("5");
    expect(findDuplicate("Colour theory", [], more)?.match.id).toBe("6");
  });

  it("never auto-merges different topics with similar spellings", () => {
    const tricky = [
      { id: "a", name: "Macroeconomics" },
      { id: "b", name: "Inorganic chemistry" },
      { id: "c", name: "Statics" },
      { id: "d", name: "JavaScript" },
    ];
    for (const n of ["Microeconomics", "Organic chemistry", "Statistics", "Java"]) expect(findDuplicate(n, [], tricky), n).toBeNull();
  });

  it("surfaces likely typos as possible duplicates for human review instead", () => {
    expect(findDuplicate("Photograpy", [], catalog)).toBeNull();
    expect(possibleDuplicates("Photograpy", catalog)[0].match.id).toBe("2");
  });
  it("does not merge a specific topic into its broader parent", () => {
    expect(findDuplicate("Underwater photography", [], catalog)).toBeNull();
  });
  it("scores similarity between 0 and 1", () => {
    expect(nameSimilarity("Calculus", "calculus")).toBe(1);
    expect(nameSimilarity("Calculus", "Woodworking")).toBeLessThan(0.2);
  });
});

describe("topic extraction from natural-language goals", () => {
  it.each([
    ["I want to understand how the universe began.", "universe began"],
    ["Teach me traditional Japanese woodworking.", "traditional Japanese woodworking"],
    ["I want to learn how semiconductor fabrication works.", "semiconductor fabrication works"],
    ["Teach me negotiation from beginner to expert.", "negotiation"],
    ["I want to understand the mathematics behind modern cryptography.", "mathematics behind modern cryptography"],
    ["I want to learn underwater photography.", "underwater photography"],
    ["I want to study the history of ancient trade routes.", "history of ancient trade routes"],
    ["I want to understand how a commercial aircraft engine works.", "commercial aircraft engine works"],
  ])("%s", (query, expected) => {
    expect(extractTopicPhrase(query).toLowerCase()).toContain(expected.toLowerCase());
  });
  it("aggregates differently-phrased requests for the same topic", () => {
    expect(requestKey("Teach me underwater photography")).toBe(requestKey("I want to learn underwater photography"));
  });
});

describe("planDiscovery", () => {
  it("TEST A — uses an existing catalog topic on an exact match", () => {
    const p = planDiscovery(interp(), [hit({ id: "pf", name: "Personal finance", kind: "discipline", rank: 2.4 })], { clarified: false });
    expect(p).toMatchObject({ action: "use_existing", node: { id: "pf" } });
  });

  it("TEST B — proposes a structure for an obscure topic missing from the catalog", () => {
    const p = planDiscovery(interp({ topic: "Kintsugi ceramic repair", scope: "narrow" }), [hit({ name: "Sculpture", rank: 0.2 })], { clarified: false });
    expect(p.action).toBe("propose");
  });

  it("TEST C — proposes interdisciplinary topics rather than forcing a weak match", () => {
    const p = planDiscovery(interp({ topic: "Computational neuroscience of music", relatedDomains: ["Arts, Media and Creative Work", "Computing and Technology"] }), [hit({ name: "Neuroscience", rank: 0.5 }), hit({ name: "Music", rank: 0.4 })], {
      clarified: false,
    });
    expect(p.action).toBe("propose");
    if (p.action === "propose") expect(p.candidates.map((c) => c.name)).toEqual(["Neuroscience", "Music"]);
  });

  it("TEST D — a broad subject that exists leads to branch exploration", () => {
    const p = planDiscovery(interp({ topic: "Physics", scope: "broad", intent: "explore" }), [hit({ id: "phy", name: "Physics", kind: "discipline", rank: 2.3 })], { clarified: false });
    expect(p).toMatchObject({ action: "explore", node: { id: "phy" } });
  });

  it("TEST E — a narrow topic under an existing broader one is proposed (with prerequisites), not collapsed into the parent", () => {
    const p = planDiscovery(interp({ topic: "Underwater photography", scope: "narrow" }), [hit({ id: "ph", name: "Photography", kind: "discipline", rank: 0.65 })], { clarified: false });
    expect(p.action).toBe("propose");
    if (p.action === "propose") expect(p.candidates[0].id).toBe("ph");
  });

  it("asks a clarifying question for ambiguous requests, once", () => {
    const amb = interp({ intent: "ambiguous", topic: "Python", clarifyingQuestion: "Which Python?", clarifyingOptions: ["The programming language", "The snake"] });
    expect(planDiscovery(amb, [], { clarified: false }).action).toBe("clarify");
    expect(planDiscovery(amb, [], { clarified: true }).action).toBe("propose");
  });

  it("refuses harmful requests and non-learning input", () => {
    expect(planDiscovery(interp({ intent: "unsafe" }), [], { clarified: false })).toMatchObject({ action: "reject", reason: "unsafe" });
    expect(planDiscovery(interp({ intent: "not_a_learning_goal" }), [], { clarified: false })).toMatchObject({ action: "reject", reason: "not_a_learning_goal" });
  });

  it("matches via alternative names (synonyms)", () => {
    const p = planDiscovery(interp({ topic: "Cosmology", alternativeNames: ["Astrophysics"] }), [hit({ id: "astro", name: "Astrophysics", aliases: ["Cosmology"], rank: 0.4 })], { clarified: false });
    expect(p).toMatchObject({ action: "use_existing", node: { id: "astro" } });
  });
});

describe("AI proposal validation", () => {
  const base: TopicProposal = {
    name: "Underwater photography",
    description: "Taking photographs beneath the water surface using specialised housings, lighting and technique.",
    aliases: ["Underwater photography", "Scuba photography"],
    kind: "subject",
    difficulty: "intermediate",
    learningPattern: "hands_on",
    parentName: "Photography",
    objectives: ["Choose a housing", "Choose a housing"],
    prerequisites: [
      { name: "Underwater photography", reason: "self" },
      { name: "Exposure basics", reason: "light control" },
      { name: "Strobe lighting", reason: "is also a subtopic" },
      { name: "exposure-basics", reason: "duplicate" },
    ],
    subtopics: [
      { name: "Strobe lighting", description: "" },
      { name: "strobe lighting", description: "dup" },
      { name: "Underwater photography", description: "self" },
      { name: "Buoyancy control", description: "" },
    ],
    related: ["Underwater photography", "Marine biology"],
    uncertainty: null,
  };

  it("removes self-references, duplicates and circular prerequisites", () => {
    const p = sanitizeProposal(base);
    expect(p.aliases).toEqual(["Scuba photography"]);
    expect(p.objectives).toEqual(["Choose a housing"]);
    expect(p.subtopics.map((s) => s.name)).toEqual(["Strobe lighting", "Buoyancy control"]);
    expect(p.prerequisites.map((s) => s.name)).toEqual(["Exposure basics"]);
    expect(p.related).toEqual(["Marine biology"]);
  });

  it("TEST I — rejects structurally invalid proposals so nothing is saved", () => {
    expect(() => sanitizeProposal({ ...base, name: " " })).toThrow(InvalidAIOutputError);
    expect(() => sanitizeProposal({ ...base, description: "Too short." })).toThrow(InvalidAIOutputError);
    expect(() => sanitizeBranches({ branches: [{ name: "Photography", description: "", kind: "topic", difficulty: "beginner" }] }, "Photography", [])).toThrow(InvalidAIOutputError);
  });

  it("drops branches that already exist", () => {
    const b = sanitizeBranches(
      {
        branches: [
          { name: "Macro photography", description: "", kind: "topic", difficulty: "beginner" },
          { name: "Portraits", description: "", kind: "topic", difficulty: "beginner" },
        ],
      },
      "Photography",
      ["portraits"],
    );
    expect(b.branches.map((x) => x.name)).toEqual(["Macro photography"]);
  });

  it("caps interpretation lists and drops synonyms equal to the topic", () => {
    const i = sanitizeInterpretation(interp({ topic: "Chess", alternativeNames: ["chess", "Shatranj", "Shatranj"] }), "chess");
    expect(i.alternativeNames).toEqual(["Shatranj"]);
  });
});

describe("curated seed data", () => {
  const REQUIRED = [
    "Natural and Physical Sciences",
    "Mathematics and Formal Sciences",
    "Computing and Technology",
    "Health and Life Sciences",
    "Finance, Economics and Commerce",
    "Real Estate and the Built Environment",
    "Psychology and Human Behavior",
    "Humanities and Social Sciences",
    "Languages and Communication",
    "Arts, Media and Creative Work",
    "Business and Professional Skills",
    "Practical and Vocational Skills",
    "Sports, Fitness and Recreation",
    "Law, Government and Public Policy",
    "Education and Research",
    "Everyday Life and Personal Development",
    "Emerging and Specialized Knowledge",
  ];

  it("contains every required starting domain", () => {
    expect((DOMAINS as Array<{ name: string }>).map((d) => d.name).sort()).toEqual([...REQUIRED].sort());
  });

  it("has no duplicate disciplines within a domain and uses the app's normalisation", () => {
    for (const d of DOMAINS as Array<{ name: string; disciplines: Array<string | [string, unknown]> }>) {
      const keys = d.disciplines.map((x) => nameKey(Array.isArray(x) ? x[0] : x));
      expect(new Set(keys).size, d.name).toBe(keys.length);
      for (const x of d.disciplines) {
        const n = Array.isArray(x) ? x[0] : x;
        expect(nameKey(n)).toBe(topicKey(n));
      }
    }
  });

  it("generates idempotent SQL", () => {
    const sql = buildSeedSql() as string;
    const inserts = sql.split(String.fromCharCode(10)).filter((l) => l.startsWith("insert into"));
    expect(inserts.length).toBe(197);
    expect(inserts.every((l) => l.endsWith("on conflict do nothing;"))).toBe(true);
  });
});
