'use strict';

var restify = require('restify')
  , fs = require('fs')
  , Respectify = require('./index')
  , assert = require('assert')
  , request = require('supertest')
  , toString = Object.prototype.toString

describe('Respectify Unit Tests', function() {
  var example = require('./example/server')
    , server = example.server
    , respect = example.respect

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

  describe('API', function() {
    it('#factory()', function() {
      var inst = Respectify.factory(server)
      assert(inst instanceof Respectify)
    })

    it('#getVersions()', function() {
      var inst = new Respectify(server)
      var versions = inst.getVersions()
      assert.strictEqual(versions[0], '2.0.0')
      assert.strictEqual(versions[1], '1.0.0')
    })

    it('#loadSpecs()', function() {
      var len = 0
      for (var prop in server.router.routes) {
        len += server.router.routes[prop].length
      }
      var inst = new Respectify(server)
      var specs = inst.loadSpecs()
      fs.writeFileSync(__dirname + '/example/spec.json', JSON.stringify(specs, null, 2))
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

    it('#findRoutes()', function() {
      var inst = new Respectify(server)
      var routes = inst.findRoutes('/')
      assert.strictEqual(routes.length, 2)
    })

    it('#findRoutes(version)', function() {
      var inst = new Respectify(server)
      var routes = inst.findRoutes('/', '1.0.0')
      assert.strictEqual(routes.length, 1)
    })

    it('#getDefaults()', function() {
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
        , four: -10
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
              three: 0
            , four: 100
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

      it('min', function(done) {
        var obj = {
          four: -11
        }
        var qs = queryString(obj)
        request(server)
          .get('/numbers' + qs)
          .expect(409, function(err, res) {
            assert.strictEqual(res.body.code, 'InvalidArgument')
            var msg = 'Invalid param `four`, value must be higher than `-10`, received `-11`'
            assert.strictEqual(res.body.message, msg)
            done(err)
          })
      })

      it('max', function(done) {
        var obj = {
          three: 201
        }
        var qs = queryString(obj)
        request(server)
          .get('/numbers' + qs)
          .expect(409, function(err, res) {
            assert.strictEqual(res.body.code, 'InvalidArgument')
            var msg = 'Invalid param `three`, value must be lower than `200`, received `201`'
            assert.strictEqual(res.body.message, msg)
            done(err)
          })
      })

      it('min & max', function(done) {
        var obj = {
          five: 101
        }
        var qs = queryString(obj)
        request(server)
          .get('/numbers' + qs)
          .expect(409, function(err, res) {
            assert.strictEqual(res.body.code, 'InvalidArgument')
            var msg = 'Invalid param `five`, value must be lower than `100`, received `101`'
            assert.strictEqual(res.body.message, msg)
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
