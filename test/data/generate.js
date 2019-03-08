var fs = require('fs');
var through = require('through2');
var parseOSM = require('../');

var osm = parseOSM();
fs.createReadStream(process.argv[2])
    .pipe(osm)
    .pipe(through.obj(function (item, enc, next) {
        console.log(JSON.stringify(item));
        next();
    }))
;
