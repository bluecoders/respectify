Respectify
==========

> Route specification for [restify](http://mcavage.me/node-restify/)

[![Build Status](https://secure.travis-ci.org/majorleaguesoccer/respectify.png)](http://travis-ci.org/majorleaguesoccer/respectify)
[![devDependency Status](https://david-dm.org/majorleaguesoccer/respectify.png)](https://david-dm.org/majorleaguesoccer/respectify#info=dependencies)
[![NPM version](https://badge.fury.io/js/respectify.png)](http://badge.fury.io/js/respectify)


### Table of Contents

* [Install](#install)
* [Usage](#usage)
* [Parameters](#parameters)
* [Parameter Targeting](#parameter-targeting)
* [API](#api)
  - [constructor](#new-respectifyserver-options)
  - [middleware](#instancemiddlewareoptions)
  - [getSpecByRoute](#instancegetspecbyrouteroute)
  - [getDefaults](#instancegetdefaultspath-version)
  - [loadSpecs](#instanceloadspecsversion)
  - [findRoutes](#instancefindroutespath-version)
  - [findSpecs](#instancefindspecspath-version)
  - [getVersions](#instancegetversions)
  - [getRouteParams](#instancegetrouteparamspath-version)
  - [getMergedParams](#instancegetmergedparamspath-version-params)
* [Debugging](#debugging)
* [License](#license)


Install
-------

With [npm](https://npmjs.org)

```
npm install respectify
```


Usage
-----

```js
const restify = require('restify')
  , Respectify = require('respectify')

// Create the restify server
const server = restify.createServer()

// Create the respectify instance with the new server
const respect = new Respectify(server)

// Add the respectify middleware to validate routes
server.use(respect.middleware())

server.get({
  path: '/things/:id'
, version: '1.0.0'
, params: {
    id: 'number'
  , another: {
      dataTypes: ['number', 'string']
    , default: 20
    }
  }
}, function(req, res, next) {
  // ...
})
```


Parameters
----------

A `params` object must be added to the route options in order for Respectify
to parse and / or validate the route.

* `dataTypes` - one of the following: `number`, `date`, `string`, `array`, `object`, `boolean`
* `default` - the default value to use if the param was not sent, functions can be used
* `dataValues` - array of specific values considered valid
* `min` - minimum value allowed (`number` type only)
* `max` - maximum value allowed (`number` type only)
* `notes` - array of string information about the param (useful for documentation)
* `description` - parameter description (useful for documentation)
* `transform` - param value transformation function (synchronous, optional)
* `validate` - param value validation function (synchronous, optional)

```js
server.get({
  path: '/users/:id'
, version: '1.0.0'
, params: {
    one: 'boolean'
  , two: ['date', 'number']
  , three: {
      dataTypes: ['string', 'number']
    , default: 20
    , dataValues: [10, 'a', 30]
    , transform: function(val, req, param) {
        if (val === 'a') return 20
        return val
      }
    }
  , pagesize: {
      dataTypes: 'number'
    , desc: 'page size'
    , default: 50
    , min: 0
    , max: 250
    }
  , random: {
      dataTypes: 'number'
    , default: function() { return Math.round(Math.random()) }
    , validate: function(val, req, param) {
        if (val === 10) {
          return new Error('i hate that number')
        }
        return false
      }
    }
  }
}, function(req, res, next) {
  // ...
})
```


### param.validate(value, req, param)

Parameter specific validation method, should return `false` if valid, or any
`Error` instance for failures. Synchronous.

*Note:* This will only be called if the parameter has a value

* `value` - incoming request value, after initial validation
* `req` - restify request object
* `param` - normalized parameter reference

Example:

```js
server.get({path: '/users'
, versions: ['2.0.0']
, flags: 'i'
, params: {
    pagesize: {
      dataTypes: 'number'
    , description: 'page size'
    , default: 50
    , min: 1
    , max: 1000
    , validate: function(val, req) {
        const ttl = req.params.ttl;
        if (val && +val > 200 && (!ttl || +ttl < 1800)) {
          const msg = ''
            + 'Invalid param `pagesize`, value must be under `200`'
            + ' if no `ttl` was provided, or if `ttl` is less than `1800`'
            ;
          return new restify.InvalidArgumentError(msg);
        }
        return false;
      }
    , notes: [
        'if a value of over `200` is used, a `ttl` value of `1800` or more must also be used'
      ]
    }
  }
})
```


### param.transform(value, req, param)

Parameter specific transform method. This value returned from this method will
always be used, even if `undefined` returned. Synchronous.

*Note:* This will only be called if the parameter has a value

* `value` - incoming request value, after initial validation
* `req` - restify request object
* `param` - normalized parameter reference

Example:

```js
SQL_SORT_MAP = {
  asc:        'ASC'
, acending:   'ASC'
, desc:       'DESC'
, descending: 'DESC'
};

server.get({path: '/users'
, versions: ['2.0.0']
, flags: 'i'
, params: {
    sortby: {
      dataTypes: 'string'
    , dataValues: Object.keys(SQL_SORT_MAP)
    , description: 'sorting order for `sortstat` parameter'
    , default: 'desc'
    , transform: function(val) {
        return SQL_SORT_MAP[val];
      }
    }
  }
})
```

## Special Cases

### Arrays

If `array` is used as a dataType, the elements of array will be re-validated against
the remaining dataTypes.

For example, a parameter defined with both `array` and `number` is interpreted to
be either a single number value, or an array of numbers.

```js
{
  ids: {
    dataTypes: ['array', 'number']
  }
}
```

```js
// http://localhost/users?id=1
req.params.id === 1

// http://localhost/users?id=1,2,3
req.params.id === [1, 2, 3]

// http://localhost/users?id=10&id=40
req.params.id === [10, 40]
```

### Objects

If using `object` as a dataType, a nested `params` definition may be added to
specify property values. When using `required` on a nested parameter definition,
only the current object level is looked at.

```js
{
  user: {
    dataTypes: ['object']
  , params: {
      id: 'number'
    , email: {
        dataTypes: ['string']

        // This will only be required if the `user` param is sent.
      , required: true
      }
    , name: {
        dataTypes: ['object']
      , params: {
          first: {
            dataTypes: 'string'
          }
        , last: {
            dataTypes: 'string'

            // This parameter is only required if `name` is sent, because
            // the parent parameter is not required.
          , required: true
          }
        }
      }
    }
  }
}
```


Parameter Targeting
-------------------

By default, respectify will only use what has been populated in the `req.params`
object from restify, which should cover most use cases.  If you are using the restify
`queryParser` and / or `bodyParser`, restify will map these to the `req.params`
object (unless you specified `mapParams: false`)

You can specify param targeting by passing a `paramTarget` option to the respectify
constructor, or by adding it as a route property, valid options are `query`, `params`,
and `body`.

***Note:*** The original target object of the request, `params`, `body`, and `query`
may have its properties overwitten or deleted by the `respectify.middleware`. If you
need the original values, you will need to use a middleware function to preserve them.

```js
// Shallow clone the `param` object to preserve original values
server.use(function(req, res, next) {
  req.__params = {}
  for (const prop in req.params) {
    req.__params[prop] = req.params[prop]
  }
})
server.use(respectify.middleware)
```


API
---

***Note:*** These methods are currently somewhat disorganized, as this module evolves, these
methods and their responses will be normalized and hopefully easier to use.


### new Respectify(server, options)

Respectify constructor

**Alias**: [`Respectify.factory(server)`]

* `server` - restify server instance
* `options` - respectify options
  - `routeProperties` - array of route properties to store (optional, default `['description']`)
  - `paramProperties` - array of route parameter properties to store (optional, default `['description']`)
  - `paramTarget` - target for parameter extraction (optional, default `params`)

Example:

```js
const server = restify.createServer()
const respect = new Respectify(server)
```


### instance.middleware([options])

Route middleware to add parameter validation, this will filter all properties
of `req.params` according to the param definition of the route.  Parameters received
that have not been defined will be removed.

***Note:*** The middleware should come after `restify.queryParser` and / or `restify.bodyParser`

* `options` - middleware options (optional)
  - `mapParams` - map all parsed `query` and `body` properties to the `params` object (optional, default `true`)
  - `filterParams` - remove all unspecified input params (optional, default `true`)

Example:

```js
server.use(restify.queryParser())
server.use(respect.middleware)

server.get({
  path: '/'
, version: '1.0.0'
, params: {
    foo: {
      dataTypes: 'string'
    , default: 'bar'
    }
  }
}, function(req, res, next) {
  res.send(200)
})

server.get({
  path: '/'
, version: '2.0.0'
, params: {}
}, function(req, res, next) {
  res.send(200)
})
```


### instance.getSpecByRoute(route)

Get the specification of a given restify route object. The route itself can be
retrieved using restify's `router.find()` method or the `instance.findRoutes()`
method above.

See [route-information](./example/route-information.js) for example usage.

* `route` - restify route object

```js
server.router.find(req, res, function(err, route, params) {
  const spec = instance.getSpecByRoute(route)
})
```


### instance.getDefaults(path, [version])

Find parameter defaults for a given route

* `path` - route pathname as defined for restify
* `version` - load only supplied version (optional, default latest version)

```js
const defaults = instance.getDefaults('/', '1.0.0')
```

```json
{
  "foo": "bar"
}
```


### instance.loadSpecs([version])

* `version` - load only supplied version (optional, default latest version)

```js
const specs = instance.loadSpecs('1.0.0')
```

```json
[
  {
    "route": "/",
    "parameters": [
      {
        "name": "foo",
        "required": false,
        "paramType": "querystring",
        "dataTypes": [
          "string"
        ],
        "default": "bar"
      }
    ],
    "method": "GET",
    "versions": [
      "1.0.0"
    ]
  }
]
```

### instance.findRoutes(path, [version])

Find restify route objects, mainly used internally.

* `path` - route pathname as defined for restify
* `version` - load only supplied version (optional, default latest version)

```js
const routes = instance.findRoutes('/', '2.0.0')
```

```json
[
  {
    "name": "get200",
    "method": "GET",
    "path": {
      "restifyParams": []
    },
    "spec": {
      "path": "/",
      "version": "2.0.0",
      "params": {},
      "method": "GET",
      "versions": [
        "2.0.0"
      ],
      "name": "get200"
    },
    "types": [],
    "versions": [
      "2.0.0"
    ]
  }
]
```

### instance.findSpecs(path, [version])

Find restify route objects, mainly used internally.

***Alias:*** [`find`]

* `path` - route pathname as defined for restify
* `version` - load only supplied version (optional, default latest version)

```js
const specs = instance.findSpecs('/', '2.0.0')
```

```json
[
  {
    "route": "/",
    "parameters": [
      {
        "name": "foo",
        "required": false,
        "paramType": "querystring",
        "dataTypes": [
          "string"
        ],
        "default": "bar"
      }
    ],
    "method": "GET",
    "versions": [
      "1.0.0"
    ]
  }
]
```

### instance.getVersions()

Returns an array of all routable versions found.

### instance.getRouteParams(path, [version])

Get a ***copy*** of the parameters for a given route as a key value mapping.

* `path` - route pathname as defined for restify
* `version` - load only supplied version (optional, default latest version)

```js
const params = instance.getRouteParams('/', '2.0.0')
```

```json
{
  "foo": {
      "name": "foo",
      "required": false,
      "paramType": "querystring",
      "dataTypes": [
        "string"
      ],
      "default": "bar"
    }
  }
}
```

### instance.getMergedParams(path, version, params, ...)

Get a merged ***copy*** of the route parameters found with parameters given.
This is primarily a shortcut method for creating new routes while building upon
the previously defined parameters.

* `path` - route pathname as defined for restify
* `version` - load only supplied version (optional, default latest version)
* `params` - any number of parameter objects to merge

```js
const params = instance.getMergedParams('/', '2.0.0', {
  pagesize: {
    dataTypes: 'number'
  , description: 'Page size'
  }
})
```

```json
{
  "foo": {
      "name": "foo",
      "required": false,
      "paramType": "querystring",
      "dataTypes": [
        "string"
      ],
      "default": "bar"
    }
  },
  "pagesize": {
      "dataTypes": "number",
      "description": "Page size"
    }
  }
}
```


Debugging
---------

This project uses the [debug](https://github.com/visionmedia/debug) module for
logging, and can be activated using `DEBUG=respectify` or `DEBUG=respectify:verbose`


Contributors
------------

[Jarrett Gossett](https://github.com/jetpackjarrett)


License
-------

(The MIT License)

Copyright (c) 2014 Major League Soccer

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
