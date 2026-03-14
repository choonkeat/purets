.PHONY: test test-e2e test-all check serve

test:
	@node test/run.mjs

test-e2e:
	@npx playwright test

test-all: test test-e2e

check:
	@node datats.mjs check $(FILE)

serve:
	@node datats.mjs serve .
