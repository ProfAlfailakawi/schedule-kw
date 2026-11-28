import fs from "node:fs";
for (const arg of process.argv.slice(2)) {
  const [file, range] = arg.split(":");
  const [a, b] = range.split("-").map(Number);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  console.log(`=== ${arg}`);
  for (let i = a; i <= (b || a); i++) console.log(`${i}: ${lines[i - 1].slice(0, 230)}`);
}
