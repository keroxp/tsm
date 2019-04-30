dist/tsm.js: src/tsm.ts
	npx tsc
clean:
	rm example/*.js
	rm -rf dist