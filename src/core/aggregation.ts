import type {
  AggregationInput,
  AggregationOutput,
  AggregationStrategy,
  TaskExecutionResult,
  TaskPlan,
} from "./types/planning";

/**
 * Result Aggregator
 *
 * Combines results from multiple task executions using configurable strategies.
 */
export class ResultAggregator {
  private strategies: Map<AggregationStrategy, AggregationStrategyFn>;

  constructor() {
    this.strategies = new Map([
      ["merge", this.merge.bind(this)],
      ["rank", this.rank.bind(this)],
      ["vote", this.vote.bind(this)],
      ["chain", this.chain.bind(this)],
      ["pass_through", this.passThrough.bind(this)],
    ]);
  }

  /**
   * Aggregate results using the specified strategy
   */
  aggregate(input: AggregationInput): AggregationOutput {
    const strategyFn = this.strategies.get(input.plan.aggregationStrategy);

    if (!strategyFn) {
      return {
        content: this.merge(input),
        strategy: "merge",
        summary: `Unknown strategy '${input.plan.aggregationStrategy}', defaulted to merge`,
        warnings: [`Strategy '${input.plan.aggregationStrategy}' not found, using merge`],
      };
    }

    return strategyFn(input);
  }

  private passThrough(input: AggregationInput): AggregationOutput {
    const successfulResults = input.results.filter((r) => r.status === "success");

    if (successfulResults.length === 0) {
      return {
        content: null,
        strategy: "pass_through",
        summary: "No successful results to pass through",
      };
    }

    // Return the last successful result
    const lastResult = successfulResults[successfulResults.length - 1];

    return {
      content: lastResult.output ?? null,
      strategy: "pass_through",
      summary: `Passed through result from task: ${lastResult.tag}`,
    };
  }

  private chain(input: AggregationInput): AggregationOutput {
    const successfulResults = input.results.filter((r) => r.status === "success");

    if (successfulResults.length === 0) {
      return {
        content: null,
        strategy: "chain",
        summary: "No successful results to chain",
      };
    }

    // Chain results: each task's output becomes input to next
    const chained: Record<string, unknown> = {};

    for (const result of successfulResults) {
      chained[result.taskId] = result.output;
    }

    return {
      content: chained,
      strategy: "chain",
      summary: `Chained ${successfulResults.length} task result(s)`,
    };
  }

  private merge(input: AggregationInput): AggregationOutput {
    const successfulResults = input.results.filter((r) => r.status === "success");
    const failedResults = input.results.filter((r) => r.status === "failed");

    const merged: Record<string, unknown> = {
      successful: {},
      failed: {},
      summary: {
        total: input.results.length,
        successful: successfulResults.length,
        failed: failedResults.length,
      },
    };

    for (const result of successfulResults) {
      (merged.successful as Record<string, unknown>)[result.taskId] = result.output;
    }

    for (const result of failedResults) {
      (merged.failed as Record<string, unknown>)[result.taskId] = result.error;
    }

    let summary = `Merged ${successfulResults.length}/${input.results.length} successful results`;

    if (failedResults.length > 0) {
      summary += `, ${failedResults.length} failed`;
    }

    return {
      content: merged,
      strategy: "merge",
      summary,
    };
  }

  private rank(input: AggregationInput): AggregationOutput {
    const resultsWithScores = input.results
      .filter((r) => r.status === "success" && r.output !== undefined)
      .map((result) => ({
        ...result,
        score: this.calculateScore(result),
      }))
      .sort((a, b) => b.score - a.score);

    if (resultsWithScores.length === 0) {
      return {
        content: null,
        strategy: "rank",
        summary: "No results to rank",
      };
    }

    const ranked: Record<string, unknown> = {
      results: resultsWithScores.map((r, i) => ({
        rank: i + 1,
        taskId: r.taskId,
        tag: r.tag,
        score: r.score,
        output: r.output,
      })),
      topResult: resultsWithScores[0].output,
      totalRanked: resultsWithScores.length,
    };

    return {
      content: ranked,
      strategy: "rank",
      summary: `Ranked ${resultsWithScores.length} result(s), top: ${resultsWithScores[0].tag}`,
    };
  }

  private calculateScore(result: TaskExecutionResult): number {
    // Base score from execution success
    let score = result.status === "success" ? 100 : 0;

    // Bonus for faster execution (normalized)
    const speedBonus = Math.max(0, 10000 - result.durationMs) / 100;
    score += speedBonus;

    // Penalty for errors
    if (result.error) {
      score -= 50;
    }

    return score;
  }

  private vote(input: AggregationInput): AggregationOutput {
    const voteCounts = new Map<string, { count: number; outputs: unknown[] }>();

    // Count votes based on output content
    for (const result of input.results) {
      if (result.status !== "success" || result.output === undefined) {
        continue;
      }

      const key = this.getOutputKey(result.output);

      if (!voteCounts.has(key)) {
        voteCounts.set(key, { count: 0, outputs: [] });
      }

      const entry = voteCounts.get(key)!;
      entry.count++;
      entry.outputs.push(result.output);
    }

    if (voteCounts.size === 0) {
      return {
        content: null,
        strategy: "vote",
        summary: "No results to vote on",
      };
    }

    // Find winning output
    let winningKey: string | null = null;
    let maxVotes = 0;

    for (const [key, entry] of voteCounts) {
      if (entry.count > maxVotes) {
        maxVotes = entry.count;
        winningKey = key;
      }
    }

    const winningOutput = winningKey ? voteCounts.get(winningKey)!.outputs[0] : null;

    return {
      content: winningOutput,
      strategy: "vote",
      summary: `Voted: ${maxVotes}/${input.results.length} selected output`,
      warnings: voteCounts.size > 1 ? [`Multiple distinct outputs, selected most common (${maxVotes} votes)`] : undefined,
    };
  }

  private getOutputKey(output: unknown): string {
    if (typeof output === "string") {
      return output.substring(0, 100);
    }
    if (typeof output === "object" && output !== null) {
      // Use first 200 chars of JSON as key
      return JSON.stringify(output).substring(0, 200);
    }
    return String(output);
  }
}

type AggregationStrategyFn = (input: AggregationInput) => AggregationOutput;
