const parsers = require('./parsers.js');
const { Transform } = require('readable-stream');

const NANO = 1e-9;

class PrimitivesParser extends Transform {
    constructor() {
        super({ objectMode: true, highWaterMark: 1 });
    }

    _transform(chunk, enc, cb) {
        if (chunk.type === 'OSMHeader') {
            this._osmheader = parsers.osm.HeaderBlock.decode(chunk.data);
        } else if (chunk.type === 'OSMData') {
            const block = parsers.osm.PrimitiveBlock.decode(chunk.data);
            const opts = {
                stringtable: decodeStringtable(block.stringtable.s),
                granularity: NANO * block.granularity,
                lat_offset: NANO * block.lat_offset,
                lon_offset: NANO * block.lon_offset,
                date_granularity: block.date_granularity,
                HistoricalInformation: this._osmheader.required_features.indexOf('HistoricalInformation') >= 0
            };
            // Output:
            const items = [];
            block.primitivegroup.forEach(function(group) {
                if (group.dense) {
                    parseDenseNodes(group.dense, opts, items);
                }
                group.ways.forEach(function(way) {
                    parseWay(way, opts, items);
                });
                group.relations.forEach(function(relation) {
                    parseRelation(relation, opts, items);
                });
                if (group.nodes && group.nodes.length > 0) {
                    console.warn(`${group.nodes.length} unimplemented nodes`);
                }
                if (group.changesets && group.changesets.length > 0) {
                    console.warn(`${group.changesets.length} unimplemented changesets`);
                }
            });

            if (items.length > 0) {
                // console.log("got", items.length, "items");
                this.push(items);
            }
        }

        cb();
    }
}

module.exports = PrimitivesParser;

function decodeStringtable (bufs) {
    return bufs.map(function(buf) {
            if (!Buffer.isBuffer(buf))
                throw "no buffer";
            return buf.toString('utf8');
        });
}

function parseDenseNodes(dense, opts, results) {
    let id = 0;
    let lat = 0;
    let lon = 0;
    let timestamp = 0;
    let changeset = 0;
    let uid = 0;
    let user_sid = 0;
    let offset = 0;
    let tagsOffset = 0;
    for(; offset < dense.id.length; offset++) {
        id += dense.id[offset];
        lat += dense.lat[offset];
        lon += dense.lon[offset];
        const tags = {};
        for(; tagsOffset < dense.keys_vals.length - 1 && dense.keys_vals[tagsOffset] !== 0; tagsOffset += 2) {
            const k = opts.stringtable[dense.keys_vals[tagsOffset]];
            const v = opts.stringtable[dense.keys_vals[tagsOffset + 1]];
            tags[k] = v;
        }
        // Skip the 0
        tagsOffset += 1;

        const node = {
            type: 'node',
            id,
            lat: opts.lat_offset + opts.granularity * lat,
            lon: opts.lon_offset + opts.granularity * lon,
            tags
        };


        let dInfo = dense.denseinfo;
        if (dInfo) {
            timestamp += dInfo.timestamp[offset];
            changeset += dInfo.changeset[offset];
            uid += dInfo.uid[offset];
            user_sid += dInfo.user_sid[offset];
            node.info = {
                version: dInfo.version[offset],
                timestamp: opts.date_granularity * timestamp,
                changeset,
                uid,
                user: opts.stringtable[user_sid]
            };
            if (opts.HistoricalInformation && dInfo.hasOwnProperty('visible')) {
                node.info.visible = dInfo.visible[offset];
            }
        }

        results.push(node);
    }
}

function parseWay(data, opts, results) {
    const tags = {};
    for(let i = 0; i < data.keys.length && i < data.vals.length; i++) {
        const k = opts.stringtable[data.keys[i]];
        const v = opts.stringtable[data.vals[i]];
        tags[k] = v;
    }

    let ref = 0;
    const refs = data.refs.map(function(ref1) {
        ref += ref1;
        return ref;
    });

    const way = {
        type: 'way',
        id: data.id,
        tags,
        refs
    };

    if (data.info) {
        way.info = parseInfo(data.info, opts);
    }

    results.push(way);
}

function parseRelation(data, opts, results) {
    const tags = {};
    for(let i = 0; i < data.keys.length && i < data.vals.length; i++) {
        const k = opts.stringtable[data.keys[i]];
        const v = opts.stringtable[data.vals[i]];
        tags[k] = v;
    }

    let id = 0;
    const members = [];
    for(let i = 0; i < data.roles_sid.length && i < data.memids.length && i < data.types.length; i++) {
        id += data.memids[i];
        let typeStr;
        switch(data.types[i]) {
        case 0:
            typeStr = 'node';
            break;
        case 1:
            typeStr = 'way';
            break;
        case 2:
            typeStr = 'relation';
            break;
        default:
            typeStr = '?';
        }

        members.push({
            type: typeStr,
            id,
            role: opts.stringtable[data.roles_sid[i]]
        });
    }

    const relation = {
        type: 'relation',
        id: data.id,
        tags,
        members
    };
    if (data.info) {
        relation.info = parseInfo(data.info, opts);
    }

    results.push(relation);
}

function parseInfo(dInfo, opts) {
    const info = {
        version: dInfo.version,
        timestamp: opts.date_granularity * dInfo.timestamp,
        changeset: dInfo.changeset,
        uid: dInfo.uid,
        user: opts.stringtable[dInfo.user_sid]
    };
    if (opts.HistoricalInformation && dInfo.hasOwnProperty('visible')) {
        info.visible = dInfo.visible;
    }
    return info;
}
