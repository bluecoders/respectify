Routes
------

<% obj.specs.forEach(function(spec) { %>
### [<%= spec.route %>](#<%= spec.route.replace(/:|\//g, '').toLowerCase() %>)

Method: `<%= spec.method %>`

Versions: `<%= spec.versions.join('`, `') %>`

#### Parameters

<% (spec.parameters || []).forEach(function(param) { %>* `<%= param.name %>` - <%= param.description %>(`<%= param.dataTypes.join('`, `') %>`)<% if (!param.required) { %> (optional<% if (param.default) { %>, default `<%= param.default %>`<% } %>)<% } %><% if (param.dataValues && param.dataValues.length) { %>
  - Valid values are: `<%= param.dataValues.join('`, `') %>`<% } %>
<% }) %>
<% }) %>