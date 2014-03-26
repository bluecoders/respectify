'use strict';

var restify = require('restify')
  , fs = require('fs')
  , Respectify = require('./index')
  , assert = require('assert')
  , request = require('supertest')
  , toString = Object.prototype.toString
  , ase = assert.strictEqual

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

  function send(req, res, next) {
    var data = {
      query: req.query
    , params: req.params
    , body: req.body
    }
    res.send(data)
  }

  describe('API', function() {
    it('#factory()', function() {
      var inst = Respectify.factory(server)
      assert(inst instanceof Respectify)
    })

    it('#getVersions()', function() {
      var inst = new Respectify(server)
      var versions = inst.getVersions()
      ase(versions[0], '3.0.0')
      ase(versions[1], '2.0.0')
      ase(versions[2], '1.0.0')
    })

    it('#loadSpecs()', function() {
      var len = 0
      for (var prop in server.router.routes) {
        len += server.router.routes[prop].length
      }
      var inst = new Respectify(server)
      var specs = inst.loadSpecs()
      fs.writeFileSync(__dirname + '/example/spec.json', JSON.stringify(specs, null, 2))
      ase(specs.length, len)
    })

    it('#loadSpecs(version)', function() {
      var inst = new Respectify(server)
      var specs = inst.loadSpecs('1.0.0')
      ase(specs.length, 6)

      var specs2 = inst.loadSpecs('2.0.0')
      ase(specs2.length, 2)

      assert.notDeepEqual(specs, specs2)
    })

    it('#findSpecs(path, version)', function() {
      var inst = new Respectify(server)

      var spec = inst.findSpecs('/', '1.0.0')
      
      assert.deepEqual(spec,  {
        route: '/',
        parameters: [{
          name: 'foo',
          required: false,
          paramType: 'querystring',
          dataTypes: ['string'],
          default: 'bar'
        }],
        method: 'GET',
        versions: ['1.0.0']
      })
      var spec2 = inst.findSpecs('/strings', '*')
      
      assert.deepEqual(spec2,  {
        route: '/strings',
        parameters: [{
          name: 'foo',
          required: false,
          paramType: 'querystring',
          dataTypes: ['string']
        }, {
          name: 'bar',
          required: false,
          paramType: 'querystring',
          dataTypes: ['string']
        }, {
          name: 'baz',
          required: false,
          paramType: 'querystring',
          dataTypes: ['string'],
          description: 'Baz that string up',
          default: 'baz'
        }],
        method: 'GET',
        versions: ['3.0.0', '1.0.0'],
        description: 'This route is for getting all strings'
      })
    })

    it('#findRoutes()', function() {
      var inst = new Respectify(server)
      var routes = inst.findRoutes('/')
      ase(routes.length, 2)
    })

    it('#middleware()', function() {
      var inst = new Respectify(server)
      var middle = inst.middleware()
      ase(typeof middle, 'function')
    })

    it('#findRoutes(path, version)', function() {
      var inst = new Respectify(server)
      var routes = inst.findRoutes('/', '1.0.0')
      ase(routes.length, 1)
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
            ase(res.body.code, 'InvalidArgument')
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
            ase(res.body.code, 'InvalidArgument')
            var msg = 'Invalid param `four`, value must be higher than `-10`, received `-11`'
            ase(res.body.message, msg)
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
            ase(res.body.code, 'InvalidArgument')
            var msg = 'Invalid param `three`, value must be lower than `200`, received `201`'
            ase(res.body.message, msg)
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
            ase(res.body.code, 'InvalidArgument')
            var msg = 'Invalid param `five`, value must be lower than `100`, received `101`'
            ase(res.body.message, msg)
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
              ase(res.body[prop], '2012-02-20T00:00:00.000Z')
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
            ase(res.body.code, 'InvalidArgument')
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
            ase(res.body.code, 'InvalidArgument')
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
            ase(res.body.code, 'InvalidArgument')
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
            ase(res.body.code, 'InvalidArgument')
            done(err)
          })
      })
    })
  })

  describe('Parameter Mapping', function() {
    var params = {
      foo: {
        dataType: 'string'
      }
    , bar: {
        dataType: 'string'
      , default: 'baz'
      }
    , cat: {
        dataType: 'string'
      }
    }
    it('enabled', function(done) {
      var server = restify.createServer()
      var respect = new Respectify(server)
      server.use(restify.queryParser({ mapParams: false }))
      server.use(respect.middleware({ mapParams: true }))
      
      server.get({path: '/test', version: '1.0.0'
      , params: params
      }, send)

      request(server)
        .get('/test?bar=hello')
        .expect(200, function(err, res) {
          ase(err, null)
          ase(res.body.query.bar, 'hello')
          ase(res.body.params.bar, 'hello')
          done(err)
        })
    })

    it('disabled', function(done) {
      var server = restify.createServer()
      var respect = new Respectify(server)
      server.use(restify.queryParser({ mapParams: false }))
      server.use(respect.middleware({ mapParams: false }))
      
      server.get({path: '/test', version: '1.0.0'
      , params: params
      }, send)

      request(server)
        .get('/test?bar=hello')
        .expect(200, function(err, res) {
          ase(err, null)
          ase(res.body.query.bar, 'hello')
          ase(res.body.params.bar, undefined)
          done(err)
        })
      
    })
  })

  describe('Parameter Filtering', function() {
    var params = {
      foo: {
        dataType: 'string'
      }
    , bar: {
        dataType: 'string'
      , default: 'baz'
      }
    , cat: {
        dataType: 'string'
      }
    }
    it('enabled', function(done) {
      var server = restify.createServer()
      var respect = new Respectify(server)
      server.use(restify.queryParser({ mapParams: true }))
      server.use(respect.middleware({ filterParams: true }))
      
      server.get({path: '/test', version: '1.0.0'
      , params: params
      }, send)

      request(server)
        .get('/test?bar=hello&invalid=20')
        .expect(200, function(err, res) {
          ase(err, null)
          ase(res.body.query.bar, 'hello')
          ase(res.body.query.foo, undefined)
          ase(res.body.query.cat, undefined)
          ase(res.body.query.invalid, undefined)

          ase(res.body.params.bar, 'hello')
          ase(res.body.params.foo, undefined)
          ase(res.body.params.cat, undefined)
          ase(res.body.params.invalid, undefined)
          done(err)
        })
    })

    it('disabled', function(done) {
      var server = restify.createServer()
      var respect = new Respectify(server)
      server.use(restify.queryParser({ mapParams: true }))
      server.use(respect.middleware({ filterParams: false }))
      
      server.get({path: '/test', version: '1.0.0'
      , params: params
      }, send)

      request(server)
        .get('/test?bar=hello&invalid=20')
        .expect(200, function(err, res) {
          ase(err, null)
          ase(res.body.query.bar, 'hello')
          ase(res.body.query.invalid, '20')

          ase(res.body.params.bar, 'hello')
          ase(res.body.params.invalid, '20')
          done(err)
        })
      
    })
  })

  describe('Parameter Targeting', function() {
    var params = {
      foo: {
        dataType: 'string'
      }
    , bar: {
        dataType: 'string'
      , default: 'baz'
      }
    , cat: {
        dataType: 'string'
      }
    }

    it('params', function(done) {
      var server = restify.createServer()
      var respect = new Respectify(server)
      server.use(restify.queryParser({ mapParams: true }))
      server.use(respect.middleware())

      server.get({path: '/params/:cat', version: '1.0.0'
      , params: params
      , paramTarget: 'params'
      }, send)

      request(server)
        .get('/params/meow?foo=bar')
        .expect(200, function(err, res) {
          ase(err, null)
          ase(res.body.params.foo, 'bar')
          ase(res.body.params.bar, 'baz')
          ase(res.body.params.cat, 'meow')
          done(err)
        })
    })

    it('query', function(done) {
      var server = restify.createServer()
      var respect = new Respectify(server)
      server.use(restify.queryParser({ mapParams: false }))
      server.use(respect.middleware())

      server.get({path: '/query', version: '1.0.0'
      , params: params
      , paramTarget: 'query'
      }, send)

      request(server)
        .get('/query?foo=bar')
        .expect(200, function(err, res) {
          ase(err, null)
          ase(res.body.query.foo, 'bar')
          ase(res.body.query.bar, 'baz')
          done(err)
        })
    })

    it('body', function(done) {
      var server = restify.createServer()
      var respect = new Respectify(server)
      server.use(restify.bodyParser({ mapParams: false }))
      server.use(respect.middleware())

      server.post({path: '/body', version: '1.0.0'
      , params: params
      , paramTarget: 'body'
      }, send)

      request(server)
        .post('/body')
        .send({
          foo: 'bar'
        })
        .expect(200, function(err, res) {
          ase(err, null)
          ase(res.body.body.foo, 'bar')
          ase(res.body.body.bar, 'baz')
          done(err)
        })
    })

    it('all', function(done) {
      var server = restify.createServer()
      var respect = new Respectify(server)
      server.use(restify.queryParser())
      server.use(restify.bodyParser())
      server.use(respect.middleware())

      server.post({path: '/all', version: '1.0.0'
      , params: params
      }, send)

      request(server)
        .post('/all?bar=meow')
        .send({
          foo: 'bar'
        })
        .expect(200, function(err, res) {
          // Restify will not parse the body itself unless the bodyParser
          // is called with `mapParams: false`
          if (typeof res.body.body === 'string') {
            res.body.body = JSON.parse(res.body.body)
          }

          ase(res.body.body.foo, 'bar')
          ase(res.body.query.bar, 'meow')

          ase(res.body.params.foo, 'bar')
          ase(res.body.params.bar, 'meow')
          done(err)
        })
    })
  })
})
