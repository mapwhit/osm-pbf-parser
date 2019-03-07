const { readFileSync } = require('fs');
const protobuf = require('protocol-buffers');

module.exports = {
    file: protobuf(readFileSync(`${__dirname}/fileformat.proto`, 'utf8')),
    osm: protobuf(readFileSync(`${__dirname}/osmformat.proto`, 'utf8'))
};
