const fs = require("fs");

const p = JSON.parse(fs.readFileSync("package.json", "utf8"));

if (p.build) {
  delete p.build.icon;

  if (p.build.win) {
    delete p.build.win.icon;
  }

  if (p.build.nsis) {
    delete p.build.nsis.installerIcon;
    delete p.build.nsis.uninstallerIcon;
    delete p.build.nsis.installerHeaderIcon;
  }
}

fs.writeFileSync("package.json", JSON.stringify(p, null, 2));
console.log("Iconos eliminados de package.json");
