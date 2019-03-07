check: lint test

test/extracts/somes.osm.pbf:
	curl -s -o $@ http://peter.johnson.s3.amazonaws.com/somes.osm.pbf

lint:
	./node_modules/.bin/jshint *.js lib test

test: test/extracts/somes.osm.pbf
	./node_modules/.bin/tape test/*.js | ./node_modules/.bin/tap-min

.PHONY: check lint test
