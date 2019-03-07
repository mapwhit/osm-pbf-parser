const parsers = require('./parsers.js');
const { Transform } = require('readable-stream');

class BlobEncoder extends Transform {
    constructor() {
        super({ objectMode: true, highWaterMark: 1 });
    }

    _transform(blob, enc, next) {
        const blobMessage = parsers.file.Blob.encode({
            zlib_data: blob.zlib_data
        });
        const blobHeader = parsers.file.BlobHeader.encode({
            type: blob.type,
            datasize: blobMessage.length
        });
        const sizeBuf = new Buffer(4);
        sizeBuf.writeUInt32BE(blobHeader.length, 0);
        this.push(sizeBuf);
        this.push(blobHeader);
        this.push(blobMessage);

        next();
    }
}

module.exports = BlobEncoder;
