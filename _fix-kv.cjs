const fs = require("fs");
const path = "D:/tools/toolbox2/src/tools/HttpTool.vue";
let s = fs.readFileSync(path, "utf8");

const oldFns = `function addRow(list: typeof query) {
  list.value.push({ key: '', value: '', enabled: true })
}

function removeRow(list: typeof query, idx: number) {
  if (list.value.length <= 1) {
    list.value[0] = { key: '', value: '', enabled: true }
    return
  }
  list.value.splice(idx, 1)
}`;

const newFns = `function emptyKv(): Kv {
  return { key: '', value: '', enabled: true }
}

function addQueryRow() {
  query.value.push(emptyKv())
}

function removeQueryRow(idx: number) {
  if (query.value.length <= 1) {
    query.value = [emptyKv()]
    return
  }
  query.value.splice(idx, 1)
}

function addHeaderRow() {
  headers.value.push(emptyKv())
}

function removeHeaderRow(idx: number) {
  if (headers.value.length <= 1) {
    headers.value = [emptyKv()]
    return
  }
  headers.value.splice(idx, 1)
}`;

if (!s.includes(oldFns)) {
  console.error("old functions block not found");
  process.exit(1);
}
s = s.replace(oldFns, newFns);

// fix template click handlers
s = s.replace(/@click="removeRow\(query, idx\)"/g, '@click="removeQueryRow(idx)"');
s = s.replace(/@click="addRow\(query\)"/g, '@click="addQueryRow()"');
s = s.replace(/@click="removeRow\(headers, idx\)"/g, '@click="removeHeaderRow(idx)"');
s = s.replace(/@click="addRow\(headers\)"/g, '@click="addHeaderRow()"');

// ensure Button type=button for row actions to avoid any form quirks
s = s.replace(
  /<Button size="sm" variant="ghost" class="h-8 px-2" @click="removeQueryRow\(idx\)">/g,
  '<Button type="button" size="sm" variant="ghost" class="h-8 px-2" @click.stop="removeQueryRow(idx)">'
);
s = s.replace(
  /<Button size="sm" variant="ghost" class="h-8 px-2" @click="removeHeaderRow\(idx\)">/g,
  '<Button type="button" size="sm" variant="ghost" class="h-8 px-2" @click.stop="removeHeaderRow(idx)">'
);
s = s.replace(
  /<Button size="sm" variant="outline" @click="addQueryRow\(\)">/g,
  '<Button type="button" size="sm" variant="outline" @click.stop="addQueryRow()">'
);
s = s.replace(
  /<Button size="sm" variant="outline" @click="addHeaderRow\(\)">/g,
  '<Button type="button" size="sm" variant="outline" @click.stop="addHeaderRow()">'
);

fs.writeFileSync(path, s);
console.log("patched");
console.log("has addHeaderRow", s.includes("function addHeaderRow"));
console.log("has addHeaderRow()", s.includes('addHeaderRow()'));
console.log("has removeHeaderRow", s.includes("removeHeaderRow(idx)"));
