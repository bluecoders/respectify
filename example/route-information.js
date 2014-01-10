'use strict';

// Add an OPTIONS catch all route to display available route information
//
// http://www.w3.org/Protocols/rfc2616/rfc2616-sec9.html#sec9.2

var assert = require('assert')
  , restify = require('restify')
  , Respectify = require('../index')
  , server = restify.createServer()
  , respect = new Respectify(server)
  , async = require('async')

// Setup middleware
server.use(restify.queryParser())
server.use(respect.middleware)

// Intercept all OPTIONS method requests, find all specifications for the 
// requested route / url for each other HTTP method
server.opts(/.+/, function(req, res, next) {
  var _method = req.method
    , methods = ['GET', 'POST', 'PUT', 'HEAD', 'DELETE']

  // Intended to represent the entire server
  if (req.url.replace('/', '') === '*') {
    return this.returnRoutes(req, res, next)
  }

  // Iterate through all HTTP methods to find possible routes
  async.mapSeries(methods, function(method, cb) {
    
    // Change the request method so restify can find the correct route
    req.method = method

    // Find the restify route object
    server.router.find(req, res, function(err, route, params) {
      if (err && err.statusCode !== 405) return cb(err)
      if (!route) return cb(null)
      return cb(null, respect.getSpecByRoute(route))
    })
  }, function(err, resp) {
    // Revert to the original method
    req.method = _method

    // Make sure a valid route was requested
    if (err || !resp || !resp.length) {
      return next(new restify.ResourceNotFoundError())
    }

    // Filter out all undefined routes
    res.send(200, resp.filter(function(x) { return x }))
  })
})

module.exports = server