const Pbf = require('pbf');
const { osm: { HeaderBlock, PrimitiveBlock} } = require('./parsers.js');
const { Transform } = require('stream');

class PrimitivesParser extends Transform {
    constructor() {
        super({ objectMode: true, highWaterMark: 1 });
    }

    _transform(chunk, enc, cb) {
        if (chunk.type === 'OSMHeader') {
            const osmheader = HeaderBlock.read(new Pbf(chunk.data));
            this._HistoricaInformation = osmheader.required_features.includes('HistoricalInformation');
        } else if (chunk.type === 'OSMData') {
            parseChunk(chunk, this._HistoricaInformation, this);
        }

        cb();
    }
}

module.exports = PrimitivesParser;

const NANO = 1e-9;

function parseChunk(chunk, HistoricalInformation, stream) {
    const block = PrimitiveBlock.read(new Pbf(chunk.data));
    const opts = {
        stringtable: decodeStringtable(block.stringtable.s),
        granularity: NANO * block.granularity,
        lat_offset: NANO * block.lat_offset,
        lon_offset: NANO * block.lon_offset,
        date_granularity: block.date_granularity,
        HistoricalInformation,
        stream
    };

    for (const group of block.primitivegroup) {
        parseGroup(group, opts);
    }
}

function parseGroup({ dense, ways, relations, nodes, changesets }, opts) {
    if (dense) {
        parseDenseNodes(dense, opts);
    }
    for (const way of ways) {
        parseWay(way, opts);
    }
    for (const relation of relations) {
        parseRelation(relation, opts);
    }
    if (nodes && nodes.length > 0) {
        console.warn(`${nodes.length} unimplemented nodes`);
    }
    if (changesets && changesets.length > 0) {
        console.warn(`${changesets.length} unimplemented changesets`);
    }
}

function decodeStringtable (bufs) {
    return bufs.map(buf => buf.toString('utf8'));
}

function parseDenseNodes(dense, opts) {
    const {
        stream,
        stringtable,
        granularity,
        lat_offset,
        lon_offset,
        date_granularity,
        HistoricalInformation
    } = opts;

    let id = 0;
    let lat = 0;
    let lon = 0;

    let timestamp = 0;
    let changeset = 0;
    let uid = 0;
    let user_sid = 0;

    let tagsOffset = 0;

    const { keys_vals, denseinfo } = dense;

    for(let offset = 0; offset < dense.id.length; offset++) {

        id += dense.id[offset];
        lat += dense.lat[offset];
        lon += dense.lon[offset];

        const tags = {};
        while(tagsOffset < dense.keys_vals.length - 1 && dense.keys_vals[tagsOffset] !== 0) {
            const k = stringtable[keys_vals[tagsOffset++]];
            const v = stringtable[keys_vals[tagsOffset++]];
            tags[k] = v;
        }
        // Skip the 0
        tagsOffset += 1;

        const node = {
            type: 'node',
            id,
            lat: lat_offset + granularity * lat,
            lon: lon_offset + granularity * lon,
            tags
        };

        if (denseinfo) {
            node.info = parseInfo(denseinfo, offset);
        }

        stream.push(node);
    }

    function parseInfo(dInfo, offset) {
        timestamp += dInfo.timestamp[offset];
        changeset += dInfo.changeset[offset];
        uid += dInfo.uid[offset];
        user_sid += dInfo.user_sid[offset];

        let info = {
            version: dInfo.version[offset],
            timestamp: date_granularity * timestamp,
            changeset,
            uid,
            user: stringtable[user_sid]
        };

        if (HistoricalInformation && dInfo.hasOwnProperty('visible')) {
            info.visible = dInfo.visible[offset];
        }

        return info;
    }
}

function parseWay({ keys, vals, id, info, refs }, opts) {
    const { stream, stringtable } = opts;

    const len = Math.min(keys.length, vals.length);
    const tags = {};
    for(let i = 0; i < len; i++) {
        const k = stringtable[keys[i]];
        const v = stringtable[vals[i]];
        tags[k] = v;
    }

    let ref = 0;

    const way = {
        type: 'way',
        id,
        tags,
        refs: refs.map(r => ref += r)
    };

    if (info) {
        way.info = parseInfo(info, opts);
    }

    stream.push(way);
}

const RELATION_TYPES = [
    'node',
    'way',
    'relation'
];

function parseRelation(data, opts) {
    const tags = {};
    for(let i = 0; i < data.keys.length && i < data.vals.length; i++) {
        const k = opts.stringtable[data.keys[i]];
        const v = opts.stringtable[data.vals[i]];
        tags[k] = v;
    }

    const { roles_sid, types, memids } = data;
    const len = Math.min(roles_sid.length, Math.min(memids.length, types.length));
    const members = new Array(len);

    let id = 0;
    for(let i = 0; i < len; i++) {
        id += memids[i];
        members[i] = {
            id,
            type: RELATION_TYPES[types[i]] || '?',
            role: opts.stringtable[roles_sid[i]]
        };
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

    opts.stream.push(relation);
}

function parseInfo(dInfo, { date_granularity, stringtable, HistoricalInformation }) {
    const info = {
        version: dInfo.version,
        timestamp: date_granularity * dInfo.timestamp,
        changeset: dInfo.changeset,
        uid: dInfo.uid,
        user: stringtable[dInfo.user_sid]
    };
    if (HistoricalInformation && dInfo.hasOwnProperty('visible')) {
        info.visible = dInfo.visible;
    }
    return info;
}
