import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const server = readFileSync("server.ts", "utf8");
const start = server.indexOf("function payloadItems(){");
const end = server.indexOf("function courseOf(it)", start);
assert.ok(start >= 0 && end > start);
const scope: Record<string, unknown> = {
  state: [{ rowId: 11 }, { rowId: 12, removedByDepartment: true }, { rowId: 13 }],
  unchangedEdit: () => false,
  rawItem: (item: { rowId: number }) => ({ rowId: item.rowId }),
};
vm.createContext(scope);
vm.runInContext(server.slice(start, end), scope);
const call = (name: string, arg: number) => vm.runInContext(`${name}(${arg})`, scope);
assert.equal(call("payloadIndex", 2), 1);
assert.equal(call("stateIndex", 1), 2);
assert.equal(call("stateIndex", 2), -1);
assert.equal(JSON.stringify(call("payloadWith", 2)), JSON.stringify([{ rowId: 11 }, { rowId: 13 }]));
assert.match(server, /itemIndex:payloadIndex\(i\),items:payloadWith\(i\)/);
assert.match(server, /stateIndex\(Number\(result\.itemIndex\)\)/);
assert.match(server, /function heatSig\(i\)\{var at=payloadIndex\(i\)/);
assert.match(server, /clearTimeout\(heatTimer\[i\]\);heatTimer\[i\]=setTimeout/);
console.log("Deleted-request indexing: 8 passed");
