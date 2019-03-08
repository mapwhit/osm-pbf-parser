const parsers = require('./parsers.js');
const { Transform } = require('stream');

const SIZE = 0;
const HEADER = 1;
const BLOB = 2;

class BlobParser extends Transform {
    constructor() {
        super();
        this._readableState.objectMode = true;
        this._readableState.highWaterMark = 1;
        this._writableState.objectMode = false;
        this._writableState.highWaterMark = 0;
        this._mode = SIZE;
        this._waiting = 4;
        this._prev = null;
        this._header = null;
        this._blob = null;
        this._offset = 0;
        this._sizeOffset = null;
    }

    _transform(buf, enc, next) {
        let nbuf;

        if (this._prev) {
            buf = Buffer.concat([ this._prev, buf ]);
            this._prev = null;
        }
        // console.log("blob", this._writableState.buffer.length, "+", this._readableState.buffer.length, buf.length, this._mode, this._waiting);
        if (buf.length < this._waiting) {
            this._prev = buf;
            return next();
        }

        if (this._mode === SIZE) {
            this._sizeOffset = this._offset;
            const len = buf.readUInt32BE(0);
            this._mode = HEADER;
            this._offset += this._waiting;
            this._waiting = len;
            this._transform(buf.slice(4), enc, next);
        }
        else if (this._mode === HEADER) {
            this._header = parsers.file.BlobHeader.decode(buf.slice(0, this._waiting));
            this._mode = BLOB;
            nbuf = buf.slice(this._waiting);
            this._offset += this._waiting;
            this._waiting = this._header.datasize;
            this._transform(nbuf, enc, next);
        }
        else if (this._mode === BLOB) {
            this._blob = parsers.file.Blob.decode(buf.slice(0, this._waiting));

            const h = this._header;

            this._mode = SIZE;
            nbuf = buf.slice(this._waiting);
            this._offset += this._waiting;
            this._waiting = 4;

            if (!this._blob.zlib_data) {
                throw "No zlib data, possibly unimplemented raw/lzma/bz2 data";
            }
            this.push({
                type: h.type,
                offset: this._sizeOffset,
                zlib_data: this._blob.zlib_data
            });

            this._transform(nbuf, enc, next);
        }
    }
}

module.exports = BlobParser;
