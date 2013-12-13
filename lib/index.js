'use strict'

/*!
 * Module dependencies.
 */

var semver = require('semver')
  , toString = Object.prototype.toString
  , utils = require('./utils')
  , restify

// Attempt to load restify from the parent project's node_modules, 
// if it does not exist, or we are testing, then load the local version
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

    // Missing required param
    if (spec.required) {
      return new restify.MissingParameterError('Param `' + prop + '` required')
    }
    
    // If there is a default value, use it and continue validation,
    // otherwise, consider valid since its optional and remove from obj
    if (spec.default) {
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
  if (~dt.indexOf('number') && !isNaN(+val)) {
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
    } else if (!~dt.indexOf('string')) {
      obj[prop] = [val]
      return false
    }
  }

  // Basic type checking match
  if (~dt.indexOf(type)) {
    return false
  }

  // Show possible number interpretation
  if (type !== 'number' && !isNaN(val)) {
    type += '|number'
  }

  // Show possible boolean interpretation
  if (type !== 'boolean' && (val === '0' || val === '1')) {
    type += '|boolean'
  }

  // Show possible object interpretation
  if (type !== 'object' && val.indexOf('{') === 0) {
    type += '|object'
  }

  // Show possible array interpretation
  if (type !== 'array' && val.indexOf('[') === 0) {
    type += '|array'
  }

  // Invalid parameter supplied
  var msg = ''
    + 'Invalid param `' + prop + '`'
    + ', valid types are `' + dt.join('|') + '`'
    + ', received `' + type + '`'
    
  return new restify.InvalidArgumentError(msg)
}

/** 
 * Respectify constructor
 *
 * @param {Object} restify server instance
 * @param {Object} options
 * @constructor
 * @api public
 */

function Respect(server, options) {
  this.server = server
  this.options = options || {}
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
 * Validation middleware, validates any route that has defined
 * parameters according to the spec, ignores otherwise
 *
 * @param {Object} request object
 * @param {Object} response object
 * @param {Function} callback
 * @api public
 */

Respect.prototype.middleware = function(req, res, next) {
  var invalid = []
    , version = utils.getVersion(req)
    , route = this.findRoutes(req.route.path, version)
    , spec = this.__getRouteSpec(route[0])
    , reqParams = {}

  // No parameters defined, opt-out
  if (!spec.parameters) {
    return next()
  }

  // The route has opted-in, but required no parameters
  if (!spec.parameters.length) {
    req.params = {}
    return next()
  }

  // Valid properties
  var validProps = spec.parameters.map(function(x) {
    return x.name
  })

  // Iterate through all defined parameters and test against sent params
  spec.parameters.forEach(function(param) {
    var err = isInvalid(req.params, param.name, param)
    if (err) {
      invalid.push(err)
    }
  })

  // Check to see if any of the parameters were invalid
  if (invalid.length) {
    return next(invalid[0])
  }

  // Remove all unknown parameters, filtered out instead of being included 
  // as to not re-add optional undefined parameters back into obj
  for (var prop in req.params) {
    if (!~validProps.indexOf(prop)) {
      delete req.params[prop]
    }
  }

  // Everything has validated
  return next()
}

/** 
 * Get the specification for a given restify route object
 *
 * @param {Object} restify route
 * @return {Object} route spec
 * @api public
 */

Respect.prototype.__getRouteSpec = function(route) {
  var spec = route.spec
    , required = route.path[Object.keys(route.path).pop()]
    , optional = spec.params || {}
    , params = []
    

  // Ensure placeholder object for all required path params
  required.forEach(function(name) {
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

    // Ensure datatypes is an array
    if (!Array.isArray(data.dataTypes)) {
      data.dataTypes = [data.dataTypes]
    }

    // Normalize data types
    var types = utils.uniq((data.dataTypes || []).map(function(type) {
      return type.toLowerCase()
    }))

    // Parameter spec information
    var param = {
      name: name.toLowerCase()
    , required: fromPath ? true : !!data.required
    , paramType: fromPath ? 'path' : 'querystring'
    , dataTypes: types
    }

    // Only add the default value if one has been defined
    if (data.default) {
      param.default = data.default
    }

    // Add specific valid data values only if defined
    if (data.dataValues) {
      param.dataValues = data.dataValues
    }

    // Add param information to the route spec
    params.push(param)
  }

  // Verify that the route has defined a `params` and that the route has any
  if (!spec.hasOwnProperty('params')) {
    params = null
  }

  // Build the route definition
  return {
    route: spec.path
  , parameters: params
  , method: spec.method
  , versions: spec.versions
  }
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
    resp = resp.concat(methodRoutes[method].map(self.__getRouteSpec))
  }

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
  
  // Iterate through all defined routes
  for (var method in this.server.router.routes) {
    var routes = this.server.router.routes[method] || []

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

/*!
 * Module exports.
 */

module.exports = Respect
