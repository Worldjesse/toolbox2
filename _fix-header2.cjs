const fs = require("fs");
const p = "D:/tools/toolbox2/src/tools/HttpTool.vue";
let s = fs.readFileSync(p, "utf8");
s = s.replace(/\nfunction filteredHeaderNames\(input: string\): string\[] \{\n  const q = input\.trim\(\)\.toLowerCase\(\)\n  if \(!q\)\n    return \[\.\.\.COMMON_HEADER_NAMES\]\n  return COMMON_HEADER_NAMES\.filter\(n => n\.toLowerCase\(\)\.includes\(q\)\)\n\}\n/, "\n");
// prefer plain concat in template for max compatibility
s = s.replace(/:list="`http-header-values-\$\{idx\}`"/g, ':list="\'http-header-values-\' + idx"');
s = s.replace(/:id="`http-header-values-\$\{idx\}`"/g, ':id="\'http-header-values-\' + idx"');
fs.writeFileSync(p, s);
console.log("cleaned");
