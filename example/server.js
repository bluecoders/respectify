
var assert = require('assert')
  , restify = require('restify')
  , Respectify = require('../index')
  , server = restify.createServer()
  , respect = new Respectify(server)

server.use(restify.queryParser())
server.use(respect.middleware)

function ok(req, res, next) {
  // Undefined params should always be filtered out
  for (var prop in req.params) {
    assert.notEqual(typeof req.params[prop], 'undefined')
  }
  res.send(req.params)
}

server.get({path: '/', version: '1.0.0', flags: 'i', params: {

}}, ok)

server.get({path: '/', version: '2.0.0', flags: 'i', params: {

}}, ok)

server.get({
  path: '/strings'
, version: '1.0.0'
, flags: 'i'
, description: 'This route is for getting all strings'
, params: {
    foo: 'String'
  , bar: ['string', 'STRING', 'string']
  , baz: {
      dataTypes: ['STRING']
    , default: 'baz'
    , description: 'Baz that string up'
    }
  }
}, ok)

server.get({path: '/strings', version: '2.0.0', flags: 'i', params: {
  cat: 'String'
, dog: ['string']
, monkey: {
    dataTypes: ['STRING']
  , default: 'baz'
  }
}}, ok)

server.get({path: '/numbers', version: '1.0.0', flags: 'i', params: {
  one: 'number'
, two: ['NumBer']
, three: {
    dataTypes: ['number', 'Number']
  , default: 0
  , max: 200
  }
, four: {
    dataTypes: ['NUMBER']
  , default: function() { return 100 }
  , min: -10
  }
, five: {
    dataTypes: 'number'
  , min: 0
  , max: 100
  }
}}, ok)

server.get({path: '/arrays', version: '1.0.0', flags: 'i', params: {
  one: 'array'
, two: ['array']
, three: {
    dataTypes: ['array']
  , default: [1,2,3]
  }
, four: ['array']
}}, ok)

server.get({path: '/objects', version: '1.0.0', flags: 'i', params: {
  one: 'object'
, two: {
    dataTypes: ['object']
  , default: {def: 'ault'}
  }
}}, ok)

server.get({path: '/dates', version: '1.0.0', flags: 'i', params: {
  one: 'date'
, two: {
    dataTypes: ['date']
  , default: '02/20/2012 00:00:00 UTC'
  }
, three: 'date'
, four: 'date'
, five: 'date'
}}, ok)

module.exports.server = server
module.exports.respect = respect

