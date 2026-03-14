.PHONY: test test-e2e test-all check edit

test:
	@node test/run.mjs

test-e2e:
	@npx playwright test

test-all: test test-e2e

check:
	@node purets.mjs check $(FILE)

edit:
	@node purets.mjs edit $(or $(PATH_ARG),.)
