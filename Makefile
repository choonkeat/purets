.PHONY: test check serve

test:
	@node test/run.mjs

check:
	@node tjson.mjs check $(FILE)

serve:
	@node tjson.mjs serve .
