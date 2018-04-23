'use strict';

const _ = require('underscore')
  , fs = require('fs')
  , fpath = __dirname + '/spec.tmpl.md'
  , template = fs.readFileSync(fpath, 'utf-8')
  , example = require('./server')
  , server = example.server
  , respect = example.respect

const docs = _.template(template, {
  specs: respect.loadSpecs()
})

fs.writeFileSync(__dirname + '/spec.md', docs)

process.exit(0)
