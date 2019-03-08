const Pbf = require('pbf');
const { osm: { HeaderBlock, PrimitiveBlock} } = require('./parsers.js');
const { Duplex } = require('stream');


class PrimitivesParser extends Duplex {
    constructor({ highWaterMark = 1000 } = {}) {
        super({
            readableObjectMode: true,
            readableHighWaterMark: 1,
            writableObjectMode: true,
            writableHighWaterMark: highWaterMark
        });

        // When the writable side finishes, then flush out anything remaining.
        this.on('prefinish', this._flushState);
    }

    _flushState() {
        if (this._state) {
            const { generator } = this._state;
            this._state = undefined;

            // TODO: improve backpressure handling
            for (const node of generator) {
                this.push(node);
            }
        }
        this.push(null);
    }

    _pushState() {
        if (!this._readPending) {
            return;
        }
        if (!this._state) {
            return;
        }

        const { generator, cb } = this._state;
        this._state = undefined;

        // TODO: improve backpressure handling
        for (const node of generator) {
            this.push(node);
        }

        this._readPending = false;
        cb();
    }

    _write(chunk, encoding, cb) {
        if (chunk.type === 'OSMHeader') {
            const osmheader = HeaderBlock.read(new Pbf(chunk.data));
            this._HistoricaInformation = osmheader.required_features.includes('HistoricalInformation');
            cb();
        } else if (chunk.type === 'OSMData') {
            this._state = {
                generator: parseChunk(chunk, this._HistoricaInformation),
                cb
            };
            this._pushState();
        }
    }

    _read(/* size */) {
        this._readPending = true;
        this._pushState();
    }
}

module.exports = PrimitivesParser;

const NANO = 1e-9;

function *parseChunk(chunk, HistoricalInformation) {
    const block = PrimitiveBlock.read(new Pbf(chunk.data));
    const opts = {
        stringtable: decodeStringtable(block.stringtable.s),
        granularity: NANO * block.granularity,
        lat_offset: NANO * block.lat_offset,
        lon_offset: NANO * block.lon_offset,
        date_granularity: block.date_granularity,
        HistoricalInformation
    };

    for (const group of block.primitivegroup) {
        yield *parseGroup(group, opts);
    }
}

function *parseGroup({ dense, ways, relations, nodes, changesets }, opts) {
    if (dense) {
        yield *parseDenseNodes(dense, opts);
    }
    for (const way of ways) {
        yield parseWay(way, opts);
    }
    for (const relation of relations) {
        yield parseRelation(relation, opts);
    }
    if (nodes && nodes.length > 0) {
        console.warn(`${nodes.length} unimplemented nodes`);
    }
    if (changesets && changesets.length > 0) {
        console.warn(`${changesets.length} unimplemented changesets`);
    }
}

function decodeStringtable (bufs) {
    return bufs.map(buf => {
        if (!Buffer.isBuffer(buf)) throw "no buffer";
        return buf.toString('utf8');
    });
}

function *parseDenseNodes(dense, opts) {
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

        yield node;
    }
}

function parseWay(data, opts) {
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

    return way;
}

function parseRelation(data, opts) {
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

    return relation;
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
