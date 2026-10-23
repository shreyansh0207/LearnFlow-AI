export type SourceType = "reference" | "academic" | "official" | "oer" | "web";

/** Metadata for a source that was actually retrieved — never invented by the model. */
export type SourceDoc = {
  /** Short id ("S1") used only inside one generation request so the model can cite it. */
  ref: string;
  provider: string;
  type: SourceType;
  url: string;
  title: string;
  snippet: string | null;
  authors: string | null;
  published: string | null;
  license: string | null;
  retrievedAt: string;
};

export type RawSource = Omit<SourceDoc, "ref" | "retrievedAt">;

export interface SourceProvider {
  name: string;
  search(query: string, opts: { limit: number; signal: AbortSignal }): Promise<RawSource[]>;
}
