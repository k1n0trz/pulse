import type { MetaConnector, MetaToolName, MetaToolResult } from "@pulse/shared";

export type ToolHandler<T = unknown> = (args: Record<string, unknown>) => Promise<T>;

export class NotImplementedError extends Error {
  constructor(tool: MetaToolName, phase: string) {
    super(`Tool "${tool}" is not implemented yet (lands in ${phase}).`);
    this.name = "NotImplementedError";
  }
}

export abstract class BaseConnector implements MetaConnector {
  abstract readonly name: MetaConnector["name"];
  protected abstract handlers(): Partial<Record<MetaToolName, ToolHandler>>;

  async invoke<T = unknown>(input: { tool: MetaToolName; args: Record<string, unknown> }): Promise<MetaToolResult<T>> {
    const handler = this.handlers()[input.tool];
    const startedAt = Date.now();
    if (!handler) {
      return {
        ok: false,
        provider: this.name,
        tool: input.tool,
        message: `Tool ${input.tool} not implemented on provider ${this.name}.`,
        durationMs: Date.now() - startedAt
      };
    }

    try {
      const data = (await handler(input.args)) as T;
      return {
        ok: true,
        provider: this.name,
        tool: input.tool,
        message: "ok",
        data,
        durationMs: Date.now() - startedAt
      };
    } catch (error) {
      const err = error as Error;
      return {
        ok: false,
        provider: this.name,
        tool: input.tool,
        message: err.message,
        raw: err,
        durationMs: Date.now() - startedAt
      };
    }
  }
}
