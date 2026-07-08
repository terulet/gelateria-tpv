const fs = require("fs");

const p = JSON.parse(fs.readFileSync("package.json", "utf8"));

p.build = p.build || {};
p.build.win = p.build.win || {};

p.build.win.signAndEditExecutable = false;
p.build.forceCodeSigning = false;

fs.writeFileSync("package.json", JSON.stringify(p, null, 2));
console.log("Desactivado signAndEditExecutable y forceCodeSigning");
