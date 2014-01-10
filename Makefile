SHELL := /bin/bash

test:
	mocha -R spec test.js

hint:
	jshint *.js lib/*.js example/*.js --extra-ext .json

.PHONY: hint clean config test
