
### Table of Contents

-----

* [Routes](#routes)
<% obj.specs.forEach(function(spec) { %>  - [<%= spec.route %>](#<%= spec.route.replace(/:|\//g, '').toLowerCase() %>)
<% }) %>

### Routes

-----

<% obj.specs.forEach(function(spec) { %>
#### [<%= spec.route %>](#<%= spec.route.replace(/:|\//g, '').toLowerCase() %>)
<% if (spec.description) { %>
<%= spec.description %>
<% } %>
Method: `<%= spec.method %>`<br />
Versions: `<%= spec.versions.join('`, `') %>`
<% if (spec.parameters && spec.parameters.length) { %>
##### Parameters

<% (spec.parameters || []).forEach(function(param) { %>* `<%= param.name %>` -<% if (param.description) { %> <%= param.description %><% } %> (`<%= param.dataTypes.join('`, `') %>`)<% if (!param.required) { %> (optional<% if (param.default) { %>, default `<%= param.default %>`<% } %>)<% } %><% if (param.dataValues && param.dataValues.length) { %>
  - Valid values are: `<%= param.dataValues.join('`, `') %>`<% } %><% (param.notes || []).forEach(function(note) { %>
  - ***Note:*** <%= note %><% }) %>
<% }) %><% } %>
<br />
<% }) %>
-----

Generated on <%= new Date().toUTCString() %>
