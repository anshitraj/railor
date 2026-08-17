import "dotenv/config";
import { getDbHandle } from "./client.js";

async function main() {
  const { driver, migrate, close } = await getDbHandle();
  await migrate();
  console.log(`✓ migrations applied via ${driver}`);
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
