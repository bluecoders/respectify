'use strict';

/*!
 * Module dependencies.
 */

var semver = require('semver')
  , _ = require('underscore')
  , fs = require('fs')
  , utils = require('./utils')
  , slice = Array.prototype.slice
  , debug = require('debug')('respectify')
  , verbose = require('debug')('respectify:verbose')

// Valid parameter targets / sources
var TARGETS = ['params', 'query', 'body']

// Attempt to load restify from the parent project's node_modules,
// if it does not exist, or we are testing, then load the local version
var restify
try {
  restify = require(__dirname + '/../../restify')
} catch (e) {
  restify = require('restify')
}

/**
 * Check if a version is valid for a given route spec
 *
 * @param {String} version
 * @param {Object} route specification
 * @return {Boolean} valid
 * @api private
 */

function validVersion(version, spec) {
  // Normalize route versions
  var test = spec.versions || [spec.version]

  // Check for direct version match
  if (~test.indexOf(version)) {
    return true
  }

  // Use semver and attempt to match on supplied version
  return !!test.filter(function(v) {
    return semver.satisfies(v, version)
  }).length
}

/**
 * Array defaults helper, ensure all elements within
 * `default` exist in the `arr` input
 *
 * @param {Array} source array
 * @param {Array} default values to check
 * @api private
 */

function arrayDefaults(arr, values) {
  values.forEach(function(x) {
    if (!~arr.indexOf(x)) arr.push(x)
  })
}

/**
 * Respectify constructor
 *
 * @param {Object} restify server instance
 * @param {Object} options
 *   * `routeProperties` {Array} - route props to store (optional, default `['description']`)
 *   * `paramProperties` {Array} - param props to store (optional, default `['description']`)
 *   * `paramTarget` {String} - route param target (optional, default `params`)
 * @constructor
 * @api public
 */

function Respectify(server, options) {
  // Ensure valid construction
  if (!(this instanceof Respectify)) {
    return new Respectify(server, options)
  }
  this.server = server

  // TODO: Consider removing this
  server.respect = this

  var opt = this.options = options || {}

  // Ensure default option properties
  opt.routeProperties || (opt.routeProperties = ['description'])
  opt.paramProperties || (opt.paramProperties = ['description'])

  // Route property internal extras
  arrayDefaults(opt.routeProperties, [
    'paramTarget'
  ])

  // Parameter property internal extras
  arrayDefaults(opt.paramProperties, [
    'default'
  , 'dataValues'
  , 'transform'
  , 'validate'
  ])

  // Check for all-route parameters
  this.globalParams = {}
  if (opt.params) this.globalParams = opt.params

  // Target for parameter extraction / parsing
  opt.paramTarget && this.validateTarget(opt.paramTarget)
  this.middleware = this.middleware.bind(this)
}

/**
 * Constructor alias
 *
 * @param {Object} restify server instance
 * @param {Object} options
 * @api public
 */

Respectify.factory = function(server, options) {
  return new Respectify(server, options)
}

/**
 * Determine if a property is invalid according to the spec
 *
 * @param {Object} prop container, passed for ref / transformation
 * @param {String} property name
 * @param {Object} route specification
 * @param {Object} restify request (optional, used for `default` call)
 * @param {String} property name prefix (used for recursion)
 * @return {Boolean|(Error|Array)} false or Error instance(s)
 * @api private
 */

Respectify.isInvalid = function(obj, prop, spec, req, prefix) {
  var val = obj[prop]
    , type = utils.getType(val)
    , dt = spec.dataTypes
    , dv = spec.dataValues
    , ok = ~dt.indexOf(type)
    , label = (prefix || '') + prop

  debug('[isInvalid] prop=`%s` val=`%s` allowed=`%s` type=`%s`', label, val, dt, type)

  // No param value supplied, check for required param
  if (!obj.hasOwnProperty(prop) && spec.required) {
    return new restify.MissingParameterError('Param `' + label + '` required')
  }

  // No param value supplied
  if (!obj.hasOwnProperty(prop)) {

    // If there is a default value, use it and continue validation
    if (spec.hasOwnProperty('default')) {
      obj[prop] = typeof spec.default === 'function'
        ? spec.default(req, spec)
        : spec.default

      // Recast val and type to use default
      val = obj[prop]
      type = utils.getType(val)

      debug('[isInvalid] default done: `%s` = `%s`', label, obj[prop])
    } else {
      return false
    }
  }

  // If an object is a valid type, see if we can parse the value to JSON
  if (~dt.indexOf('object')) {
    if (type === 'object') {
      obj[prop] = val
      ok = true
    // Check if it looks like an object and attempt to parse
    } else if (type === 'string' && val.indexOf('{') === 0) {
      try {
        obj[prop] = JSON.parse(val)
        ok = true
      } catch (e) {

        // The only other value of the var could be a string, if not specified,
        // return a parameter error
        if (!~dt.indexOf('string')) {
          var msg = ''
            + 'Invalid param `' + label + '`'
            + ', malformed object: `' + e.message + '`'

          return new restify.InvalidArgumentError(msg)
        }
      }
    }

    // Check for object sub-schema params
    if (ok && spec.params) {
      var errs = spec.params.map(function(param) {
        return Respectify.isInvalid(
          obj[prop]
        , param.name
        , param
        , req
        , label + '.'
        )
      }).filter(function(x) { 
        return !!x 
      })

      if (errs.length) return _.flatten(errs)
    }

    // Type recast
    if (ok) type = utils.getType(val)
  }

  verbose('[isInvalid] object done: `%s` = `%s`', label, obj[prop])

  // If array is a valid type, check if a CSV string was used, if a single string
  // value was passed, and `string` is not a valid datatype, consider it an array
  if (~dt.indexOf('array') && val) {

    // Check if restify has already cast to array, `?prop[0]=a&prop[1]=b
    if (type === 'array') {
      ok = true

    // Assume serialized array, attempt to JSON decode
    } else if (type === 'string' && val.indexOf('[') === 0) {
      try {
        obj[prop] = JSON.parse(val)
        ok = true
      } catch(e) {

        // The only other value of the var could be a string, if not specified,
        // return a parameter error
        if (!~dt.indexOf('string')) {
          var msg = ''
            + 'Invalid param `' + label + '`'
            + ', malformed array: `' + e.message + '`'

          return new restify.InvalidArgumentError(msg)
        }
      }

    // Assume a CSV string
    } else if (type === 'string' && ~val.indexOf(',')) {
      obj[prop] = val.split(',')
      ok = true

    // Assume a single element array
    } else if (val && dt.length === 1) {
      obj[prop] = [val]
      ok = true
    }

    // If multiple datatypes, run each element of the array back through
    // the validator to get the normal checks and conversions. 
    // Ex: `['array', 'number']` ensure all elements are numbers
    val = obj[prop]

    if (ok && dt.length > 1 && Array.isArray(val)) {
      var subSpec = {
        dataTypes: _.without(dt, 'array')
      , dataValues: dv
      }

      var errs = _.compact(val.map(function(x, i) {
        return Respectify.isInvalid(val, i, subSpec, req, label + '.')
      }))

      if (errs.length) return _.flatten(errs)
    }

    // Type recast
    if (ok) type = utils.getType(val)
  }

  verbose('[isInvalid] array done: `%s` = `%s`', label, obj[prop])

  // If date is a valid type, check if we were given a date string or timestamp
  if (~dt.indexOf('date') && val) {
    if (type === 'date') {
      ok = true
    // Check to see if a valid timestamp was used, avoid casting
    // single element arrays into numbers. Ex: `+[340]`
    } else if (type !== 'array' && !isNaN(+val)) {
      var len = (val + '').length

      // TODO: Find a better way to determine miliseconds, seconds, and invalid numbers
      if (len === 13 || len === 10) {
        obj[prop] = new Date(len === 10 ? +val * 1000 : +val)
        ok = true
      }
    } else if (type === 'string') {
      // Check if the string could be parsed by the date formatter
      var parsed = utils.dateFormat(val)
      if (parsed) {
        obj[prop] = new Date(parsed)
        ok = true
      } else {
        // Check if the string could be parsed as a Date object
        var parsed = Date.parse(val)
        if (!isNaN(parsed)) {
          obj[prop] = new Date(parsed)
          ok = true
        }
      }
    }
  
    // Type recast
    if (ok) type = utils.getType(val)
  }

  verbose('[isInvalid] date done: `%s` = `%s`', label, obj[prop])

  // If a boolean is a valid type, see if we got a valid representation
  if (~dt.indexOf('boolean')) {
    if (type === 'boolean') {
      ok = true
    // Check if there is a boolean type string val
    } else if (type === 'string') {
      var low = val.toLowerCase()
      // Check for false
      if (low === 'false' || low === '0') {
        obj[prop] = false
        ok = true
      // Check for true
      } else if (low === 'true' || low === '1') {
        obj[prop] = true
        ok = true
      // Incoming params such as `?bool=` are set to empty strings, 
      // this is interpreted as existence and true
      } else if (val === '') {
        obj[prop] = true
        ok = true
      }
    // Check for 1/0 flags
    } else if (val === 1 || val === 0) {
      obj[prop] = !!val
      ok = true
    // Consider the existence of the property true
    } else if (type === 'undefined' && obj.hasOwnProperty(prop)) {
      obj[prop] = true
      ok = true
    }
  
    // Type recast
    if (ok) type = utils.getType(val)
  }

  verbose('[isInvalid] boolean done: `%s` = `%s`', label, obj[prop])

  // If number is a valid type, check if we can cast the value to a number
  if (~dt.indexOf('number') && !ok) {

    // check if we can cast the value to a number
    if ((type === 'string' || type === 'number') && !isNaN(+val)) {
      var min = spec.hasOwnProperty('min')
        , max = spec.hasOwnProperty('max')

      // If a min or max was set, check to see the value is within range
      if ((min && +val < spec.min) || (max && +val > spec.max)) {

        // Construct the error message depending on which constraints were set
        var msg = 'Invalid param `' + label + '`'
        if (min && max) msg += ', value must be between `' + spec.min + '` and `' + spec.max + '`'
        else if (min) msg += ', value must be higher than `' + spec.min + '`'
        else if (max) msg += ', value must be lower than `' + spec.max + '`'
        msg += ', received `' + val + '`'

        return new restify.InvalidArgumentError(msg)
      }
      obj[prop] = +val
      ok = true
    }
  
    // Type recast
    if (ok) type = utils.getType(val)
  }

  verbose('[isInvalid] number done: `%s` = `%s`', label, obj[prop])

  // Check for strings
  if (~dt.indexOf('string') && !ok) {
    // Already string value
    if (type === 'string') {
      ok = true
    // Consider property existence as empty string
    } else if (!val) {
      obj[prop] = ''
      ok = true
    }
  
    // Type recast
    if (ok) type = utils.getType(val)
  }

  verbose('[isInvalid] string done: `%s` = `%s`', label, obj[prop])

  // Grab new converted value
  val = obj[prop]

  // Check for specific valid values
  if (dv && dv.length) {
    ok = false

    // Check all elements of the value array against the list
    if (Array.isArray(val) && val.length) {
      // Test that there are no bad elements
      ok = !val.filter(function(x) {
        return !~dv.indexOf(x)
      }).length
    // Check the list for the given converted value
    } else if (~dv.indexOf(val)) {
      ok = true
    }

    // Invalid value specified, optional or not
    if (!ok) {
      var msg = ''
        + 'Invalid param `' + label + '`'
        + ', valid values are `' + dv.join(', ') + '`'
        + ', received `' + val + '`'

      return new restify.InvalidArgumentError(msg)
    }
  }

  // Validation passed, continue on with custom validation and transforms
  if (ok) {

    // Check for custom validation function
    if (spec.validate) {
      var err = spec.validate(val, req, spec)
      if (err) return err
    }

    // Check for post-validation transformation function, always use the 
    // value given by the transform, should not be called otherwise
    if (spec.transform) obj[prop] = spec.transform(val, req, spec)

    // All is well
    return false
  }

  // Possible type received for error output
  var received = type

  // Show possible number interpretation
  if (type !== 'number' && val && !isNaN(+val)) {
    received += '|number'
  }

  // Show possible boolean interpretation
  if (type !== 'boolean' && (val === '0' || val === '1')) {
    received += '|boolean'
  }

  // Show possible object interpretation
  if (type === 'string' && val && val.indexOf('{') === 0) {
    received += '|object'
  }

  // Show possible array interpretation
  if (type === 'string' && val && val.indexOf('[') === 0) {
    received += '|array'
  }

  debug('[isInvalid] invalid prop=`%s` val=`%s` allowed=`%s` recieved=`%s`', label, val, dt, received)

  // Invalid parameter supplied
  var msg = ''
    + 'Invalid param `' + label + '`'
    + ', valid types are `' + dt.join('|') + '`'
    + ', received `' + received + '`'

  return new restify.InvalidArgumentError(msg)
}

/**
 * Verify that the param target is valid, since the `target` is
 * used by reference and modified in-place, we must make sure that
 * we are only changing `req.query`, `req.params`, or `req.body`
 *
 * @param {String} request parameter extraction target
 */

Respectify.prototype.validateTarget = function(target) {
  if (!~TARGETS.indexOf(target)) {
    throw new Error(''
      + 'Invalid `paramTarget` option, '
      + 'valid options are `' + TARGETS.join(',') + '`. '
      + 'recieved `' + target + '`'
    )
  }
  return this
}

/**
 * Normalize filterParams option
 *
 * @param {Any} filter option
 * @return {Array|Boolean} input targets to filter
 * @api public
 */

Respectify.prototype.normalizeParamFilter = function(filter) {
  if (!filter) {
    return false
  }
  // Single input target
  if (typeof filter === 'string') {
    this.validateTarget(filter)
    return [filter]
  }
  // Specific input targets only
  if (Array.isArray(filter)) {
    filter.forEach(this.validateTarget)
    return filter
  }
  // Filter all input targets
  return TARGETS.slice()
}

/**
 * Validation middleware, validates any route that has defined
 * parameters according to the spec, ignores otherwise
 *
 * @param {Object} request object
 * @param {Object} response object
 * @param {Function} callback
 * @api public
 */

Respectify.prototype.middleware = function(options) {
  var self = this

  options || (options = {})

  // Default middleware options if not specified
  options.hasOwnProperty('mapParams') || (options.mapParams = true)
  options.hasOwnProperty('filterParams') || (options.filterParams = true)
  options.hasOwnProperty('jsonp') || (options.jsonp = true)

  // Normalize filterParams option
  options.filterParams = this.normalizeParamFilter(options.filterParams)

  // Param filter whitelist
  var whitelist = options.paramWhitelist || [];

  if (!Array.isArray(whitelist)) {
    throw new Error('The `paramWhitelist` options must be an array.')
  }

  // If JSONP, ensure specific params are not filtered for restify middleware
  if (options.jsonp && options.filterParams) {
    arrayDefaults(whitelist, [
      'callback'
    , 'jsonp'
    ])
  }

  return function(req, res, next) {
    var invalid = []
      , version = req.version()
      , spec = self.getSpecByRoute(req.route)
      , target = self.options.paramTarget
      , reqParams = {}
      , hasParams = spec.hasOwnProperty('parameters')

    debug('[middleware] route=`%s` version=`%s` found=`%s`', req.route.path, version, hasParams)

    // No parameters have been defined for the route, do nothing
    if (!hasParams) {
      return next();
    }

    // Check for route specific parameter target
    if (spec.paramTarget) {
      target = spec.paramTarget
      self.validateTarget(target)
    }

    // The route has opted-in, but required no parameters
    if (!spec.parameters.length) {
      // Empty non-whitelisted parameter sources since no params are defined
      if (options.filterParams) {
        options.filterParams.forEach(function(t) {
          if (!req[t] || utils.getType(req[t]) !== 'object') return
          if (!whitelist || !whitelist.length) return req[t] = {}
          for (var prop in req[t]) {
            if (!req[t].hasOwnProperty(prop)) continue
            if (~whitelist.indexOf(prop)) continue
            delete req[t][prop]
          }
        })
      }
      return next()
    }

    // Valid property names
    var validProps = spec.parameters.map(function(x) {
      return x.name
    })

    // Iterate through all defined parameters and test against sent params
    spec.parameters.forEach(function(param) {
      var pName = param.name

      // Find the parameter source target, always check `req.params` first
      // in case of `queryParser` type middleware mappings
      var use = target
      if (!use) {
        if (req.params.hasOwnProperty(pName)) use = 'params'
        else if (param.paramType === 'querystring') use = 'query'
        else if (param.paramType === 'post') use = 'body'
        else use = 'params'
      }

      // Check for param input errors, add to list if found
      var err = Respectify.isInvalid(req[use], pName, param, req)

      // Stop if any errors
      if (err) {
        if (Array.isArray(err)) invalid = invalid.concat(err)
        else invalid.push(err)
        return
      }

      // Check for restify-like parameter mapping, copying querystring 
      // and post data to the `params` object
      if (options.mapParams && use !== 'params' && req[use].hasOwnProperty(pName)) {
        req.params[pName] = req[use][pName]
      }
    })

    // Check to see if any of the parameters were invalid
    if (invalid.length) return next(invalid[0])

    // Remove all unknown parameters, filtered out instead of being included
    // as to not re-add optional undefined parameters back into obj
    if (options.filterParams) {
      options.filterParams.forEach(function(t) {
        var src = req[t]
        // Ensure the source is an object, restify does not always parse the `body`
        // in place, depending on the value of `mapParams` used
        if (utils.getType(src) !== 'object') return

        // Remove all non-whitelisted invalid properties
        for (var prop in src) {
          if (!src.hasOwnProperty(prop)) continue
          if (whitelist && ~whitelist.indexOf(prop)) continue
          if (~validProps.indexOf(prop)) continue
          delete src[prop]
        }
      })
    }

    // Everything has validated
    return next()
  }
}

/**
 * Get the specification for a given restify route object
 *
 * @param {Object} restify route
 * @return {Object} route spec
 * @api public
 */

Respectify.prototype.getSpecByRoute = function(route) {
  if (!route || utils.getType(route) !== 'object') {
    return false
  }
  var self = this
    , mount = this.server.router.mounts[route.name]
    , spec = mount.spec
    , required = mount.path[Object.keys(mount.path).pop()] || []
    , optional = spec.params || {}
    , params = []

  // Extend the optional route params with the pre-defined
  // global parameters sent at class instantiation
  if (this.globalParams) {
    for (var prop in this.globalParams) {
      if (!optional[prop]) optional[prop] = this.globalParams[prop]
    }
  }

  // Ensure this is a route capable of a spec
  if (!this.options.loadAll) {
    if (!route || !spec || !spec.hasOwnProperty('params')) {
      return false
    }
  }

  // Ensure placeholder object for all required path params, these are the 
  // route params that restify needs. Ex: `/users/:id` where `id` is the param
  required.forEach(function(name) {
    if (!optional.hasOwnProperty(name)) {
      optional[name] = {
        dataTypes: ['string']
      }
    }
  })

  // Iterate through all defined parameter definitions
  function getParams(obj) {
    var defs = []

    for (var name in obj) {
      var data = obj[name]
        , fromPath = ~required.indexOf(name)

      // If string, assume a single data type
      if (typeof data === 'string') {
        data = data.split(',')
      }

      // If array, assume array of data types
      if (Array.isArray(data)) {
        data = obj[name] = {
          dataTypes: data
        }
      }

      // Check for singular spelling
      if (data.dataType) {
        data.dataTypes = data.dataType
      }

      // Ensure datatypes is an array
      if (!Array.isArray(data.dataTypes)) {
        data.dataTypes = [data.dataTypes]
      }

      // Normalize data types
      var types = _.uniq((data.dataTypes || []).map(function(type) {
        return type && type.toLowerCase()
      }))

      // Parameter type / source
      var paramType = 'path'
      if (!fromPath) {
        // If not a URI param, check to see if a `post` source
        // was specified, otherwise default to `querystring`
        paramType = (data.paramType && data.paramType === 'post')
          ? 'post'
          : 'querystring'
      }

      // Parameter spec information
      var param = {
        name: name
      , required: fromPath ? true : !!data.required
      , paramType: paramType
      , dataTypes: types
      }

      // If we have a number, check if a min / max value was set
      if (~types.indexOf('number')) {
        if (data.hasOwnProperty('min')) param.min = +data.min;
        if (data.hasOwnProperty('max')) param.max = +data.max;
      }

      // Add in any extra information defined from options
      if (self.options.paramProperties) {
        self.options.paramProperties.forEach(function(prop) {
          if (data.hasOwnProperty(prop)) {
            param[prop] = data[prop]
          }
        })
      }

      // If we have an object type, check for sub-schemas
      if (~types.indexOf('object') && data.params) {
        param.params = getParams(data.params)
      }

      defs.push(param)
    }
    return defs
  }

  var params = getParams(optional)

  // Verify that the route has defined a `params` and that the route has any
  if (!spec.hasOwnProperty('params') && !params.length) {
    params = null
  }

  // Build the route definition
  var def = {
    route: spec.path
  , parameters: params
  , method: spec.method
  , versions: spec.versions
  }

  // Add any extra route information defined from options
  if (this.options.routeProperties) {
    this.options.routeProperties.forEach(function(prop) {
      if (spec.hasOwnProperty(prop)) {
        def[prop] = spec[prop]
      }
    })
  }

  return def
}

/**
 * Get the default parameters for a given route
 *
 * @param {String} route path
 * @param {String} version search (optional)
 * @return {Object} route defaults
 * @api public
 */

Respectify.prototype.getDefaults = function(path, version) {
  var defaults = {}
    , route = this.findRoutes(path, version)[0]

  if (!route) {
    return null
  }
  // Iterate through all parameters, if a default is found, add it to the
  // return value as a clone to prevent tampering with existing spec
  for (var prop in route.spec.params) {
    var param = route.spec.params[prop]
    if (param.hasOwnProperty('default')) {
      defaults[prop] = utils.clone(param.default)
    }
  }
  return defaults
}

/**
 * Get the spec for all routes, or a specific version if supplied
 *
 * @param {String} version search (optional)
 * @return {Array} route specs
 * @api public
 */

Respectify.prototype.loadSpecs = function(version) {
  var self = this
    , resp = []
    , methodRoutes = this.server.router.routes

  // Build routes for each request method
  for (var method in methodRoutes) {
    resp = resp.concat(methodRoutes[method].map(self.getSpecByRoute.bind(this)))
  }

  // Filter out all invalid routes / specs
  resp = resp.filter(function(x) {
    return x
  })

  // If a version was supplied, reduce the results to match
  if (version) {
    resp = resp.filter(function(x) {
      return validVersion(version, x)
    })
  }

  // Sort by route name
  return resp.sort(function(a, b) {
    if (a.route < b.route) return -1
    if (a.route > b.route) return 1
    return 0
  })
}

/**
 * Find all routes that match the given path, and version if supplied
 *
 * @param {String} route path
 * @param {String} version (optional)
 * @return {Array} restify route object
 * @api public
 */

Respectify.prototype.findRoutes = function(path, version) {
  var matched = []

  function v(obj) {
    var use
    if (obj.versions && obj.versions.length) use = obj.versions
    else if (obj.spec.versions && obj.spec.versions.length) use = obj.spec.versions
    else use = obj.spec.version
    if (!Array.isArray(use)) use = [use]
    use.sort(semver.rcompare)
    return use[0]
  }

  // Iterate through all defined routes
  for (var method in this.server.router.routes) {
    var routes = (this.server.router.routes[method] || []).slice()

    // Sort routes by version
    routes.sort(function(a, b) {
      return semver.rcompare(v(a), v(b))
    })

    routes.forEach(function(route) {
      var ok = !version || validVersion(version, route.spec)

      // Check if the paths match and the version is ok
      if (route.spec.path === path && ok) {
        matched.push(route)
      }
    })
  }

  return matched
}

/**
 * Find all routes that match the given path, and version if supplied
 *
 * @param {String} route path
 * @param {String} version (optional)
 * @return {Array} restify route object
 * @api public
 */

Respectify.prototype.find =
Respectify.prototype.findSpecs = function(path, version) {
  var self = this
    , routes = this.findRoutes(path, version)

  var specs = routes.map(function(x) {
    return self.getSpecByRoute(x)
  })
  if (path && version) {
    return specs[0]
  }
  return specs
}

/**
 * Get all versions available
 *
 * @return {Array} semver sorted versions
 * @api public
 */

Respectify.prototype.getVersions = function() {
  var specs = this.loadSpecs()
    , versions = []

  specs.forEach(function(spec) {
    spec.versions.forEach(function(x) {
      if (!~versions.indexOf(x)) versions.push(x)
    })
  })

  // Sort all versions high to low
  return versions.sort(semver.compare).reverse()
}

/**
 * Extract parameters from a given route
 * 
 * @param {String} route path
 * @param {String} route version
 * @return {Object} route parameters
 * @api public
 */

Respectify.prototype.getRouteParams = function(path, version) {
  var params = {}
  if (!path || !version) return params

  var spec = this.find(path, version)
  if (!spec || !spec.parameters) return params

  spec.parameters.forEach(function(p) {
    params[p.name] = utils.clone(p)
  })

  return params
}

/**
 * Merge the parameter definitions from a route at `path` for 
 * the given `version` with the supplied `params`
 *
 * @param {String} route path
 * @param {String} route version
 * @param {Object} params to merge
 * @return {Object} merged route parameters
 * @api public
 */

Respectify.prototype.getMergedParams = function(path, version, params) {
  var baseParams = this.getRouteParams(path, version)
    , args = [baseParams].concat(slice.call(arguments, 2))

  return _.extend.apply(null, args)
}

/*!
 * Module exports.
 */

module.exports = Respectify
