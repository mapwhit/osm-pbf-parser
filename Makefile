check: compile lint test

PROTO = $(wildcard proto/*.proto)
PROTO_JS = $(PROTO:proto/%.proto=lib/proto/%.js)

lib/proto/%.js: proto/%.proto
	./node_modules/.bin/pbf $< --no-write > $@

compile: $(PROTO_JS)

test/extracts/somes.osm.pbf:
	curl -s -o $@ http://peter.johnson.s3.amazonaws.com/somes.osm.pbf

lint:
	./node_modules/.bin/jshint *.js lib test

test: test/extracts/somes.osm.pbf $(PROTO_JS)
	./node_modules/.bin/tape test/*.js | ./node_modules/.bin/tap-min

clean:
	rm $(PROTO_JS)

.PHONY: check lint test clean compile
