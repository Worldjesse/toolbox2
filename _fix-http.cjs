const fs = require("fs");
const path = "D:/tools/toolbox2/src/tools/HttpTool.vue";
let s = fs.readFileSync(path, "utf8");
const block = [
  "const bodyPlaceholder = computed(() => {",
  "  if (bodyType.value === 'json')",
  "    return '{\\n  \\\"key\\\": \\\"value\\\"\\n}'",
  "  return 'request body...'",
  "})",
].join("\n");
s = s.replace(/const bodyPlaceholder = computed\(\(\) => \{[\s\S]*?\n\}\)/, block);
s = s.replace(/<Button\r?\n\s*:placeholder="bodyPlaceholder"\r?\n/, "<Button\n");
fs.writeFileSync(path, s);
const lines = s.split(/\n/);
for (let i = 76; i <= 84; i++) console.log(String(i + 1).padStart(4) + "|" + lines[i]);
console.log("---");
for (let i = 285; i <= 310; i++) console.log(String(i + 1).padStart(4) + "|" + lines[i]);
console.log("ok");
