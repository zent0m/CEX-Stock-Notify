import { check, describeConfig } from "./monitor";

console.log(`Config: ${describeConfig()}`);
check().then((result) => {
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
});
