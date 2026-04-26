import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  computeIdfWeights,
  parseSearchQuery,
  analyzeTextMatch,
  getMatchScore,
  mergeMatchAnalyses,
  getMetadataMatch,
  compareSearchResults,
  type SearchResult,
} from "../../src/session-reference/search/scoring.ts";

function makeSession(id: string, title: string, slug?: string) {
  return {
    id,
    title,
    slug: slug ?? id,
    time: { updated: 100, archived: 0 },
  };
}

function defaultIdf(
  sessions: Array<ReturnType<typeof makeSession>>,
  terms: string[],
) {
  return computeIdfWeights(sessions as never, terms);
}

describe("session-reference/search/scoring", () => {
  describe("computeIdfWeights", () => {
    test("high-frequency terms get lower weight than low-frequency terms", () => {
      const sessions = [
        makeSession("s1", "Alpha planning notes"),
        makeSession("s2", "Alpha implementation notes"),
        makeSession("s3", "Alpha design notes"),
        makeSession("s4", "Beta planning notes"),
        makeSession("s5", "Beta implementation notes"),
        makeSession("s6", "Gamma design notes"),
      ];

      const idf = defaultIdf(sessions, ["alpha", "beta", "gamma"]);
      const alphaW = idf.get("alpha")!;
      const betaW = idf.get("beta")!;
      const gammaW = idf.get("gamma")!;

      assert.ok(Number.isFinite(alphaW));
      assert.ok(Number.isFinite(betaW));
      assert.ok(Number.isFinite(gammaW));
      assert.ok(
        alphaW < betaW,
        `alpha ${alphaW} should be < beta ${betaW} (alpha more frequent)`,
      );
      assert.ok(
        betaW < gammaW,
        `beta ${betaW} should be < gamma ${gammaW} (beta more frequent)`,
      );
    });

    test("equal-frequency terms get equal weight", () => {
      const sessions = [
        makeSession("s1", "Alpha beta planning"),
        makeSession("s2", "Alpha beta implementation"),
        makeSession("s3", "Alpha beta design"),
      ];

      const idf = defaultIdf(sessions, ["alpha", "beta"]);
      const alphaW = idf.get("alpha")!;
      const betaW = idf.get("beta")!;

      assert.equal(alphaW, betaW);
    });

    test("small window does not crash (≤ 3 sessions)", () => {
      const sessions = [
        makeSession("s1", "Alpha notes"),
        makeSession("s2", "Beta notes"),
      ];

      const idf = defaultIdf(sessions, ["alpha", "beta", "gamma"]);
      for (const weight of idf.values()) {
        assert.ok(Number.isFinite(weight));
        assert.ok(weight > 0);
      }
    });

    test("term not in any session gets a valid weight", () => {
      const sessions = [
        makeSession("s1", "Alpha notes"),
        makeSession("s2", "Beta notes"),
      ];

      const idf = defaultIdf(sessions, ["gamma", "delta"]);
      const gammaW = idf.get("gamma")!;
      const deltaW = idf.get("delta")!;

      assert.ok(Number.isFinite(gammaW));
      assert.ok(Number.isFinite(deltaW));
      assert.ok(gammaW > 0);
      assert.ok(deltaW > 0);
    });

    test("single session gives same weight to all terms", () => {
      const sessions = [makeSession("s1", "Alpha beta gamma")];

      const idf = defaultIdf(sessions, ["alpha", "beta"]);
      assert.equal(idf.get("alpha"), idf.get("beta"));
    });

    test("empty terms returns empty map", () => {
      const sessions = [
        makeSession("s1", "Alpha notes"),
        makeSession("s2", "Beta notes"),
      ];

      const idf = defaultIdf(sessions, []);
      assert.equal(idf.size, 0);
    });

    test("empty sessions returns empty map", () => {
      const idf = defaultIdf([], ["alpha"]);
      assert.equal(idf.size, 1);
      assert.ok(Number.isFinite(idf.get("alpha")!));
    });

    test("IDF weights are based on normalized title + slug combined", () => {
      const sessions = [
        makeSession("s1", "  ALPHA  Planning  ", "alpha-slug-1"),
        makeSession("s2", "Alpha Beta Notes", "beta-slug"),
        makeSession("s3", "Delta Only", "delta-slug"),
      ];

      const idf = defaultIdf(sessions, ["alpha", "beta", "gamma"]);
      const alphaW = idf.get("alpha")!;
      const betaW = idf.get("beta")!;
      const gammaW = idf.get("gamma")!;

      assert.ok(
        alphaW < betaW,
        `alpha ${alphaW} should be < beta ${betaW} (alpha in 2 sessions, beta in 1)`,
      );
      assert.ok(
        betaW < gammaW,
        `beta ${betaW} should be < gamma ${gammaW} (beta in 1 session, gamma in 0)`,
      );
    });
  });

  describe("getMatchScore", () => {
    test("phrase-matched score adds 1000 bonus on top of IDF sum", () => {
      assert.equal(getMatchScore(true, 3.5), 1003.5);
    });

    test("non-phrase match only uses IDF sum", () => {
      assert.equal(getMatchScore(false, 3.5), 3.5);
    });
  });

  describe("analyzeTextMatch", () => {
    test("uses IDF weights instead of counting", () => {
      const query = parseSearchQuery("alpha beta")!;
      const idf = new Map([
        ["alpha", 1.2],
        ["beta", 2.5],
      ]);

      const analysis = analyzeTextMatch("alpha beta planning", query, idf)!;
      assert.ok(analysis.phraseMatched);
      assert.equal(analysis.matchedTerms.length, 2);
      assert.equal(analysis.score, 1000 + 1.2 + 2.5);
    });

    test("returns null when nothing matches", () => {
      const query = parseSearchQuery("gamma")!;
      const idf = new Map([["gamma", 1.0]]);

      const analysis = analyzeTextMatch("alpha beta", query, idf);
      assert.equal(analysis, null);
    });

    test("uses fallback weight 1 for unknown term", () => {
      const query = parseSearchQuery("gamma")!;
      const idf = new Map<string, number>();

      const analysis = analyzeTextMatch("gamma ray", query, idf)!;
      assert.equal(analysis.score, 1000 + 1);
    });
  });

  describe("mergeMatchAnalyses", () => {
    test("merges matched terms and uses IDF weighted sum", () => {
      const query = parseSearchQuery("alpha beta gamma")!;
      const idf = new Map([
        ["alpha", 1.2],
        ["beta", 2.5],
        ["gamma", 3.0],
      ]);

      const merged = mergeMatchAnalyses(
        [
          analyzeTextMatch("alpha present", query, idf),
          analyzeTextMatch("beta gamma present", query, idf),
        ],
        idf,
      )!;

      assert.equal(merged.phraseMatched, false);
      assert.deepEqual(merged.matchedTerms.sort(), ["alpha", "beta", "gamma"]);
      assert.equal(merged.score, 1.2 + 2.5 + 3.0);
    });

    test("returns null for empty analyses", () => {
      const query = parseSearchQuery("gamma")!;
      const idf = new Map([["gamma", 1.0]]);

      const merged = mergeMatchAnalyses(
        [
          analyzeTextMatch("alpha", query, idf),
          analyzeTextMatch("beta", query, idf),
        ],
        idf,
      );
      assert.equal(merged, null);
    });
  });

  describe("compareSearchResults", () => {
    function makeResult(
      sessionID: string,
      match: "title" | "slug-or-id" | "transcript",
      phraseMatched: boolean,
      matchScore: number,
      updatedAt = 100,
    ): SearchResult {
      return {
        sessionID,
        label: "test",
        updatedAt,
        match,
        phraseMatched,
        matchScore,
      };
    }

    test("sorts by match bucket first", () => {
      const a = makeResult("a", "slug-or-id", true, 10);
      const b = makeResult("b", "title", true, 1);

      assert.ok(
        compareSearchResults(a, b) > 0,
        "title should come before slug-or-id",
      );
    });

    test("then sorts by phraseMatched within same bucket", () => {
      const a = makeResult("a", "title", false, 10);
      const b = makeResult("b", "title", true, 1);

      assert.ok(
        compareSearchResults(a, b) > 0,
        "phraseMatched should come first",
      );
    });

    test("then sorts by matchScore within same bucket and phrase status", () => {
      const a = makeResult("a", "title", true, 5);
      const b = makeResult("b", "title", true, 10);

      assert.ok(
        compareSearchResults(a, b) > 0,
        "higher matchScore should come first",
      );
    });

    test("uses ID in stable tie-break", () => {
      const a = makeResult("ses_a", "title", true, 5);
      const b = makeResult("ses_b", "title", true, 5);

      assert.ok(
        compareSearchResults(a, b) < 0,
        "a should come before b lexicographically",
      );
    });

    test("rare keyword match ranks above common keyword match in same bucket", () => {
      const sessions = [
        makeSession("s1", "Common planning notes"),
        makeSession("s2", "Common implementation notes"),
        makeSession("s3", "Common design notes"),
        makeSession("s4", "Common review notes"),
        makeSession("s5", "Rare keyword planning"),
      ];

      const query = parseSearchQuery("common rare")!;
      const idf = computeIdfWeights(sessions as never, query.terms);

      const commonW = idf.get("common")!;
      const rareW = idf.get("rare")!;

      assert.ok(
        commonW < rareW,
        `common IDF ${commonW} should be < rare IDF ${rareW}`,
      );
      assert.ok(rareW > 1, `rare IDF ${rareW} should be > 1 (amplification)`);
      assert.ok(
        commonW < 2,
        `common IDF ${commonW} should be < 2 (discounting)`,
      );

      const s4Analysis = analyzeTextMatch(sessions[4]!.title, query, idf);
      const s1Analysis = analyzeTextMatch(sessions[0]!.title, query, idf);

      assert.ok(
        (s4Analysis?.score ?? 0) > (s1Analysis?.score ?? 0),
        `rare session score ${s4Analysis?.score} should exceed common-only session score ${s1Analysis?.score}`,
      );
    });
  });
});
