const { readFileSync } = require('fs');
const { join } = require('path');

const compile = require('pbf/compile');
const { parse } = require('protocol-buffers-schema');

function fromSchema(file) {
    const text = readFileSync(join(__dirname, file), 'utf8');
    const proto = parse(text);
    return compile(proto);
}

module.exports = {
    file: fromSchema('fileformat.proto'),
    osm: fromSchema('osmformat.proto')
};
