'use strict';

var fs = require('fs');
var Readable = require('stream').Readable
var Transform = require('stream').Transform
var path = require('path');
var marked = require('marked');
var iconv = require('iconv-lite');
var mammoth = require('mammoth');
var jschardet = require("jschardet");

process.on('unhandledRejection', (reason, p) => { throw reason });

function createLoadFile(resolvePath) {
	if (typeof resolvePath !== 'function') {
		throw new TypeError('createLoadFile requires a function.');
	}

	return loadFile;

	async function docConvert(filename) {
		var html = (await mammoth.convertToHtml({ path: filename })).value;
		var htmlStream = new Readable();
		htmlStream.push(html);
		htmlStream.push(null);
		return htmlStream;
	}
	// Returns a Promise to be resolved with an fs.ReadStream of the named file's
	// rendered contents.
	function loadFile(name) {
		return resolvePath(name)
			.then(function (filename) {
				/* to add docx functionality, we need check if the file is first a docx. 
					Can't be read like a file stream since it's not really plaintext like the other formats.
				*/
				if (path.extname(filename) == ".docx") {
					return docConvert(filename);
				} else {
					return fs.createReadStream(filename);
				}
			})
			// To handle parts of the Markdown syntax (such as [][] links) properly
			// requires knowledge of the file beyond the current chunk. Therefore a
			// lot of parsers like Marked require the _entire_ body be know. We
			// maintain a streaming interface to capitalize on improvements in this
			// department down the road, but for now we need to briefly buffer the
			// input stream before parsing for output.
			.then(function (stream) {
				var buffer = [];
				var parser = new Transform({
					transform(chunk, encoding, callback) {
						var enc = jschardet.detect(chunk);

						// text files by default save in this encoding... doing this just in case, as it's common in my workplace. 
						if (enc.encoding == 'windows-1252') {
							chunk = iconv.decode(chunk, 'win1252');
						}
						buffer.push(chunk);
						callback();
					}, flush(callback) {
						this.push("<input type='hidden' id='file' value='" + name + "' >");
						this.push(
							marked(buffer.join(''))
						);
						this.push(null);
						callback();
					}
				});
				stream.pipe(parser);

				return parser;
			});
	}
}

module.exports = createLoadFile;