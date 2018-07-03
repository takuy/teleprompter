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
var output_file = path.resolve("c:/", "studio_scripts");

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

  router.get('/:script/events', function (req, res, next) {
    if (!EventSource.isEventSource(req)) {
      res.writeHead(400);
      res.end();
      return;
    }
    
    var source = new EventSource(req, res);
    var bus = buses[req.params.script] || (buses[req.params.script] = createBus());
    var watcher;

    fs.readFile(output_file+'/speed.txt', 'utf-8' ,function(err, buf) {
      var contents = buf.toString();
      var arr = contents.split(";");
      source.send(JSON.stringify({speed: arr[0], ospeed: arr[1], unique: 0}), {event: 'speed'});
    });

    function onEvent(event) {
      source.send(JSON.stringify(event), { event: event.type });
    }

    bus.addListener(onEvent);

    source.on('close', function () {
      bus.removeListener(onEvent);
      watcher && watcher.close();
    });

    resolvePath(req.params.script)
      .then(function (filename) {
        watcher = fs.watch(filename);

        watcher.on('change', function () {
          onEvent({
            type: 'content'
          });
        });
      })
  });

  router.post('/:script/events', bodyParser.json(), function (req, res, next) {
    var event = req.body;
      if(event.type == "speed") {
        fs.writeFile(output_file+'/speed.txt', event.speed+";"+event.ospeed, function(err, data){
          if (err) console.log(err);
          console.log("Speed successfully written to file. " + event.speed + " " + event.ospeed);
        });
      } 

    var bus = buses[req.params.script] || (buses[req.params.script] = createBus());

    bus.emit(req.body.type, req.body);

    res.end();
  });

  return router;
}

module.exports = createRouter;
