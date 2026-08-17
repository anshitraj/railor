import { CliApiError } from "./client.js";
import { errorLine } from "./format.js";

export function fail(error: unknown): never {
  if (error instanceof CliApiError) {
    console.error(errorLine(`${error.code}: ${error.message}`));
  } else {
    console.error(errorLine((error as Error).message));
  }
  process.exit(1);
}
