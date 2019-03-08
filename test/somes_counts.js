const test = require('tape');
const fs = require('fs');
const path = require('path');
const parser = require('../');
const through = require('through2');

test('somes counts', function (t) {
    t.plan(1);
    const osm = parser();
    const counts = {};

    const file = path.join(__dirname, 'extracts/somes.osm.pbf');
    const rs = fs.createReadStream(file);
    rs.pipe(osm).pipe(through.obj(write, end));

    function write (item, enc, next) {
        if (!counts[item.type]) counts[item.type] = 0;
        counts[item.type] ++;
        next();
    }

    function end () {
        // console.error(counts);
        t.deepEqual(counts, {
            node: 1494,
            way: 77,
            relation: 6
        });
        t.end();
    }
});
