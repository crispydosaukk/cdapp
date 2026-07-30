const fs = require('fs');
const filePath = 'd:\\dashboardtesting-main\\functions\\index.js';
let content = fs.readFileSync(filePath, 'utf8');

// Replace the double brace
content = content.replace("      }\n      };\n      try {", "      };\n      try {");

fs.writeFileSync(filePath, content);
console.log('Fixed double brace');
