const _ = require('lodash');
const varType = require('var-type');
const utils = require('./utils');
const slice = Array.prototype.slice;
const rErrors = require('restify-errors');

// Valid parameter targets / sources
const TARGETS = ['params', 'query', 'body'];

function errorWrap(err, param, sent) {
	if (err instanceof rErrors.RestError) {
		err.body.parameter = param;
		err.body.received = sent;
	}
	return err;
}

function arrayDefaults(arr, values) {
	return [...arr, ...values.filter(val => !arr.find(item => val === item))];
}

function Respectify(server, options = {}) {
	this.server = server;

	this.options = options;
	this.globalParams = this.options.params || {};

	this.options.routeProperties = this.options.routeProperties || ['description'];
	this.options.paramProperties = this.options.paramProperties || ['description'];

	// Route property internal extras
	this.options.routeProperties = arrayDefaults(this.options.routeProperties, [
		'paramTarget',
	]);

	// Parameter property internal extras
	this.options.paramProperties = arrayDefaults(this.options.paramProperties, [
		'default',
		'dataValues',
		'transform',
		'validate',
	]);

	this.middleware = this.middleware.bind(this);
}

Respectify.prototype.middleware = function(options = {}) {
	// Default middleware options if not specified
	options.mapParams = options.mapParams || true;
	options.filterParams = options.filterParams || true;
	options.jsonp = options.jsonp || true;

	// Normalize filterParams option
	options.filterParams = this.normalizeParamFilter(options.filterParams);

	// Param filter whitelist
	let whitelist = options.paramWhitelist || [];

	if (!Array.isArray(whitelist)) {
		throw new Error('The `paramWhitelist` options must be an array.');
	}

	// If JSONP, ensure specific params are not filtered for restify middleware
	if (options.jsonp && options.filterParams) {
		whitelist = arrayDefaults(whitelist, [
			'callback',
			'jsonp',
		]);
	}

	return (req, res, next) => {
		let invalid = [];
		const spec = this.getSpecByRoute(req.route);
		let target = this.options.paramTarget;
		const hasParams = _.has(spec, 'parameters');

		// No parameters have been defined for the route, do nothing
		if (!hasParams) {
			return next();
		}

		// Check for route specific parameter target
		if (spec.paramTarget) {
			target = spec.paramTarget;
			this.validateTarget(target);
		}

		// The route has opted-in, but required no parameters
		if (!spec.parameters.length) {
			// Empty non-whitelisted parameter sources since no params are defined
			if (options.filterParams) {
				options.filterParams.forEach(t => {
					if (!req[t] || !varType(req[t], 'Object')) return;

					if (!whitelist || !whitelist.length) {
						req[t] = {};
						return req[t];
					}

					for (const prop in req[t]) {
						if (!_.has(req[t], prop)) continue;
						if (whitelist.indexOf(prop) >= 0) continue;
						delete req[t][prop];
					}
				});
			}
			return next();
		}

		// Valid property names
		const validProps = spec.parameters.map(x => x.name);

		// Iterate through all defined parameters and test against sent params
		spec.parameters.forEach(param => {
			const pName = param.name;

			// Find the parameter source target, always check `req.params` first
			// in case of `queryParser` type middleware mappings
			let use = target;
			if (!use) {
				if (_.has(req.params, pName)) use = 'params';
				else if (param.paramType === 'querystring') use = 'query';
				else if (param.paramType === 'post') use = 'body';
				else use = 'params';
			}

			// Check for param input errors, add to list if found
			const err = Respectify.isInvalid(req[use], pName, param, req);

			// Stop if any errors
			if (err) {
				if (Array.isArray(err)) invalid = invalid.concat(err);
				else invalid.push(err);
				return;
			}

			// Check for restify-like parameter mapping, copying querystring
			// and post data to the `params` object
			if (options.mapParams && use !== 'params' && _.has(req[use], pName)) {
				req.params[pName] = req[use][pName];
			}
		});

		// Check to see if any of the parameters were invalid
		if (invalid.length) return next(invalid[0]);

		// Remove all unknown parameters, filtered out instead of being included
		// as to not re-add optional undefined parameters back into obj
		if (options.filterParams) {
			options.filterParams.forEach(t => {
				const src = req[t];
				// Ensure the source is an object, restify does not always parse the `body`
				// in place, depending on the value of `mapParams` used
				if (!varType(src, 'Object')) return;

				// Remove all non-whitelisted invalid properties
				for (const prop in src) {
					if (!_.has(src, prop)) continue;
					if (whitelist && whitelist.indexOf(prop) >= 0) continue;
					if (validProps.indexOf(prop) >= 0) continue;
					delete src[prop];
				}
			});
		}

		// Everything has validated
		return next();
	};
};

Respectify.isInvalid = function(obj, prop, spec, req, prefix) {
	let msg;
	let err;
	let val = obj[prop];
	let	type = varType(val).toLowerCase();
	const dt = spec.dataTypes;
	const dv = spec.dataValues;
	let	ok = dt.indexOf(type) >= 0;
	const label = (prefix || '') + prop;

	// No param value supplied, check for required param
	if (!_.has(obj, prop) && spec.required) {
		const err = new rErrors.MissingParameterError(`Param \`${label}\` required`);
		return errorWrap(err, spec, val);
	}

	// No param value supplied
	if (!_.has(obj, prop)) {
		// If there is a default value, use it and continue validation
		if (_.has(spec, 'default')) {
			obj[prop] = typeof spec.default === 'function' ?
						spec.default(req, spec) :
						spec.default;

			// Recast val and type to use default
			val = obj[prop];
			type = varType(val).toLowerCase();
		} else {
			return false;
		}
	}

	// If array is a valid type, check if a CSV string was used, if a single string
	// value was passed, and `string` is not a valid datatype, consider it an array
	if (dt.indexOf('array') >= 0 && val) {
		// Check if restify has already cast to array, `?prop[0]=a&prop[1]=b
		if (type === 'array') {
			ok = true;

			// Assume serialized array, attempt to JSON decode
		} else if (type === 'string' && val.indexOf('[') === 0) {
			try {
				obj[prop] = JSON.parse(val);
				ok = true;
			} catch (e) {
				// The only other value of the const could be a string, if not specified,
				// return a parameter error
				if (dt.indexOf('string') < 0) {
					msg = `${'' +
						  'Invalid param `'}${label}\`` +
						  `, malformed array: \`${e.message}\``;

					err = new rErrors.InvalidArgumentError('%s', msg);
					return errorWrap(err, spec, val);
				}
			}

			// Assume a CSV string
		} else if (type === 'string' && val.indexOf(',') >= 0) {
			obj[prop] = val.split(',');
			ok = true;

			// Assume a single element array
		} else if (val && dt.length === 1) {
			obj[prop] = [val];
			ok = true;
		}

		// If multiple datatypes, run each element of the array back through
		// the validator to get the normal checks and conversions.
		// Ex: `['array', 'number']` ensure all elements are numbers
		val = obj[prop];

		// This should be the only test that runs if triggered
		if (ok && dt.length > 1 && Array.isArray(val)) {
			const subSpec = _.extend({}, _.omit(spec, [
				'dataTypes',
			]), {
				dataTypes: _.without(dt, 'array'),
			});

			const errs = _.compact(val.map((x, i) => Respectify.isInvalid(
				val
				, i
				, subSpec
				, req
				, `${label}.`
			)));

			if (errs.length) return _.flatten(errs);
		}

		// Type recast
		if (ok) type = varType(val).toLowerCase();
	}

	// If an object is a valid type, see if we can parse the value to JSON
	if (dt.indexOf('object') >= 0 && type !== 'array') {
		if (type === 'object') {
			obj[prop] = val;
			ok = true;
			// Check if it looks like an object and attempt to parse
		} else if (type === 'string' && val.indexOf('{') === 0) {
			try {
				obj[prop] = JSON.parse(val);
				ok = true;
			} catch (e) {
				// The only other value of the const could be a string, if not specified,
				// return a parameter error
				if (dt.indexOf('string') < 0) {
					msg = `${'' +
						  'Invalid param `'}${label}\`` +
						  `, malformed object: \`${e.message}\``;

					err = new rErrors.InvalidArgumentError('%s', msg);
					return errorWrap(err, spec, val);
				}
			}
		}

		// Check for object sub-schema params
		if (ok && spec.params) {
			const errs = _.compact(spec.params.map(param => Respectify.isInvalid(
				obj[prop]
				, param.name
				, param
				, req
				, `${label}.`
			)));

			if (errs.length) return _.flatten(errs);
		}

		// Type recast
		if (ok) type = varType(val).toLowerCase();
	}

	// If date is a valid type, check if we were given a date string or timestamp
	if (dt.indexOf('date') >= 0 && val) {
		if (type === 'date') {
			ok = true;
			// Check to see if a valid timestamp was used, avoid casting
			// single element arrays into numbers. Ex: `+[340]`
		} else if (type !== 'array' && !isNaN(Number(val))) {
			const len = `${val}`.length;

			// TODO: Find a better way to determine miliseconds, seconds, and invalid numbers
			if (len === 13 || len === 10) {
				obj[prop] = new Date(len === 10 ? Number(val) * 1000 : Number(val));
				ok = true;
			}
		} else if (type === 'string') {
			// Check if the string could be parsed by the date formatter
			const parsed = utils.dateFormat(val);
			if (parsed) {
				obj[prop] = new Date(parsed);
				ok = true;
			} else {
				// Check if the string could be parsed as a Date object
				const parsed = Date.parse(val);
				if (!isNaN(parsed)) {
					obj[prop] = new Date(parsed);
					ok = true;
				}
			}
		}

		// Type recast
		if (ok) type = varType(val).toLowerCase();
	}

	// If a boolean is a valid type, see if we got a valid representation
	if (dt.indexOf('boolean') >= 0) {
		if (type === 'boolean') {
			ok = true;
			// Check if there is a boolean type string val
		} else if (type === 'string') {
			const low = val.toLowerCase();
			// Check for false
			if (low === 'false' || low === '0') {
				obj[prop] = false;
				ok = true;
				// Check for true
			} else if (low === 'true' || low === '1') {
				obj[prop] = true;
				ok = true;
				// Incoming params such as `?bool=` are set to empty strings,
				// this is interpreted as existence and true
			} else if (val === '') {
				obj[prop] = true;
				ok = true;
			}
			// Check for 1/0 flags
		} else if (val === 1 || val === 0) {
			obj[prop] = Boolean(val);
			ok = true;
			// Consider the existence of the property true
		} else if (type === 'undefined' && _.has(obj, prop)) {
			obj[prop] = true;
			ok = true;
		}

		// Type recast
		if (ok) type = varType(val).toLowerCase();
	}

	// If number is a valid type, check if we can cast the value to a number
	if (dt.indexOf('number') >= 0 && !ok) {
		// check if we can cast the value to a number
		if ((type === 'string' || type === 'number') && !isNaN(Number(val))) {
			const min = _.has(spec, 'min');
			const max = _.has(spec, 'max');

			// If a min or max was set, check to see the value is within range
			if ((min && Number(val) < spec.min) || (max && Number(val) > spec.max)) {
				// Construct the error message depending on which constraints were set
				let msg = `Invalid param \`${label}\``;
				if (min && max) msg += `, value must be between \`${spec.min}\` and \`${spec.max}\``;
				else if (min) msg += `, value must be higher than \`${spec.min}\``;
				else if (max) msg += `, value must be lower than \`${spec.max}\``;
				msg += `, received \`${val}\``;

				const err = new rErrors.InvalidArgumentError('%s', msg);
				return errorWrap(err, spec, val);
			}
			obj[prop] = Number(val);
			ok = true;
		}

		// Type recast
		if (ok) type = varType(val).toLowerCase();
	}

	// Check for strings
	if (dt.indexOf('string') >= 0 && !ok) {
		// Already string value
		if (type === 'string') {
			ok = true;
			// Consider property existence as empty string
		} else if (!val) {
			obj[prop] = '';
			ok = true;
		}

		// Type recast
		if (ok) type = varType(val).toLowerCase();
	}

	// Grab new converted value
	val = obj[prop];

	// Check for specific valid values
	if (dv && dv.length) {
		ok = false;

		// Check all elements of the value array against the list
		if (Array.isArray(val)) {
			// Test that there are no bad elements
			ok = val.length === 0 || !val.filter(x => dv.indexOf(x) < 0).length;

			// Check the list for the given converted value
		} else if (dv.indexOf(val) >= 0) {
			ok = true;
		}

		// Invalid value specified, optional or not
		if (!ok) {
			const msg = `${'' +
						'Invalid param `'}${label}\`, ` +
						`valid values are \`${dv.join(', ')}\`, ` +
						`received \`${val}\``;

			const err = new rErrors.InvalidArgumentError('%s', msg);
			return errorWrap(err, spec, val);
		}
	}

	// Validation passed, continue on with custom validation and transforms
	if (ok) {
		// Only apply validate and transform methods to top level value
		if (prefix) return false;

		// Check for custom validation function
		if (spec.validate) {
			const err = spec.validate(val, req, spec);
			if (err) return errorWrap(err, spec, val);
		}

		// Check for post-validation transformation function, always use the
		// value given by the transform, should not be called otherwise
		if (spec.transform) obj[prop] = spec.transform(val, req, spec);

		// All is well
		return false;
	}

	// Possible type received for error output
	let received = type;

	// Show possible number interpretation
	if (type !== 'number' && val && !isNaN(Number(val))) {
		received += '|number';
	}

	// Show possible boolean interpretation
	if (type !== 'boolean' && (val === '0' || val === '1')) {
		received += '|boolean';
	}

	// Show possible object interpretation
	if (type === 'string' && val && val.indexOf('{') === 0) {
		received += '|object';
	}

	// Show possible array interpretation
	if (type === 'string' && val && val.indexOf('[') === 0) {
		received += '|array';
	}

	// Invalid parameter supplied
	msg = `${'' +
		  'Invalid param `'}${label}\`` +
		  `, valid types are \`${dt.join('|')}\`` +
		  `, received \`${received}\``;

	err = new rErrors.InvalidArgumentError('%s', msg);
	return errorWrap(err, spec, val);
};

Respectify.prototype.validateTarget = function(target) {
	if (TARGETS.indexOf(target) < 0) {
		throw new Error(`${'' +
						'Invalid `paramTarget` option, ' +
						'valid options are `'}${TARGETS.join(',')}\`. ` +
						`recieved \`${target}\``);
	}
	return this;
};

Respectify.prototype.normalizeParamFilter = function(filter) {
	if (!filter) {
		return false;
	}
	// Single input target
	if (typeof filter === 'string') {
		this.validateTarget(filter);
		return [filter];
	}
	// Specific input targets only
	if (Array.isArray(filter)) {
		filter.forEach(this.validateTarget);
		return filter;
	}
	// Filter all input targets
	return TARGETS.slice();
};

Respectify.prototype.getSpecByRoute = function(route) {
	if (!route || !varType(route, 'Object')) {
		return false;
	}
	// eslint-disable-next-line consistent-this
	const self = this;
	const mount = this.server.router._registry._routes[route.name];
	const spec = mount.spec;
	const required = mount.path.split('/').filter(a => a[0] === ':').map(a => a.slice(1)) || [];
	const optional = spec.params || {};
	let params = [];

	// Extend the optional route params with the pre-defined
	// global parameters sent at class instantiation
	if (this.globalParams) {
		for (const prop in this.globalParams) {
			if (!optional[prop]) optional[prop] = this.globalParams[prop];
		}
	}

	// Ensure this is a route capable of a spec
	if (!this.options.loadAll) {
		if (!route || !spec || !_.has(spec, 'params')) {
			return false;
		}
	}

	// Ensure placeholder object for all required path params, these are the
	// route params that restify needs. Ex: `/users/:id` where `id` is the param
	required.forEach(name => {
		if (!_.has(optional, name)) {
			optional[name] = {
				dataTypes: ['string'],
			};
		}
	});

	// Iterate through all defined parameter definitions
	function getParams(obj) {
		const defs = [];

		for (const name in obj) {
			let data = obj[name];
			const fromPath = required.indexOf(name) >= 0;

			// If string, assume a single data type
			if (typeof data === 'string') {
				data = data.split(',');
			}

			// If array, assume array of data types
			if (Array.isArray(data)) {
				obj[name] = { dataTypes: data };
				data = obj[name];
			}

			// Check for singular spelling
			if (data.dataType) {
				data.dataTypes = data.dataType;
			}

			// Ensure datatypes is an array
			if (!Array.isArray(data.dataTypes)) {
				data.dataTypes = [data.dataTypes];
			}

			// Normalize data types
			const types = _.uniq((data.dataTypes || []).map(type => type && type.toLowerCase()));

			// Parameter type / source
			let paramType = 'path';
			if (!fromPath) {
				// If not a URI param, check to see if a `post` source
				// was specified, otherwise default to `querystring`
				paramType = data.paramType && data.paramType === 'post' ?
							'post' :
							'querystring';
			}

			// Parameter spec information
			const param = {
				name,
				required: fromPath ? true : Boolean(data.required),
				paramType,
				dataTypes: types,
			};

			// If we have a number, check if a min / max value was set
			if (types.indexOf('number') >= 0) {
				if (_.has(data, 'min')) param.min = Number(data.min);
				if (_.has(data, 'max')) param.max = Number(data.max);
			}

			// Add in any extra information defined from options
			if (self.options.paramProperties) {
				self.options.paramProperties.forEach(prop => {
					if (_.has(data, prop)) {
						param[prop] = data[prop];
					}
				});
			}

			// If we have an object type, check for sub-schemas
			if (types.indexOf('object') >= 0 && data.params) {
				param.params = getParams(data.params);
			}

			defs.push(param);
		}
		return defs;
	}

	params = getParams(optional);

	// Verify that the route has defined a `params` and that the route has any
	if (!_.has(spec, 'params') && !params.length) {
		params = null;
	}

	// Build the route definition
	const def = {
		route: spec.path,
		parameters: params,
		method: spec.method,
		versions: spec.versions,
	};

	// Add any extra route information defined from options
	if (this.options.routeProperties) {
		this.options.routeProperties.forEach(prop => {
			if (_.has(spec, prop)) {
				def[prop] = spec[prop];
			}
		});
	}

	return def;
};

Respectify.prototype.getDefaults = function(path, version) {
	const defaults = {};
	const [route] = this.findRoutes(path, version);

	if (!route) {
		return null;
	}
	// Iterate through all parameters, if a default is found, add it to the
	// return value as a clone to prevent tampering with existing spec
	for (const prop in route.spec.params) {
		const param = route.spec.params[prop];
		if (_.has(param, 'default')) {
			defaults[prop] = _.clone(param.default);
		}
	}
	return defaults;
};

Respectify.prototype.loadSpecs = function(version) {
	// eslint-disable-next-line consistent-this
	const self = this;
	let resp = [];
	const methodRoutes = this.server.router.routes;

	// Build routes for each request method
	for (const method in methodRoutes) {
		resp = resp.concat(methodRoutes[method].map(self.getSpecByRoute.bind(this)));
	}

	// Filter out all invalid routes / specs
	resp = resp.filter(x => x);

	// If a version was supplied, reduce the results to match
	if (version) {
		resp = resp.filter(x => validVersion(version, x));
	}

	// Sort by route name
	return resp.sort((a, b) => {
		if (a.route < b.route) return -1;
		if (a.route > b.route) return 1;
		return 0;
	});
};

Respectify.prototype.findRoutes = function(path, version) {
	const matched = [];

	function v(obj) {
		let use;
		if (obj.versions && obj.versions.length) use = obj.versions;
		else if (obj.spec.versions && obj.spec.versions.length) use = obj.spec.versions;
		else use = obj.spec.version;
		if (!Array.isArray(use)) use = [use];
		return use[0];
	}

	// Iterate through all defined routesé
	for (const method in this.server.router.routes) {
		const routes = (this.server.router.routes[method] || []).slice();

		routes.forEach(route => {
			const ok = !version || validVersion(version, route.spec);

			// Check if the paths match and the version is ok
			if (route.spec.path === path && ok) {
				matched.push(route);
			}
		});
	}

	return matched;
};

Respectify.prototype.findSpecs = function(path, version) {
	// eslint-disable-next-line consistent-this
	const self = this;
	const routes = this.findRoutes(path, version);

	const specs = routes.map(x => self.getSpecByRoute(x));
	if (path && version) {
		return specs[0];
	}
	return specs;
};

Respectify.prototype.find = function(path, version) {
	// eslint-disable-next-line consistent-this
	const self = this;
	const routes = this.findRoutes(path, version);

	const specs = routes.map(x => self.getSpecByRoute(x));
	if (path && version) {
		return specs[0];
	}
	return specs;
};

Respectify.prototype.getRouteParams = function(path, version) {
	const params = {};
	if (!path || !version) return params;

	const spec = this.find(path, version);
	if (!spec || !spec.parameters) return params;

	spec.parameters.forEach(p => {
		params[p.name] = _.merge({}, p);
	});

	return params;
};

Respectify.prototype.getMergedParams = function(path, version, ...args) {
	const baseParams = this.getRouteParams(path, version);

	const argu = [baseParams].concat(slice.call(args, 2));

	return _.extend.apply(null, argu);
};


module.exports = Respectify;
