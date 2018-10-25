'use strict';

var fs = require('fs');
var path = require('path');
var config = JSON.parse(fs.readFileSync("data/config.json"));
var allowed_ext = config["allowed_ext"];

process.on('unhandledRejection', (reason, p) => { throw reason });

function createResolver(dirname) {
	resolvePath.dirname = path.resolve(process.cwd(), dirname || '');

	return resolvePath;

	// Returns the a Promise to be resolved with the proper filepath to use for
	// the named script file.
	function resolvePath(name) {
		var basename = path.join(resolvePath.dirname, name || '');

		if (!name) {
			return new Promise((resolve, reject) => {
				fs.stat(basename, (err, stats) => {
					if (err) {
						return reject(err);
					}
					return resolve(stats);
				});
			}).then(function () {
				return basename;
			});
		}

		// Try each file extension, returning a ReadStream for the first to succeed.
		// The order of the extensions, then, is the order of priority if multiple
		// such files exist.
		return allowed_ext
			.reduce(function (prev, ext) {
				return prev.catch(function () {
					return new Promise((resolve, reject) => {
						fs.stat(basename + ext, (err, stats) => {
							if (err) {
								return reject(err);
							}
							return resolve(stats);
						});
					}).then(function () {
						return basename + ext;
					});
				});
			}, Promise.reject('Failed to read files.'));
	}
}

module.exports = createResolver;
