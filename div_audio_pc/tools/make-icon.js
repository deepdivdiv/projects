// PNG를 그대로 담은 윈도우 아이콘(.ico)을 만든다.
const fs = require('fs');
const png = fs.readFileSync(process.argv[2]);
const head = Buffer.alloc(22);
head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head[6] = 0; head[7] = 0; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
fs.writeFileSync(process.argv[3], Buffer.concat([head, png]));
