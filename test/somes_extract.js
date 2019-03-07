const test = require('tape');
const fs = require('fs');
const path = require('path');
const parser = require('../');
const through = require('through2');

const expected = require('./data/somes.json');

test('somes island full extract', function (t) {
    t.plan(expected.length);
    const osm = parser();

    const file = path.join(__dirname, 'extracts/somes.osm.pbf');
    const rs = fs.createReadStream(file);
    rs.pipe(osm).pipe(through.obj(write));

    function write (items, enc, next) {
        for (const item of items) {
            t.deepEqual(item, expected.shift());
            if (expected.length === 0) break;
        }
        if (expected.length > 0) next();
        else if (rs.close) rs.close();
    }
});
