const Pbf = require('pbf');
const { file: { Blob, BlobHeader } } = require('./parsers.js');
const { Transform } = require('stream');

class BlobParser extends Transform {
    constructor() {
        super();
        this._readableState.objectMode = true;
        this._readableState.highWaterMark = 1;
        this._writableState.objectMode = false;
        this._writableState.highWaterMark = 0;
        this._parseSize = parseSize.bind(this);
        this._parseHeader = parseHeader.bind(this);
        this._parseBlob = parseBlob.bind(this);
        this._parser = this._parseSize;
        this._waiting = 4;
        this._prev = null;
        this._header = null;
        this._blob = null;
        this._offset = 0;
        this._sizeOffset = null;
    }

    _transform(buf, enc, next) {
        if (this._prev) {
            buf = Buffer.concat([ this._prev, buf ]);
            this._prev = null;
        }
        // console.log("blob", this._writableState.buffer.length, "+", this._readableState.buffer.length, buf.length, this._mode, this._waiting);
        if (buf.length < this._waiting) {
            this._prev = buf;
            return next();
        }
        this._parser(buf, enc, next);
    }
}

function parseSize(buf, enc, next) {
    this._sizeOffset = this._offset;
    const len = buf.readUInt32BE(0);
    this._parser = this._parseHeader;
    this._offset += this._waiting;
    this._waiting = len;
    this._transform(buf.slice(4), enc, next);
}

function parseHeader(buf, enc, next) {
    this._header = BlobHeader.read(new Pbf(buf.slice(0, this._waiting)));
    this._parser = this._parseBlob;
    const nbuf = buf.slice(this._waiting);
    this._offset += this._waiting;
    this._waiting = this._header.datasize;
    this._transform(nbuf, enc, next);
}

function parseBlob(buf, enc, next) {
    this._blob = Blob.read(new Pbf(buf.slice(0, this._waiting)));


    this._parser = this._parseSize;
    const nbuf = buf.slice(this._waiting);
    this._offset += this._waiting;
    this._waiting = 4;

    if (!this._blob.zlib_data) {
        throw "No zlib data, possibly unimplemented raw/lzma/bz2 data";
    }

    this.push({
        type: this._header.type,
        offset: this._sizeOffset,
        zlib_data: this._blob.zlib_data,
        data: undefined
    });

    this._transform(nbuf, enc, next);
}

module.exports = BlobParser;
