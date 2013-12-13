'use strict'

var restify = require('restify')
  , Respectify = require('./index')
  , assert = require('assert')
  , request = require('supertest')
  , toString = Object.prototype.toString

describe('Respectify Unit Tests', function() {
  var server = restify.createServer()
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

  function queryString(obj) {
    var q = []
    if (!Object.keys(obj).length) {
      return ''
    }
    for (var prop in obj) {
      q.push(prop + '=' + obj[prop])
    }
    return '?' + q.join('&')
  }

  server.get({path: '/', version: '1.0.0', flags: 'i', params: {

  }}, ok)

  server.get({path: '/', version: '2.0.0', flags: 'i', params: {

  }}, ok)

  server.get({path: '/strings', version: '1.0.0', flags: 'i', params: {
    foo: 'String'
  , bar: ['string', 'STRING', 'string']
  , baz: {
      dataTypes: ['STRING']
    , default: 'baz'
    }
  }}, ok)

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
    }
  , four: {
      dataTypes: ['NUMBER']
    , default: 100
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


  describe('API', function() {
    it('#factory', function() {
      var inst = Respectify.factory(server)
      assert(inst instanceof Respectify)
    })

    it('#loadSpecs', function() {
      var len = 0
      for (var prop in server.router.routes) {
        len += server.router.routes[prop].length
      }
      var inst = new Respectify(server)
      var specs = inst.loadSpecs()
      assert.strictEqual(specs.length, len)
    })

    it('#loadSpecs(version)', function() {
      var inst = new Respectify(server)
      var specs = inst.loadSpecs('1.0.0')
      assert.strictEqual(specs.length, 6)

      var specs2 = inst.loadSpecs('2.0.0')
      assert.strictEqual(specs2.length, 2)

      assert.notDeepEqual(specs, specs2)
    })

    it('#findRoutes', function() {
      var inst = new Respectify(server)
      var routes = inst.findRoutes('/')
      assert.strictEqual(routes.length, 2)
    })

    it('#findRoutes(version)', function() {
      var inst = new Respectify(server)
      var routes = inst.findRoutes('/', '1.0.0')
      assert.strictEqual(routes.length, 1)
    })

    it('#getDefaults', function() {
      var inst = new Respectify(server)
      var defaults = inst.getDefaults('/strings', '2.0.0')
      assert.deepEqual(defaults, {
        monkey: 'baz'
      })

      var defaults = inst.getDefaults('/objects', '1.0.0')
      assert.deepEqual(defaults, {
        two: {def: 'ault'}
      })
      defaults.two.foo = 'foo'

      // Ensure that we did not alter the route definition
      var defaults = inst.getDefaults('/objects', '1.0.0')
      assert.deepEqual(defaults, {
        two: {def: 'ault'}
      })
    })
  })

  describe('Routing', function() {

    describe('General', function() {
      it('filters', function(done) {
        var qs = queryString({
          one: 1
        , a: {hi: 'there'}
        , b: 3
        , c: '4'
        })
        request(server)
          .get('/' + qs)
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, {})
            done(err)
          })
      })
    })

    describe('String', function() {
      it('empty', function(done) {
        request(server)
          .get('/')
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, {})
            done(err)
          })
      })

      it('valid', function(done) {
        var obj = {
          foo: 'one'
        , bar: '2'
        , baz: 'three'
        , noSuchParam: 2020 // should be filtered out
        }
        var qs = queryString(obj)
        request(server)
          .get('/strings' + qs)
          .set('x-api-version', '1.0.0')
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, {
              foo: 'one'
            , bar: '2'
            , baz: 'three'
            })
            done(err)
          })
      })

      it('defaults', function(done) {
        var qs = queryString({
        })
        request(server)
          .get('/strings' + qs)
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, {
              monkey: 'baz'
            })
            done(err)
          })
      })

      it('invalid', function(done) {
        var qs = queryString({
          foo: 1
        , bar: '{"a": "b"}'
        , baz: true
        })
        request(server)
          .get('/strings' + qs)
          .set('x-api-version', '1.0.0')
          .expect(200, function(err, res) {
            done()
          })
      })
    })

    describe('Numbers', function() {
      it('valid', function(done) {
        var obj = {
          one: 1
        , two: 2
        , three: 3
        , four: 4
        }
        var qs = queryString(obj)
        request(server)
          .get('/numbers' + qs)
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, obj)
            done(err)
          })
      })

      it('defaults', function(done) {
        var obj = {}
        var qs = queryString(obj)
        request(server)
          .get('/numbers' + qs)
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, {
              four: 100
            })
            done(err)
          })
      })

      it('invalid', function(done) {
        var obj = {
          one: 1
        , two: 'two'
        , three: 3
        , four: 4
        }
        var qs = queryString(obj)
        request(server)
          .get('/numbers' + qs)
          .expect(409, function(err, res) {
            assert.strictEqual(res.body.code, 'InvalidArgument')
            done(err)
          })
      })
    })

    describe('Dates', function() {
      it('valid', function(done) {
        var obj = {
          one: '02-20-2012'
        , two: 1329696000000
        , three: 1329696000
        , four: '2012-02-20 00:00'
        , five: '02/20/2012 00:00:00 UTC'
        }
        var qs = queryString(obj)
        request(server)
          .get('/dates' + qs)
          .expect(200, function(err, res) {
            for (var prop in res.body) {
              assert.strictEqual(res.body[prop], '2012-02-20T00:00:00.000Z')
            }
            done(err)
          })
      })

      it('defaults', function(done) {
        var obj = {}
        var qs = queryString(obj)
        request(server)
          .get('/dates' + qs)
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, {
              two: '02/20/2012 00:00:00 UTC'
            })
            done(err)
          })
      })

      it('invalid', function(done) {
        var obj = {
          one: 1
        }
        var qs = queryString(obj)
        request(server)
          .get('/dates' + qs)
          .expect(409, function(err, res) {
            assert.strictEqual(res.body.code, 'InvalidArgument')
            done(err)
          })
      })
    })

    describe('Objects', function() {
      it('valid', function(done) {
        var obj = {
          one: '{"moo": "cow"}'
        , two: JSON.stringify({foo: 'bar'})
        }
        var qs = queryString(obj)
        request(server)
          .get('/objects' + qs)
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, {
              one: {moo: 'cow'}
            , two: {foo: 'bar'}
            })
            done(err)
          })
      })

      it('defaults', function(done) {
        var obj = {}
        var qs = queryString(obj)
        request(server)
          .get('/objects' + qs)
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, {
              two: {def: 'ault'}
            })
            done(err)
          })
      })

      it('invalid', function(done) {
        var obj = {
          one: 123
        }
        var qs = queryString(obj)
        request(server)
          .get('/objects' + qs)
          .expect(409, function(err, res) {
            assert.strictEqual(res.body.code, 'InvalidArgument')
            done(err)
          })
      })

      it('invalid', function(done) {
        var obj = {
          one: "{one: 2}"
        }
        var qs = queryString(obj)
        request(server)
          .get('/objects' + qs)
          .expect(409, function(err, res) {
            assert.strictEqual(res.body.code, 'InvalidArgument')
            done(err)
          })
      })
    })

    describe('Arrays', function() {
      it('valid', function(done) {
        var obj = {
          one: 'one,two,three'
        , two: ['one', 'two', 'three']
        , three: 'one'
        , four: JSON.stringify(['one', 'two', 'three'])
        }
        var qs = queryString(obj)
        request(server)
          .get('/arrays' + qs)
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, {
              one: ['one', 'two', 'three']
            , two: ['one', 'two', 'three']
            , three: ['one']
            , four: ['one', 'two', 'three']
            })
            done(err)
          })
      })

      it('defaults', function(done) {
        var obj = {}
        var qs = queryString(obj)
        request(server)
          .get('/arrays' + qs)
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, {
              three: [1, 2, 3]
            })
            done(err)
          })
      })

      it('invalid', function(done) {
        var obj = {
          one: "[a, 4]"
        }
        var qs = queryString(obj)
        request(server)
          .get('/arrays' + qs)
          .expect(409, function(err, res) {
            assert.strictEqual(res.body.code, 'InvalidArgument')
            done(err)
          })
      })
    })
  })
})
