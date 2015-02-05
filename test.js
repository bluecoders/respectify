'use strict';

var restify = require('restify')
  , fs = require('fs')
  , Respectify = require('./index')
  , info = require('./package.json')
  , assert = require('assert')
  , request = require('supertest')
  , toString = Object.prototype.toString
  , ase = assert.strictEqual
  , ade = assert.deepEqual

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
    it('factory()', function() {
      var inst = Respectify.factory(server)
      assert(inst instanceof Respectify)
    })

    it('getVersions()', function() {
      var inst = new Respectify(server)
      var versions = inst.getVersions()
      ase(versions[0], '3.0.0')
      ase(versions[1], '2.0.0')
      ase(versions[2], '1.0.0')
    })

    it('validateTarget()', function() {
      var inst = new Respectify(server)
      assert.throws(function() {
        inst.validateTarget('foobar')
      }, Error)

      inst.validateTarget('body')
      inst.validateTarget('params')
      inst.validateTarget('query')
    })

    it('normalizeParamFilter()', function() {
      var inst = new Respectify(server)

      it('string', function() {
        assert.throws(function() {
          inst.normalizeParamFilter('foobar')
        }, Error)

        var filter = inst.normalizeParamFilter('body')
        assert(Array.isArray(filter))
        ase(filter[0], 'body')
      })

      it('array', function() {
        assert.throws(function() {
          inst.normalizeParamFilter(['body', 'query', 'meowmeowbeanz'])
        }, Error)

        var filter = inst.normalizeParamFilter(['body', 'params'])
        assert(Array.isArray(filter))
        ase(filter[0], 'body')
        ase(filter[1], 'params')
      })

      it('boolean', function() {
        var filter = inst.normalizeParamFilter(true)
        assert(Array.isArray(filter))
        ase(filter.length, 3)

        var filter = inst.normalizeParamFilter(false)
        ase(filter, false)
      })
    })

    it('loadSpecs()', function() {
      var len = 0
      for (var prop in server.router.routes) {
        len += server.router.routes[prop].length
      }
      var inst = new Respectify(server)
      var specs = inst.loadSpecs()
      fs.writeFileSync(__dirname + '/example/spec.json', JSON.stringify(specs, null, 2))
      ase(specs.length, len)
    })

    it('loadSpecs(version)', function() {
      var inst = new Respectify(server)
      var specs = inst.loadSpecs('1.0.0')
      ase(specs.length, 7)

      var specs2 = inst.loadSpecs('2.0.0')
      ase(specs2.length, 2)

      assert.notDeepEqual(specs, specs2)
    })

    it('findSpecs(path, version)', function() {
      var inst = new Respectify(server)

      var spec = inst.findSpecs('/', '1.0.0')
      
      ade(spec,  {
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
      
      ade(spec2,  {
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

    it('getRouteParams()', function() {
      var inst = new Respectify(server)
      var params = inst.getRouteParams('/strings', '3.0.0')
      ade(params, {
        foo: {
          name: 'foo',
          required: false,
          paramType: 'querystring',
          dataTypes: ['string']
        }
      , bar: {
          name: 'bar',
          required: false,
          paramType: 'querystring',
          dataTypes: ['string']
      }
      , baz: {
          name: 'baz',
          required: false,
          paramType: 'querystring',
          dataTypes: ['string'],
          description: 'Baz that string up',
          default: 'baz'
        }
      })
    })

    it('getMergedParams()', function() {
      var inst = new Respectify(server)
      var params = inst.getMergedParams('/strings', '3.0.0', {
        hello: {
          dataTypes: 'string'
        , description: 'hiii'
        }
      , baz: {
          dataTypes: 'number'
        , description: 'new desc'
        , default: 1
        }
      }, {
        another: {
          dataTypes: ['date']
        }
      })
      
      ade(params, {
        foo: {
          name: 'foo',
          required: false,
          paramType: 'querystring',
          dataTypes: ['string']
        }
      , bar: {
          name: 'bar',
          required: false,
          paramType: 'querystring',
          dataTypes: ['string']
        }
        // Param overwrites, should not have normalized data
      , baz: {
          dataTypes: 'number',
          description: 'new desc',
          default: 1
        }
      , hello: {
          dataTypes: 'string'
        , description: 'hiii'
        }
      , another: {
          dataTypes: ['date']
        }
      })
    })

    it('findRoutes()', function() {
      var inst = new Respectify(server)
      var routes = inst.findRoutes('/')
      ase(routes.length, 2)
    })

    it('middleware()', function() {
      var inst = new Respectify(server)
      var middle = inst.middleware()
      ase(typeof middle, 'function')
    })

    it('findRoutes(path, version)', function() {
      var inst = new Respectify(server)
      var routes = inst.findRoutes('/', '1.0.0')
      ase(routes.length, 1)
    })

    it('getDefaults()', function() {
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

      it('transforms', function(done) {
        var server = restify.createServer()
        var respect = new Respectify(server)
        server.use(restify.queryParser({ mapParams: true }))
        server.use(respect.middleware())

        server.get({path: '/transform/:things', version: '1.0.0'
        , params: {
            things: {
              dataTypes: 'number'
            , transform: function(val) {
                return val * 10
              }
            }
          , foo: {
              dataTypes: 'string'
            , transform: function(val) {
                return val.toUpperCase()
              }
            }
          }
        }, send)

        request(server)
          .get('/transform/1?foo=bar')
          .expect(200, function(err, res) {
            ase(err, null)
            ase(res.body.params.foo, 'BAR')
            ase(res.body.params.things, 10)
            done(err)
          })
      })
    })

    describe('Validation', function() {
      var server = restify.createServer()
      var respect = new Respectify(server)
      server.use(restify.queryParser({ mapParams: true }))
      server.use(respect.middleware())

      server.get({path: '/validate/:things', version: '1.0.0'
      , params: {
          things: {
            dataTypes: 'number'
          , validate: function(val) {
              if (val % 10 !== 0) {
                return new restify.InvalidArgumentError('Not divisible by 10')
              }
              return false
            }
          }
        }
      }, send)

      it('valid', function(done) {
        request(server)
          .get('/validate/10')
          .expect(200, function(err, res) {
            ase(err, null)
            ase(res.body.params.things, 10)
            done(err)
          })
      })

      it('invalid', function(done) {
        request(server)
          .get('/validate/5')
          .expect(409, function(err, res) {
            ase(err, null)
            ase(res.body.code, 'InvalidArgument')
            ase(res.body.message, 'Not divisible by 10')
            done(err)
          })
      })
    })

    /*!
     * Routing booleans
     */

    describe('Booleans', function() {
      it('empty', function(done) {
        request(server)
          .get('/booleans?one=&two=')
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, {
              bad: false
            , ok: true
            , one: true
            })
            done(err)
          })
      })

      it('defaults', function(done) {
        request(server)
          .get('/booleans')
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, {
              bad: false
            , ok: true
            })
            done(err)
          })
      })

      it('invalid', function(done) {
        request(server)
          .get('/booleans?one=abc')
          .expect(409, function(err, res) {
            ase(err, null)
            ase(res.body.code, 'InvalidArgument')
            assert(!~~res.body.message, 'Invalid param `one`')
            done(err)
          })
      })
    })

    /*!
     * Routing strings
     */

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
              baz: 'baz'
            })
            done(err)
          })
      })

      it('invalid', function(done) {
        var qs = queryString({
          foo: 1
        , baz: true
        }) + '&bar=2&bar=3';

        request(server)
          .get('/strings' + qs)
          .set('x-api-version', '1.0.0')
          .expect(409, function(err, res) {
            done(err)
          })
      })
    })

    /*!
     * Routing numbers
     */

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

    /*!
     * Routing dates
     */

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
              two: '2012-02-20T00:00:00.000Z'
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

    /*!
     * Routing objects
     */

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

    /*!
     * Routing arrays
     */

    describe('Arrays', function() {
      it('valid', function(done) {
        var obj = {
          one: 'one,two,three'
        , two: ['true', 'false']
        , three: '5,6,3'
        , four: JSON.stringify(['one', 'two', 'three'])
        }
        var qs = queryString(obj)
        request(server)
          .get('/arrays' + qs)
          .expect(200, function(err, res) {
            assert.deepEqual(res.body, {
              one: ['one', 'two', 'three']
            , two: [true, false]
            , three: [5,6,3]
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
      
      server.get({path: '/test/:value', version: '1.0.0'
      , params: params
      }, send)

      request(server)
        .get('/test/hi?bar=hello&invalid=20')
        .expect(200, function(err, res) {
          ase(err, null)
          ase(res.body.params.value, 'hi')

          ase(res.body.query.bar, 'hello')

          assert(!res.body.query.hasOwnProperty('foo'))
          assert(!res.body.query.hasOwnProperty('cat'))
          assert(!res.body.query.hasOwnProperty('invalid'))

          ase(res.body.params.bar, 'hello')
          assert(!res.body.params.hasOwnProperty('foo'))
          assert(!res.body.params.hasOwnProperty('cat'))
          assert(!res.body.params.hasOwnProperty('invalid'))
          done(err)
        })
    })

    it('custom', function(done) {
      var server = restify.createServer()
      var respect = new Respectify(server)
      server.use(restify.queryParser({ mapParams: true }))
      server.use(respect.middleware({ filterParams: ['params'] }))
      
      server.get({path: '/test/:value', version: '1.0.0'
      , params: params
      }, send)

      request(server)
        .get('/test/stuff?bar=hello&invalid=20')
        .expect(200, function(err, res) {
          ase(err, null)
          ase(res.body.params.value, 'stuff')

          ase(res.body.query.bar, 'hello')
          ase(res.body.query.invalid, '20')
          assert(!res.body.query.hasOwnProperty('foo'))
          assert(!res.body.query.hasOwnProperty('cat'))


          ase(res.body.params.bar, 'hello')
          assert(!res.body.params.hasOwnProperty('foo'))
          assert(!res.body.params.hasOwnProperty('cat'))
          assert(!res.body.params.hasOwnProperty('invalid'))
          done(err)
        })
    })

    it('disabled', function(done) {
      var server = restify.createServer()
      var respect = new Respectify(server)
      server.use(restify.queryParser({ mapParams: true }))
      server.use(respect.middleware({ filterParams: false }))
      
      server.get({path: '/test/:value', version: '1.0.0'
      , params: params
      }, send)

      request(server)
        .get('/test/code?bar=hello&invalid=20')
        .expect(200, function(err, res) {
          ase(err, null)
          ase(res.body.params.value, 'code')

          ase(res.body.query.bar, 'hello')
          ase(res.body.query.invalid, '20')

          ase(res.body.params.bar, 'hello')
          ase(res.body.params.invalid, '20')
          done(err)
        })
    })

    it('whitelist', function(done) {
      var server = restify.createServer()
      var respect = new Respectify(server)
      server.use(restify.queryParser({ mapParams: true }))

      assert.throws(function() {
        server.use(respect.middleware({ paramWhitelist: 'meow' }))
      }, Error)

      assert.throws(function() {
        server.use(respect.middleware({ paramWhitelist: 22 }))
      }, Error)

      server.use(respect.middleware({ 
        filterParams: true
      , paramWhitelist: ['meowmeow', 'beanz'] 
      }))
      
      server.get({path: '/test', version: '1.0.0'
      , params: params
      }, send)

      request(server)
        .get('/test?foo=hello&invalid=20&meowmeow=2&beanz=3')
        .expect(200, function(err, res) {
          ase(err, null)

          ase(res.body.query.foo, 'hello')
          ase(res.body.query.meowmeow, '2')
          ase(res.body.query.beanz, '3')
          assert(!res.body.query.hasOwnProperty('invalid'))

          ase(res.body.params.foo, 'hello')
          ase(res.body.params.meowmeow, '2')
          ase(res.body.params.beanz, '3')
          assert(!res.body.params.hasOwnProperty('invalid'))
          done(err)
        })
    })


    it('jsonp', function() {
      var server = restify.createServer()
      var respect = new Respectify(server)

      server.use(restify.queryParser({ mapParams: true }))
      server.use(respect.middleware({ 
        filterParams: true
      , jsonp: true 
      }))

      server.get({path: '/foo', version: '1.0.0'
      , params: params
      }, send)

      it('jsonp', function(done) {
        request(server)
          .get('/foo?bar=hello&invalid=20&jsonp')
          .expect(200, function(err, res) {
            ase(err, null)

            ase(res.body.query.bar, 'hello')
            ase(res.body.query.jsonp, '')

            assert(!res.body.query.hasOwnProperty('invalid'))

            ase(res.body.params.bar, 'hello')
            assert(!res.body.params.hasOwnProperty('invalid'))
            done(err)
          })
      })

      it('callback', function(done) {
        request(server)
          .get('/foo?bar=hello&invalid=20&callback=jsonp1396552205550')
          .expect(200, function(err, res) {
            ase(err, null)

            ase(res.body.query.bar, 'hello')
            ase(res.body.query.callback, 'jsonp1396552205550')

            assert(!res.body.query.hasOwnProperty('invalid'))

            ase(res.body.params.bar, 'hello')
            assert(!res.body.params.hasOwnProperty('invalid'))
            done(err)
          })
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
  }) // End routing

  describe('Validation', function() {
    var inv = Respectify.isInvalid
    //restify.InvalidArgumentError

    function errTest(obj, prop, paramSpec) {
      var err = inv(obj, prop, paramSpec)
      assert(err instanceof restify.InvalidArgumentError)
      ase(err.statusCode, 409)
      assert(!!~err.message.indexOf('Invalid param `' + prop))
    }

    /*!
     * Boolean validation
     */

    describe('Booleans', function() {
      it('conversions', function() {
        var paramSpec = {
          dataTypes: ['boolean']
        }

        // Empty
        assert.ifError(inv({}, 'on', paramSpec))

        // Truth tests
        var obj = { on: '1' }
        assert.ifError(inv(obj, 'on', paramSpec))
        ase(obj.on, true)
        
        var obj = { on: 1 }
        assert.ifError(inv(obj, 'on', paramSpec))
        ase(obj.on, true)
        
        var obj = { on: 'TRue' }
        assert.ifError(inv(obj, 'on', paramSpec))
        ase(obj.on, true)
        
        var obj = { on: true }
        assert.ifError(inv(obj, 'on', paramSpec))
        ase(obj.on, true)
        
        var obj = { on: undefined }
        assert.ifError(inv(obj, 'on', paramSpec))
        ase(obj.on, true)
        
        var obj = { on: '' }
        assert.ifError(inv(obj, 'on', paramSpec))
        ase(obj.on, true)
        
        // False tests
        var obj = { off: '0' }
        assert.ifError(inv(obj, 'off', paramSpec))
        ase(obj.off, false)
        
        // False tests
        var obj = { off: 'faLSE' }
        assert.ifError(inv(obj, 'off', paramSpec))
        ase(obj.off, false)
        
        // False tests
        var obj = { off: 0 }
        assert.ifError(inv(obj, 'off', paramSpec))
        ase(obj.off, false)
        
        // False tests
        var obj = { off: false }
        assert.ifError(inv(obj, 'off', paramSpec))
        ase(obj.off, false)

        // Test lists
        var paramSpec = {
          dataTypes: ['boolean', 'array']
        }

        // Truth tests
        var obj = { on: ['1', 'TRUE', 1, true, undefined, ''] }
        assert.ifError(inv(obj, 'on', paramSpec))
        ade(obj.on, [true, true, true, true, true, true])

        var obj = { off: ['0', 'false', 0, false, '1'] }
        assert.ifError(inv(obj, 'off', paramSpec))
        ade(obj.off, [false, false, false, false, true])
      })

      it('dataValues', function() {
        var paramSpec = {
          dataTypes: ['boolean']
        , dataValues: [true]
        }
        
        var obj = { on: 1 }
        assert.ifError(inv(obj, 'on', paramSpec))
        ase(obj.on, true)

        var paramSpec = {
          dataTypes: ['boolean']
        , dataValues: [false]
        }
        var obj = { off: false }
        assert.ifError(inv(obj, 'off', paramSpec))
        ase(obj.off, false)

        var paramSpec = {
          dataTypes: ['boolean']
        , dataValues: [false, true]
        }
        var obj = { on: 1 }
        assert.ifError(inv(obj, 'on', paramSpec))
        ase(obj.on, true)

        var obj = { off: false }
        assert.ifError(inv(obj, 'off', paramSpec))
        ase(obj.off, false)
      })

      it('errors', function() {
        var paramSpec = {
          dataTypes: ['boolean']
        }

        errTest({ bad: 'abc' }, 'bad', paramSpec)
        errTest({ bad: '10' }, 'bad', paramSpec)
        errTest({ bad: '00.0' }, 'bad', paramSpec)
        errTest({ bad: '1.001' }, 'bad', paramSpec)
        errTest({ bad: 1.001 }, 'bad', paramSpec)
        errTest({ bad: 20 }, 'bad', paramSpec)
        errTest({ bad: [] }, 'bad', paramSpec)


        var paramSpec = {
          dataTypes: ['boolean']
        , dataValues: [false]
        }
        errTest({ bad: true }, 'bad', paramSpec)
        errTest({ bad: '1' }, 'bad', paramSpec)
        errTest({ bad: 'true' }, 'bad', paramSpec)


        var paramSpec = {
          dataTypes: ['boolean']
        , dataValues: [true]
        }
        errTest({ bad: false }, 'bad', paramSpec)
        errTest({ bad: '0' }, 'bad', paramSpec)
        errTest({ bad: 'false' }, 'bad', paramSpec)
        
      })
    })

    /*!
     * String validation
     */

    describe('Strings', function() {
      it('conversions', function() {
        var paramSpec = {
          dataTypes: ['string']
        }
        
        // Empty
        assert.ifError(inv({}, 'str', paramSpec))

        // Truth tests
        var obj = { str: '1' }
        assert.ifError(inv(obj, 'str', paramSpec))
        ase(obj.str, '1')

        var obj = { str: 'abc' }
        assert.ifError(inv(obj, 'str', paramSpec))
        ase(obj.str, 'abc')

        var obj = { str: '{woa nelly}' }
        assert.ifError(inv(obj, 'str', paramSpec))
        ase(obj.str, '{woa nelly}')

        var obj = { str: undefined }
        assert.ifError(inv(obj, 'str', paramSpec))
        ase(obj.str, '')

        // List
        var paramSpec = {
          dataTypes: ['string', 'array']
        }
        
        var obj = { str: 'a,b,c' }
        assert.ifError(inv(obj, 'str', paramSpec))
        ade(obj.str, ['a','b','c'])
        
        var obj = { str: '["a","b","c"]' }
        assert.ifError(inv(obj, 'str', paramSpec))
        ade(obj.str, ['a','b','c'])
        
        var obj = { str: ['hey', 'there'] }
        assert.ifError(inv(obj, 'str', paramSpec))
        ade(obj.str, ['hey', 'there'])
        
        var obj = { str: 'a' }
        assert.ifError(inv(obj, 'str', paramSpec))
        ase(obj.str, 'a')
      })

      it('dataValues', function() {
        var paramSpec = {
          dataTypes: ['string']
        , dataValues: ['a', 'b', 'c']
        }
        
        // Truth tests
        var obj = { str: 'a' }
        assert.ifError(inv(obj, 'str', paramSpec))
        ase(obj.str, 'a')

        var obj = { str: 'b' }
        assert.ifError(inv(obj, 'str', paramSpec))
        ase(obj.str, 'b')


        var paramSpec = {
          dataTypes: ['string', 'array']
        , dataValues: ['a', 'b', 'c']
        }
        var obj = { str: 'a,b,c' }
        assert.ifError(inv(obj, 'str', paramSpec))
        ade(obj.str, ['a', 'b', 'c'])
      })

      it('errors', function() {
        var paramSpec = {
          dataTypes: ['string']
        }
        errTest({ str: 1 }, 'str', paramSpec)
        errTest({ str: [] }, 'str', paramSpec)
        errTest({ str: true }, 'str', paramSpec)
        errTest({ str: { oh: 'hi' } }, 'str', paramSpec)
        errTest({ str: new Date() }, 'str', paramSpec)

        var paramSpec = {
          dataTypes: ['string']
        , dataValues: ['a', 'b', 'c']
        }
        errTest({ str: 'd' }, 'str', paramSpec)
        errTest({ str: 'a,b,c' }, 'str', paramSpec)
      })
    })

    /*!
     * Number validation
     */

    describe('Numbers', function() {
      it('conversions', function() {
        var paramSpec = {
          dataTypes: ['number']
        }
        
        // Empty
        assert.ifError(inv({}, 'num', paramSpec))

        var obj = { num: '1' }
        assert.ifError(inv(obj, 'num', paramSpec))
        ase(obj.num, 1)
        
        var obj = { num: '1.02' }
        assert.ifError(inv(obj, 'num', paramSpec))
        ase(obj.num, 1.02)
        
        var obj = { num: '0' }
        assert.ifError(inv(obj, 'num', paramSpec))
        ase(obj.num, 0)
        
        var obj = { num: 20 }
        assert.ifError(inv(obj, 'num', paramSpec))
        ase(obj.num, 20)
        
        var obj = { num: '9.99999999999999' }
        assert.ifError(inv(obj, 'num', paramSpec))
        ase(obj.num, 9.99999999999999)

        // List
        var paramSpec = {
          dataTypes: ['number', 'array']
        }
        
        var obj = { num: '1,2,3' }
        assert.ifError(inv(obj, 'num', paramSpec))
        ade(obj.num, [1, 2, 3])

        var obj = { num: ['1', '2'] }
        assert.ifError(inv(obj, 'num', paramSpec))
        ade(obj.num, [1, 2])

        var obj = { num: [30, 21] }
        assert.ifError(inv(obj, 'num', paramSpec))
        ade(obj.num, [30, 21])
      })

      it('dataValues', function() {
        var paramSpec = {
          dataTypes: ['number']
        , dataValues: [1, 2, 3.33]
        }
        
        var obj = { num: '1' }
        assert.ifError(inv(obj, 'num', paramSpec))
        ase(obj.num, 1)

        var obj = { num: 3.33 }
        assert.ifError(inv(obj, 'num', paramSpec))
        ase(obj.num, 3.33)

        // List
        var paramSpec = {
          dataTypes: ['number', 'array']
        , dataValues: [1, 2, 3.33]
        }

        var obj = { num: 3.33 }
        assert.ifError(inv(obj, 'num', paramSpec))
        ase(obj.num, 3.33)

        var obj = { num: '3.33, 2' }
        assert.ifError(inv(obj, 'num', paramSpec))
        ade(obj.num, [3.33, 2])
      })

      it('errors', function() {
        var paramSpec = {
          dataTypes: ['number']
        }
        errTest({ num: 'a' }, 'num', paramSpec)
        errTest({ num: 'true' }, 'num', paramSpec)
        errTest({ num: '10x4' }, 'num', paramSpec)
        errTest({ num: true }, 'num', paramSpec)
        errTest({ num: new Date() }, 'num', paramSpec)
        errTest({ num: [] }, 'num', paramSpec)
        errTest({ num: [1] }, 'num', paramSpec)
        errTest({ num: {hey: 'there'} }, 'num', paramSpec)

        var paramSpec = {
          dataTypes: ['number']
        , dataValues: [1, 2, 3.33]
        }
        errTest({ num: 1.5 }, 'num', paramSpec)
      })
    })

    /*!
     * Date validation
     */

    describe('Dates', function() {
      var t = 1423170463349 // 2014-02-05
        , d = new Date(t)

      it('conversions', function() {
        var paramSpec = {
          dataTypes: ['date']
        }
        
        // Empty
        assert.ifError(inv({}, 'time', paramSpec))

        var obj = { time: t + '' }
        assert.ifError(inv(obj, 'time', paramSpec))
        assert(obj.time instanceof Date)
        ase(+obj.time, 1423170463349)

        var obj = { time: Math.round(t / 1000) }
        assert.ifError(inv(obj, 'time', paramSpec))
        assert(obj.time instanceof Date)
        ase(+obj.time, 1423170463000)

        ;['2015/02/05'
        , '2015-02-05'
        , '02-05-2015'
        , '02/05/2015'
        , '02/05/2015 00:00'
        , '02-05-2015 00:00'
        , '02-05-2015 00:00:00'
        , '02-05-2015 00:00:00 -0800'
        ].forEach(function(x) {
          var obj = { time: x }
          assert.ifError(inv(obj, 'time', paramSpec))
          assert(obj.time instanceof Date)
          ase(+obj.time, 1423094400000)
        })

        var paramSpec = {
          dataTypes: ['date', 'array']
        }
        var obj = { time: [t, Math.round(t / 1000), d] }
        assert.ifError(inv(obj, 'time', paramSpec))
        ade(
          obj.time.map(function(x) { return +x })
        , [1423170463349, 1423170463000, 1423170463349]
        )
      })

      // Data values will not work with dates...
      // it('dataValues', function() {
      // })

      it('errors', function() {
        var paramSpec = {
          dataTypes: ['date']
        }
        errTest({ time: 1 }, 'time', paramSpec)
        errTest({ time: 'abc' }, 'time', paramSpec)
        errTest({ time: 103230 }, 'time', paramSpec)
        errTest({ time: true }, 'time', paramSpec)
        errTest({ time: 'true' }, 'time', paramSpec)
        errTest({ time: [] }, 'time', paramSpec)
        errTest({ time: [1423094400000] }, 'time', paramSpec)
        errTest({ time: {hi: 1423094400000} }, 'time', paramSpec)
      })
    })

    /*!
     * Array validation
     */

    describe('Arrays', function() {
      it('conversions', function() {
        var paramSpec = {
          dataTypes: ['array']
        }
        
        // Empty
        assert.ifError(inv({}, 'arr', paramSpec))

        var obj = { arr: '1' }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ade(obj.arr, ['1'])

        var obj = { arr: '1,2,3' }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ade(obj.arr, ['1', '2', '3'])

        var obj = { arr: 1 }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ade(obj.arr, [1])

        var obj = { arr: true }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ade(obj.arr, [true])

        var obj = { arr: ['1', '2']}
        assert.ifError(inv(obj, 'arr', paramSpec))
        ade(obj.arr, ['1', '2'])

        var obj = { arr: '["1",2,3]' }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ade(obj.arr, ['1', 2, 3])

        // Mixed types
        var paramSpec = {
          dataTypes: ['array', 'string']
        }
        var obj = { arr: '1' }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ase(obj.arr, '1')

        var obj = { arr: 'a,b,2' }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ade(obj.arr, ['a', 'b', '2'])

        var obj = { arr: '1,2,3' }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ade(obj.arr, ['1', '2', '3'])
        

        var paramSpec = {
          dataTypes: ['array', 'number']
        }
        var obj = { arr: 1 }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ase(obj.arr, 1)

        var obj = { arr: '1,2,2' }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ade(obj.arr, [1, 2, 2])

        var obj = { arr: [2, 3] }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ade(obj.arr, [2, 3])

        var paramSpec = {
          dataTypes: ['array', 'number', 'string']
        }
        var obj = { arr: '1' }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ade(obj.arr, 1)

        var obj = { arr: 'a,b,2' }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ade(obj.arr, ['a', 'b', 2])

        var obj = { arr: ['hey', 'there'] }
        assert.ifError(inv(obj, 'arr', paramSpec))
        ade(obj.arr, ['hey', 'there'])
      })

      // Direct data values don't apply, mixed type data values 
      // with array should be tested by the other data types

      it('errors', function() {
        var paramSpec = {
          dataTypes: ['array']
        }
        errTest({ arr: '[1,2' }, 'arr', paramSpec)

        var paramSpec = {
          dataTypes: ['array', 'string']
        }

        errTest({ arr: 1 }, 'arr', paramSpec)

        var paramSpec = {
          dataTypes: ['array', 'number']
        }
        errTest({ arr: 'a' }, 'arr', paramSpec)
        errTest({ arr: 'a,b,c' }, 'arr', paramSpec)
      })
    })

    /*!
     * Object validation
     */

    describe('Objects', function() {
      it('conversions', function() {
        var paramSpec = {
          dataTypes: ['object']
        }
        
        // Empty
        assert.ifError(inv({}, 'hash', paramSpec))

        var obj = { hash: '{"hey": 1}' }
        assert.ifError(inv(obj, 'hash', paramSpec))
        ade(obj.hash, { hey: 1 })

        var big = JSON.stringify(info)
        var obj = { hash: big }
        assert.ifError(inv(obj, 'hash', paramSpec))
        ade(obj.hash, info)
      })

      it('errors', function() {
        var paramSpec = {
          dataTypes: ['object']
        }
        errTest({ hash: 1 }, 'hash', paramSpec)
        errTest({ hash: 'a' }, 'hash', paramSpec)
        errTest({ hash: '{"hey":2' }, 'hash', paramSpec)
        errTest({ hash: [1, 2] }, 'hash', paramSpec)
        errTest({ hash: true }, 'hash', paramSpec)
        errTest({ hash: 'false' }, 'hash', paramSpec)
      })
    })
  }) // End validation
})
