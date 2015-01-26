Respectify
==========

> Route specification for [restify](http://mcavage.me/node-restify/)

[![Build Status](https://secure.travis-ci.org/majorleaguesoccer/respectify.png)](http://travis-ci.org/majorleaguesoccer/respectify) 
[![devDependency Status](https://david-dm.org/majorleaguesoccer/respectify.png)](https://david-dm.org/majorleaguesoccer/respectify#info=dependencies)
[![NPM version](https://badge.fury.io/js/respectify.png)](http://badge.fury.io/js/respectify)


### Table of Contents

* [Install](#install)
* [Usage](#usage)
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
var restify = require('restify')
  , Respectify = require('respectify')
 
// Create the restify server
var server = restify.createServer()
 
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
 
// Create the respectify instance with the new server
var respect = new Respectify(server, options)
 
// Add the respectify middleware to validate routes
server.use(respect.middleware)
```

A `params` object must be added to the route options in order for Respectify 
to parse and / or validate the route.

* dataTypes - one of the following: `number`, `date`, `string`, `array`, `object`, `boolean`
* default - the default value to use if the param was not sent, functions can be used
* dataValues - array of specific values considered valid
* min - minimum value allowed (`number` type only)
* max - maximum value allowed (`number` type only)
* notes - array of string information about the param (useful for documentation)
* description - parameter description (useful for documentation)

```js
{
  one: 'boolean'
, two: ['date', 'number']
, three: {
    dataTypes: ['string', 'number']
  , default: 20
  , dataValues: [10, 'a', 30]
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
  , default: function() { return Math.random() }
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
  for (var prop in req.params) {
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
var server = restify.createServer()
var respect = new Respectify(server)
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
  var spec = instance.getSpecByRoute(route)  
})
```


### instance.getDefaults(path, [version])

Find parameter defaults for a given route

* `path` - route pathname as defined for restify
* `version` - load only supplied version (optional, default latest version)

```js
var defaults = instance.getDefaults('/', '1.0.0')
```

```json
{
  "foo": "bar"
}
```


### instance.loadSpecs([version])

* `version` - load only supplied version (optional, default latest version)

```js
var specs = instance.loadSpecs('1.0.0')
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
var routes = instance.findRoutes('/', '2.0.0')
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
var specs = instance.findSpecs('/', '2.0.0')
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

Get a ***copy*** of the parameters for a given route.

* `path` - route pathname as defined for restify
* `version` - load only supplied version (optional, default latest version)

```js
var params = instance.getRouteParams('/', '2.0.0')
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

### instance.getMergedParams(path, version, params)

Get a merged ***copy*** of the route parameterss found with parameters given. 
This is primarily a shortcut method for creating new routes while building upon 
the previously defined parameters.

* `path` - route pathname as defined for restify
* `version` - load only supplied version (optional, default latest version)

```js
var params = instance.getMergedParams('/', '2.0.0', {
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