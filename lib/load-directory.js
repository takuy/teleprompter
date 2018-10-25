'use strict';

var fs = require('fs');
var path = require('path');
var config = JSON.parse(fs.readFileSync("data/config.json"));
var allowed_ext = config["allowed_ext"];

process.on('unhandledRejection', (reason, p) => { throw reason });

function createLoadDirectory(resolvePath) {
	if (typeof resolvePath !== 'function') {
		throw new TypeError('createLoadDirectory requires a function.');
	}

	return loadDirectory;

	// Returns a Promise to be resolved with an Array of names.
	function loadDirectory() {
		return resolvePath()
			.then(function (dirname) {

				return new Promise((resolve, reject) => {
					fs.readdir(dirname, (err, files) => {
						if (err) {
							return reject(err);
						}
						return resolve(files);
					});
				})
			})
			.then(function (files) {
				files = files
					.filter(function(filename) {
						return (allowed_ext.indexOf(path.extname(filename)) > -1);
					})
					.map(function (filename) {
						return filename.slice(0, -path.extname(filename).length);
					})
					.sort()
					.filter(function (filename, index, arr) {
						return arr[index - 1] !== filename;
					});

				return files;
			});
	}
}

module.exports = createLoadDirectory;
