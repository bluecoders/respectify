'use strict';

/*!
 * Module dependencies.
 */

var semver = require('semver')
  , fs = require('fs')
  , toString = Object.prototype.toString
  , utils = require('./utils')

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
 * Determine if a property is invalid according to the spec
 *
 * @param {Object} prop container, passed for ref / transformation
 * @param {String} property name
 * @param {Object} route specification
 * @return {Boolean|Error} false or Error instance
 * @api private
 */

function isInvalid(obj, prop, spec) {
  var val = obj[prop]
    , type = utils.getType(val)
    , dt = spec.dataTypes
    , dv = spec.dataValues
    , prop = prop.toLowerCase()

  // No param value supplied
  if (type === 'undefined') {

    // Missing required param, check this before `default` as 
    // the two are conflicting concepts
    if (spec.required) {
      return new restify.MissingParameterError('Param `' + prop + '` required')
    }
    
    // If there is a default value, use it and continue validation,
    // otherwise, consider valid since its optional and remove from obj
    if (spec.hasOwnProperty('default')) {
      obj[prop] = typeof spec.default === 'function' 
        ? spec.default() 
        : spec.default
      return false
    } else {
      delete obj[prop]
      return false
    }
  }

  // Check for specific valid values
  if (dv && dv.length) {
    if (~dv.indexOf(val)) {
      return false
    }
    
    // Invalid value specified, optional or not
    if (type !== 'undefined') {
      var msg = ''
        + 'Invalid param `' + prop + '`'
        + ', valid values are `' + dv.join(', ') + '`'
        + ', received `' + val + '`'
        
      return new restify.InvalidArgumentError(msg)
    }
  }

  // If date is a valid type, check if we were given a date string or timestamp
  if (~dt.indexOf('date')) {

    // Check to see if a valid timestamp was used
    if (!isNaN(+val)) {
      if (val.length === 13 || val.length === 10) {
        obj[prop] = new Date(val.length === 10 ? +val * 1000 : +val)
        return false
      }
    } else {
      // Check if the string could be parsed by the date formatter
      var parsed = utils.dateFormat(val)
      if (parsed) {
        obj[prop] = new Date(parsed)
        return false
      }

      // Check if the string could be parsed as a Date object
      var parsed = Date.parse(val)
      if (!isNaN(parsed)) {
        obj[prop] = new Date(parsed)
        return false
      }
    }
  }

  // If a boolean is a valid type, see if we got a valid representation
  if (~dt.indexOf('boolean') && type === 'string') {
    var low = val.toLowerCase()
    if (low === 'false' || low === '0') {
      obj[prop] = false
      return false
    }
    if (low === 'true' || low === '1') {
      obj[prop] = true
      return false
    }
  }

  // If an object is a valid type, see if we can parse the value to JSON
  if (~dt.indexOf('object') && val.indexOf('{') === 0) {
    try {
      obj[prop] = JSON.parse(val)
      return false
    } catch (e) {

      // The only other value of the var could be a string, if not specified, 
      // return a parameter error
      if (!~dt.indexOf('string')) {
        var msg = ''
          + 'Invalid param `' + prop + '`'
          + ', malformed array: `' + e.message + '`'
          
        return new restify.InvalidArgumentError(msg)
      }
    }
  }

  // If number is a valid type, check if we can cast the value to a number
  if (~dt.indexOf('number') && val && !isNaN(+val)) {
    var min = spec.hasOwnProperty('min')
      , max = spec.hasOwnProperty('max')

    // If a min or max was set, check to see the value is within range
    if ((min && +val < spec.min) || (max && +val > spec.max)) {

      // Construct the error message depending on which constraints were set
      var msg = 'Invalid param `' + prop + '`'
      if (min && max) msg += ', value must be between `' + spec.min + '` and `' + spec.max + '`'
      else if (min) msg += ', value must be higher than `' + spec.min + '`'
      else if (max) msg += ', value must be lower than `' + spec.max + '`'
      msg += ', received `' + val + '`'
        
      return new restify.InvalidArgumentError(msg)
    }
    obj[prop] = +val
    return false
  }

  // If array is a valid type, check if a CSV string was used, if a single string
  // value was passed, and `string` is not a valid datatype, consider it an array
  if (~dt.indexOf('array')) {

    // Assume serialized array, attempt to JSON decode
    if (val.indexOf('[') === 0) {
      try {
        obj[prop] = JSON.parse(val)
        return false
      } catch(e) {

        // The only other value of the var could be a string, if not specified, 
        // return a parameter error
        if (!~dt.indexOf('string')) {
          var msg = ''
            + 'Invalid param `' + prop + '`'
            + ', malformed array: `' + e.message + '`'
            
          return new restify.InvalidArgumentError(msg)
        }
      }

    // Assume a CSV string
    } else if (~val.indexOf(',')) {
      obj[prop] = val.split(',')
      return false

    // Assume a single element array
    } else if (val && !~dt.indexOf('string')) {
      obj[prop] = [val]
      return false
    }
  }

  if (~dt.indexOf('string')) {
    if (val) return false
  }

  // Possible type received for error output
  var received = val ? type : 'undefined'

  // Show possible number interpretation
  if (type !== 'number' && val && !isNaN(+val)) {
    received += '|number'
  }

  // Show possible boolean interpretation
  if (type !== 'boolean' && (val === '0' || val === '1')) {
    received += '|boolean'
  }

  // Show possible object interpretation
  if (type !== 'object' && val.indexOf('{') === 0) {
    received += '|object'
  }

  // Show possible array interpretation
  if (type !== 'array' && val.indexOf('[') === 0) {
    received += '|array'
  }

  // Invalid parameter supplied
  var msg = ''
    + 'Invalid param `' + prop + '`'
    + ', valid types are `' + dt.join('|') + '`'
    + ', received `' + received + '`'
    
  return new restify.InvalidArgumentError(msg)
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

function Respect(server, options) {
  // Ensure valid construction
  if (!(this instanceof Respect)) {
    return new Respect(server, options)
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
  ])

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

Respect.factory = function(server, options) {
  return new Respect(server, options)
}

/**
 * Verify that the param target is valid, since the `target` is 
 * used by reference and modified in-place, we must make sure that 
 * we are only changing `req.query`, `req.params`, or `req.body`
 *
 * @param {String} request parameter extraction target
 */

Respect.prototype.validateTarget = function(target) {
  if (!~TARGETS.indexOf(target)) {
    throw new Error(''
      + 'Invalid `paramTarget` option, '
      + 'valid options are `' + valid.join(',') + '`. '
      + 'recieved `' + target + '`'
    )
  }
  return this
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

Respect.prototype.middleware = function(options) {
  var self = this
  
  options || (options = {})
  
  // Default param mapping / filtering if not specified
  options.hasOwnProperty('mapParams') || (options.mapParams = true)
  options.hasOwnProperty('filterParams') || (options.filterParams = true)

  return function(req, res, next) {
    var invalid = []
      , version = req.version()
      , spec = self.getSpecByRoute(req.route)
      , target = self.options.paramTarget
      , reqParams = {}

    // Check for route specific parameter target
    if (spec.paramTarget) {
      target = spec.paramTarget
      self.validateTarget(target)
    }

    // No parameters defined, opt-out
    if (!spec.parameters) {
      return next()
    }

    // The route has opted-in, but required no parameters
    if (!spec.parameters || !spec.parameters.length) {
      // Empty parameter sources since no params are defined
      if (options.filterParams) {
        TARGETS.forEach(function(t) {
          req[t] = {}
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
      // Find the parameter source target, always check `req.params` first 
      // in case of `queryParser` type middleware mappings
      var use = target
      if (!use) {
        if (req.params.hasOwnProperty(param.name)) use = 'params'
        else if (param.paramType === 'querystring') use = 'query'
        else if (param.paramType === 'post') use = 'body'
        else use = 'params'
      }
      // Check for param input errors, add to list if found
      var err = isInvalid(req[use], param.name, param)
      if (err) {
        invalid.push(err)
      } else if (options.mapParams) {
        // Map querystring and post data to the `params` object
        if (use !== 'params' && req[use].hasOwnProperty(param.name)) {
          req.params[param.name] = req[use][param.name]
        }
      }
    })

    // Check to see if any of the parameters were invalid
    if (invalid.length) {
      return next(invalid[0])
    }

    // Remove all unknown parameters, filtered out instead of being included 
    // as to not re-add optional undefined parameters back into obj
    if (options.filterParams) {
      TARGETS.forEach(function(t) {
        var src = req[t]
        // Ensure the source is an object, restify does not always parse the `body`
        // in place, depending on the value of `mapParams` used
        if (utils.getType(src) !== 'object') {
          return
        }
        for (var prop in src) {
          // Check if prop is valid, and that the source has the prop
          if (!~validProps.indexOf(prop) && src.hasOwnProperty(prop)) {
            delete src[prop]
          }
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

Respect.prototype.getSpecByRoute = function(route) {
  if (!route || utils.getType(route) !== 'object') {
    return false
  }
  var self = this
    , mount = this.server.router.mounts[route.name]
    , spec = mount.spec
    , required = mount.path[Object.keys(mount.path).pop()]
    , optional = spec.params || {}
    , params = []

  // Ensure this is a route capable of a spec
  if (!this.options.loadAll) {
    if (!route || !spec || !spec.hasOwnProperty('params')) {
      return false
    }
  }

  // Ensure placeholder object for all required path params
  required && required.forEach(function(name) {
    if (!optional.hasOwnProperty(name)) {
      optional[name] = {
        dataTypes: ['string']
      }
    }
  })

  // Iterate through all defined parameter definitions
  for (var name in optional) {
    var data = optional[name]
      , fromPath = ~required.indexOf(name)

    // If string, assume a single data type
    if (typeof data === 'string') {
      data = data.split(',')
    }
    
    // If array, assume array of data types
    if (Array.isArray(data)) {
      data = optional[name] = {
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
    var types = utils.uniq((data.dataTypes || []).map(function(type) {
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
      name: name.toLowerCase()
    , required: fromPath ? true : !!data.required
    , paramType: paramType
    , dataTypes: types
    }

    // If we have a number, check if a min / max value was set
    if (~types.indexOf('number')) {
      if (data.min) param.min = data.min;
      if (data.max) param.max = data.max;
    }

    // Add in any extra information defined from options
    if (self.options.paramProperties) {
      self.options.paramProperties.forEach(function(prop) {
        if (data.hasOwnProperty(prop)) {
          param[prop] = data[prop]
        }
      })
    }

    // Add param information to the route spec
    params.push(param)
  }

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

Respect.prototype.getDefaults = function(path, version) {
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

Respect.prototype.loadSpecs = function(version) {
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

Respect.prototype.findRoutes = function(path, version) {
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

Respect.prototype.find =
Respect.prototype.findSpecs = function(path, version) {
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
 */

Respect.prototype.getVersions = function() {
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

/*!
 * Module exports.
 */

module.exports = Respect
