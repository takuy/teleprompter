'use strict';

var fs = require('fs');
var path = require('path');
var bodyParser = require('body-parser');
var dot = require('dot');
var ecstatic = require('ecstatic');
var Router = require('router');
var EventSource = require('faye-websocket').EventSource;
var createBus = require('./bus');
var createLoadFile = require('./load-file');
var createLoadDirectory = require('./load-directory');
var pkg = require('../package.json');
var WWW_ROOT = path.resolve(__dirname, '..', 'www');
var VENDOR_ROOT = path.resolve(__dirname, '..', 'vendor');
var compileDashboard = dot.template(fs.readFileSync(path.join(WWW_ROOT, 'dashboard.html'), 'utf8'));
var config = JSON.parse(fs.readFileSync("data/config.json"));
var output_file = config["data_file"];

function createRouter(resolvePath) {
	var loadFile = createLoadFile(resolvePath);
	var loadDirectory = createLoadDirectory(resolvePath);
	var router = new Router();
	var buses = {};

	router.use(function (req, res, next) {
		if (req.url.length > 1 && req.url.slice(-1) === '/') {
			res.writeHead(301, {
				'Location': req.url.slice(0, -1)
			});
			res.end();
			return;
		}

		next();
	});

	router.use('/www', ecstatic({ root: WWW_ROOT }));
	router.use('/vendor', ecstatic({ root: VENDOR_ROOT }));

	router.get('/', function (req, res, next) {
		loadDirectory()
			.then(function (files) {
				files.push("auto");
				res.writeHead(200, {
					'Content-Type': 'text/html'
				});

				res.end(compileDashboard({
					files: files,
					version: pkg.version
				}));
			})
			.catch(next);
	});

	router.get('/auto', function (req, res, next) {

		fs.stat(output_file, function (err, stat) {
			if (err == null) {
				fs.readFile(output_file, 'utf-8', function (err, buf) {
					var contents = buf.toString();
					var arr = JSON.parse(contents);
					var current_script = arr["file"];

					current_script = current_script.replace(/\.[^/.]+$/, "")

					loadFile(current_script)
						.then(function (content) {
							var header = fs.createReadStream(path.join(WWW_ROOT, 'view.html'));

							header.pipe(res, { end: false });
							header.on('end', function () {
								content.pipe(res);
							});
						})
						.catch(next);
				});
			}
		});
	});

	router.get('/:script', function (req, res, next) {
		loadFile(req.params.script)
			.then(function (content) {
				var header = fs.createReadStream(path.join(WWW_ROOT, 'view.html'));

				header.pipe(res, { end: false });
				header.on('end', function () {
					content.pipe(res);
				});
			})
			.catch(next);
	});

	router.get('/:script/control', function (req, res, next) {
		fs.createReadStream(path.join(WWW_ROOT, 'control.html'))
			.pipe(res);
	});

	/* so I don't get confused every time I look at this code:
	This is called on when a CONTROL or VIEW are opened. ONLY */
	router.get('/:script/events', function (req, res, next) {
		if (!EventSource.isEventSource(req)) {
			res.writeHead(400);
			res.end();
			return;
		}

		var source = new EventSource(req, res);

		function onEvent(event) {
			source.send(JSON.stringify(event), { event: event.type });
		}

		var bus = buses[req.params.script] || (buses[req.params.script] = createBus());
		var watcher;

		fs.stat(output_file, function (err, stat) {
			if (err == null) {
				fs.readFile(output_file, 'utf-8', function (err, buf) {
					var contents = buf.toString();
					var arr = JSON.parse(contents);
					onEvent({ speed: arr["speed"], ospeed: arr["ospeed"], unique: 0, type: "speed" })
				});
			}
		});

		bus.addListener(onEvent);

		source.on('close', function () {
			bus.removeListener(onEvent);
			watcher && watcher.close();
		});
		if(req.params.script != "auto") {
			resolvePath(req.params.script)
				.then(function (filename) {
					watcher = fs.watch(filename);

					watcher.on('change', function () {
						onEvent({
							type: 'content'
						});
					});
				})
		} else {
			watcher = fs.watch(output_file);
			watcher.on('change', function () {
				var allowed_ext = config["allowed_ext"];
				var file_contents = JSON.parse(fs.readFileSync(output_file));
				if(file_contents["last_file"] != file_contents["file"] && allowed_ext.indexOf(path.extname(file_contents["file"])) > -1 ) {
					onEvent({
						type: 'content'
					});
				}
			});
		}
	});
	router.get('/:script/data', function (req, res, next) {

	});
	/* Call on sending info (script, OBS, teleprompter control) ONLY */
	router.post('/:script/events', bodyParser.json(), function (req, res, next) {
		var event = req.body;

		var buf = fs.readFileSync(output_file, 'utf-8')
		var contents = buf.toString();
		var arr = JSON.parse(contents);

		if (event.type == "speed") {
			arr["ospeed"] = event.ospeed;
			arr["speed"] = event.speed;
			fs.writeFile(output_file, JSON.stringify(arr), function (err, data) {
			});
		} else if (event.type == "play") {
			req.body = { speed: arr[ospeed], ospeed: arr[ospeed], unique: 1, type: "speed" }
		}

		var bus = buses[req.params.script] || (buses[req.params.script] = createBus());

		bus.emit(req.body.type, req.body);

		res.end();

	});

	return router;
}

module.exports = createRouter;
