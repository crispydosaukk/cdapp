const fs = require('fs');
const filePath = 'd:\\dashboardtesting-main\\functions\\index.js';
let content = fs.readFileSync(filePath, 'utf8');

// The file currently has:
//       }
//       };
// Let's just fix it directly.
content = content.replace(/}\n\s*};\n\s*try/g, '};\n      try');

fs.writeFileSync(filePath, content);
console.log('Fixed syntax error');
