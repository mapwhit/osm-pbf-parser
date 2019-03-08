const test = require('tape');
const fs = require('fs');
const path = require('path');
const parser = require('../');

const expected = require('./data/somes.json');

test('somes island full extract', function (t) {
    t.plan(expected.length);
    const osm = parser();

    const file = path.join(__dirname, 'extracts/somes.osm.pbf');
    const rs = fs.createReadStream(file);
    rs.pipe(osm).on('data', ondata);

    let i = 0;
    function ondata(item) {
        t.deepEqual(item, expected[i], `same for ${i}`);
        if (i++ >= expected.length) rs.close();
    }
});
