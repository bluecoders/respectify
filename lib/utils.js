'use strict';

/*!
 * Module dependencies.
 */

var semver = require('semver')
  , toString = Object.prototype.toString

/**
 * Date string normalization
 *
 * Example:
 *
 *   YYYY/MM/DD
 *   YYYY-MM-DD
 *   MM-DD-YYYY
 *   YYYY-MM-DD HH:mm
 *   YYYY-MM-DD HH:mm:ss
 *   YYYY-MM-DD HH:mm:ss TMZ
 *
 * String search regex: yyyy-mm-dd(hh:mm(ss)(tmz|offset))
 *
 *   [0-9]{2,4}[\/-]
 *   [0-9]{2}[\/-]
 *   [0-9]{2,4}
 *   (
 *     \s?
 *     [0-9]{2}
 *     :[0-9]{2}
 *     (
 *       :[0-9]{2}
 *     )?
 *     (
 *       \s?
 *       (\+?)
 *       [a-zA-Z0-9]{3,4}
 *     )?
 *   )?

 * @param {String} date string
 * @return {String} normalized date string
 * @api private
 */

exports.dateFormat = function(str) {
  var dateRx = /[0-9]{2,4}[\/-][0-9]{2}[\/-][0-9]{2,4}/ // 2012-02-03 || 02/03/2012
    , timeRx = /(\s?[0-9]{2}:[0-9]{2}(:[0-9]{2})?)?/    // 03:55 || 03:55:01
    , tmzRx = /(\s?(\+?)[a-zA-Z0-9]{3,4})?/             // GMT || +0200
    , rx = new RegExp(dateRx.source + timeRx.source + tmzRx.source)
    , defaults = [null, ' 00:00', ':00', ' +0000']
    , match = str.match(rx)
    
  if (!match) {
    return false
  }
  for (var i = 1; i < 4; i++) {
    if (!match[i] && defaults[i]) {
      match[i] = defaults[i]
      match[0] += defaults[i]
    }
  }
  return match[0]
}

/**
 * Clone a given obj to prevent pass by reference
 *
 * @param {Any} val to clone
 * @return {Any} cloned val
 * @api private
 */

exports.clone = function(obj) {
  var type = exports.getType(obj)
    , resp = {}
    
  // Slice the array to return a copy
  if (type === 'array') {
    return obj.slice()
  }
  // Clone each property of the object recursively
  if (type === 'object') {
    for (var prop in obj) {
      resp[prop] = exports.clone(obj[prop])
    }
    return resp
  }
  // Value not passed by reference, ignore
  return obj
}

/**
 * Remove duplicate entries from an array in place
 *
 * @param {Array} input
 * @param {Array} unique input
 */

exports.uniq = function(arr) {
  for (var i = 0; i < arr.length; i++) {
    var val = arr[i]
      , idx = arr.indexOf(val)
      , lidx
      
    while (lidx = arr.lastIndexOf(val), idx !== lidx) {
      arr.splice(lidx, 1)
    }
  }
  return arr
}

/** 
 * Get the object type of any given value
 *
 * @param {Any} value
 * @return {String} value type
 * @api private
 */

exports.getType = function(val) {
  return toString.call(val)
    .replace('[object ', '')
    .replace(']', '')
    .toLowerCase()
}
