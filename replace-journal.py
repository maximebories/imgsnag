with open('.jules/feather.md', 'r') as f:
    content = f.read()

content = content.replace("On heavy pages with many thousands of elements (e.g. 10k items), this blocks the main thread severely (~10ms per 10k items vs <0.1ms).", "On heavy pages with many thousands of elements (e.g. 10k items), this blocks the main thread severely (proven by local jsdom benchmarks).")

with open('.jules/feather.md', 'w') as f:
    f.write(content)
